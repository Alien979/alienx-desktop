import { LogEntry, LogPlatform } from "../types";

export interface BundledYaraRule {
  id: string;
  name: string;
  title: string;
  description: string;
  author: string;
  source: string;
  sourceName: string;
  path: string;
  platform: "linux" | "windows" | "all";
  tags: string[];
  literals: string[];
  minMatches: number;
  anchor: string;
}

export interface YaraMatchedFile {
  sourceFile: string;
  matchedLiterals: string[];
  eventCount: number;
  matchedEvents: YaraMatchedEvent[];
}

export interface YaraMatchedEvent {
  event: LogEntry;
  matchedLiterals: string[];
}

export interface YaraRuleMatch {
  rule: BundledYaraRule;
  matchedFiles: YaraMatchedFile[];
}

export interface YaraScanStats {
  totalRules: number;
  totalFiles: number;
  scannedComparisons: number;
  matchesFound: number;
  processingTimeMs: number;
}

interface YaraBundleResponse {
  generatedAt: string;
  platform: string;
  ruleCount: number;
  rules: BundledYaraRule[];
}

const bundleCache = new Map<LogPlatform, Promise<BundledYaraRule[]>>();

function buildCorpus(entries: LogEntry[]): string {
  return entries
    .flatMap((entry) => {
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
      return parts.filter((value): value is string => Boolean(value));
    })
    .join("\n")
    .toLowerCase();
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

export async function loadBundledYaraRules(
  platform: LogPlatform,
): Promise<BundledYaraRule[]> {
  const cached = bundleCache.get(platform);
  if (cached) {
    return cached;
  }

  const promise = fetch(`/yara-rules/${platform}.json`)
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Failed to load YARA bundle for ${platform}`);
      }
      const bundle = (await response.json()) as YaraBundleResponse;
      return bundle.rules || [];
    })
    .catch((error) => {
      console.error("[YARA] Failed to load bundled rules:", error);
      return [];
    });

  bundleCache.set(platform, promise);
  return promise;
}

export async function scanEventsWithYara(
  events: LogEntry[],
  platform: LogPlatform,
  onProgress?: (processed: number, total: number, matchesFound: number) => void,
  chunkSize: number = 50,
): Promise<{ matches: YaraRuleMatch[]; stats: YaraScanStats }> {
  const startedAt = performance.now();
  const rules = await loadBundledYaraRules(platform);
  const files = groupEventsBySourceFile(events);
  const totalComparisons = rules.length * files.length;
  const matches = new Map<string, YaraRuleMatch>();
  let processed = 0;
  let matchesFound = 0;

  if (onProgress) {
    onProgress(0, totalComparisons, 0);
  }

  for (let start = 0; start < rules.length; start += chunkSize) {
    const ruleChunk = rules.slice(start, start + chunkSize);

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

        const matchedLiterals = rule.literals.filter((literal) =>
          file.corpus.includes(literal),
        );

        if (matchedLiterals.length >= rule.minMatches) {
          const matchedEvents: YaraMatchedEvent[] = [];
          for (const entry of file.entries) {
            const eventCorpus = buildEventCorpus(entry);
            if (!eventCorpus) continue;

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

      if (matchedFiles.length > 0) {
        matches.set(rule.id, { rule, matchedFiles });
        matchesFound += matchedFiles.length;
      }
    }

    if (onProgress) {
      onProgress(processed, totalComparisons, matchesFound);
    }

    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  const stats: YaraScanStats = {
    totalRules: rules.length,
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
