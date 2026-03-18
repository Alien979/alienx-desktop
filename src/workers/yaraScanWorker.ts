import { LogEntry } from "../types";
import {
  BundledYaraRule,
  YaraMatchedEvent,
  YaraMatchedFile,
  YaraRuleMatch,
  YaraScanStats,
  YaraStrictness,
} from "../lib/yara";

interface YaraScanWorkerRequest {
  events: LogEntry[];
  rules: BundledYaraRule[];
  strictness: YaraStrictness;
  chunkSize: number;
}

interface YaraWorkerProgressMessage {
  type: "progress";
  processed: number;
  total: number;
  matchesFound: number;
}

interface YaraWorkerDoneMessage {
  type: "done";
  matches: YaraRuleMatch[];
  stats: YaraScanStats;
}

interface YaraWorkerErrorMessage {
  type: "error";
  error: string;
}

type YaraWorkerResponse =
  | YaraWorkerProgressMessage
  | YaraWorkerDoneMessage
  | YaraWorkerErrorMessage;

const MAX_CORPUS_CHARS_PER_FILE = 6_000_000;

function buildEventCorpus(entry: LogEntry): string {
  const parts = [
    entry.rawLine,
    entry.message,
    entry.processName,
    entry.processCmd,
    entry.source,
    entry.host,
    entry.computer,
    ...(entry.eventData ? Object.values(entry.eventData) : []),
  ];
  return parts
    .filter((value): value is string => Boolean(value))
    .join("\n")
    .toLowerCase();
}

function buildCorpus(entries: LogEntry[]): string {
  const fragments: string[] = [];
  let usedChars = 0;

  for (const entry of entries) {
    const parts = [
      entry.rawLine,
      entry.message,
      entry.processName,
      entry.processCmd,
      entry.source,
      entry.host,
      entry.computer,
      ...(entry.eventData ? Object.values(entry.eventData) : []),
    ];

    for (const part of parts) {
      if (!part) continue;
      const lower = String(part).toLowerCase();
      const remaining = MAX_CORPUS_CHARS_PER_FILE - usedChars;
      if (remaining <= 0) {
        return fragments.join("\n");
      }
      const slice =
        lower.length > remaining ? lower.slice(0, remaining) : lower;
      fragments.push(slice);
      usedChars += slice.length;
    }
  }

  return fragments.join("\n");
}

function groupEventsBySourceFile(events: LogEntry[]): Array<{
  sourceFile: string;
  eventCount: number;
  corpus: string;
  entries: LogEntry[];
}> {
  const groups = new Map<string, LogEntry[]>();

  for (const event of events) {
    const sourceFile = event.sourceFile || "uploaded-data";
    const existing = groups.get(sourceFile);
    if (existing) {
      existing.push(event);
    } else {
      groups.set(sourceFile, [event]);
    }
  }

  return Array.from(groups.entries()).map(([sourceFile, entries]) => ({
    sourceFile,
    eventCount: entries.length,
    corpus: buildCorpus(entries),
    entries,
  }));
}

function strictnessPasses(
  strictness: YaraStrictness,
  rule: BundledYaraRule,
  matchedFiles: YaraMatchedFile[],
): boolean {
  const eventMatches = matchedFiles.reduce(
    (sum, file) => sum + file.matchedEvents.length,
    0,
  );
  const distinctLiteralCount = new Set(
    matchedFiles.flatMap((file) => file.matchedLiterals),
  ).size;

  if (strictness === "permissive") return true;
  if (strictness === "balanced") {
    return (
      eventMatches >= 1 && distinctLiteralCount >= Math.min(2, rule.minMatches)
    );
  }

  return (
    eventMatches >= 2 && distinctLiteralCount >= Math.max(2, rule.minMatches)
  );
}

function runScan(request: YaraScanWorkerRequest): {
  matches: YaraRuleMatch[];
  stats: YaraScanStats;
} {
  const startedAt = performance.now();
  const files = groupEventsBySourceFile(request.events);
  const totalComparisons = request.rules.length * files.length;
  const matches = new Map<string, YaraRuleMatch>();
  let processed = 0;
  let matchesFound = 0;

  const postProgress = () => {
    const message: YaraWorkerProgressMessage = {
      type: "progress",
      processed,
      total: totalComparisons,
      matchesFound,
    };
    self.postMessage(message satisfies YaraWorkerResponse);
  };

  postProgress();

  for (
    let start = 0;
    start < request.rules.length;
    start += request.chunkSize
  ) {
    const ruleChunk = request.rules.slice(start, start + request.chunkSize);

    for (const rule of ruleChunk) {
      if (!rule.anchor || rule.literals.length === 0) {
        processed += files.length;
        continue;
      }

      const matchedFiles: YaraMatchedFile[] = [];

      for (const file of files) {
        processed += 1;

        if (!file.corpus || !file.corpus.includes(rule.anchor)) {
          continue;
        }

        if (
          rule.exclusions &&
          rule.exclusions.some((literal) => file.corpus.includes(literal))
        ) {
          continue;
        }

        const matchedLiterals = rule.literals.filter((literal) =>
          file.corpus.includes(literal),
        );

        if (matchedLiterals.length >= rule.minMatches) {
          const matchedEvents: YaraMatchedEvent[] = [];
          for (const entry of file.entries) {
            const eventCorpus = buildEventCorpus(entry);
            if (!eventCorpus) continue;

            if (
              rule.exclusions &&
              rule.exclusions.some((literal) => eventCorpus.includes(literal))
            ) {
              continue;
            }

            const eventMatchedLiterals = matchedLiterals.filter((literal) =>
              eventCorpus.includes(literal),
            );

            if (eventMatchedLiterals.length >= rule.minMatches) {
              matchedEvents.push({
                event: entry,
                matchedLiterals: eventMatchedLiterals.slice(0, 8),
              });
              if (matchedEvents.length >= 8) {
                break;
              }
            }
          }

          matchedFiles.push({
            sourceFile: file.sourceFile,
            matchedLiterals: matchedLiterals.slice(0, 8),
            eventCount: file.eventCount,
            matchedEvents,
          });
        }
      }

      if (
        matchedFiles.length > 0 &&
        strictnessPasses(request.strictness, rule, matchedFiles)
      ) {
        matches.set(rule.id, { rule, matchedFiles });
        matchesFound += matchedFiles.length;
      }
    }

    postProgress();
  }

  const stats: YaraScanStats = {
    totalRules: request.rules.length,
    totalFiles: files.length,
    scannedComparisons: processed,
    matchesFound,
    processingTimeMs: performance.now() - startedAt,
  };

  return {
    matches: Array.from(matches.values()).sort(
      (left, right) => right.matchedFiles.length - left.matchedFiles.length,
    ),
    stats,
  };
}

self.onmessage = (event: MessageEvent<YaraScanWorkerRequest>) => {
  try {
    const result = runScan(event.data);
    const done: YaraWorkerDoneMessage = {
      type: "done",
      matches: result.matches,
      stats: result.stats,
    };
    self.postMessage(done satisfies YaraWorkerResponse);
  } catch (error) {
    const err: YaraWorkerErrorMessage = {
      type: "error",
      error: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(err satisfies YaraWorkerResponse);
  }
};
