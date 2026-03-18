import { LogEntry } from "../types";
import {
  BundledYaraRule,
  YaraRuleMatch,
  YaraScanStats,
  YaraStrictness,
} from "./yara";

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

type YaraNativeResponse = {
  matches: YaraRuleMatch[];
  stats: YaraScanStats;
};

function isTauriRuntime(): boolean {
  if (typeof window === "undefined") return false;
  const maybeWindow = window as typeof window & {
    __TAURI_INTERNALS__?: unknown;
    __TAURI__?: unknown;
  };
  return Boolean(maybeWindow.__TAURI_INTERNALS__ || maybeWindow.__TAURI__);
}

function normalizeNativeResult(result: YaraNativeResponse): YaraNativeResponse {
  return {
    ...result,
    matches: result.matches.map((match) => ({
      ...match,
      matchedFiles: match.matchedFiles.map((file) => ({
        ...file,
        matchedEvents: file.matchedEvents.map((m) => ({
          ...m,
          event: {
            ...m.event,
            timestamp: new Date(m.event.timestamp),
          },
        })),
      })),
    })),
  };
}

async function runYaraScanNativeIfAvailable(
  events: LogEntry[],
  rules: BundledYaraRule[],
  strictness: YaraStrictness,
  onProgress?: (processed: number, total: number, matchesFound: number) => void,
): Promise<{ matches: YaraRuleMatch[]; stats: YaraScanStats } | null> {
  if (!isTauriRuntime()) return null;

  const total =
    rules.length *
    new Set(events.map((e) => e.sourceFile || "uploaded-data")).size;
  onProgress?.(0, total, 0);

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const result = await invoke<YaraNativeResponse>("scan_yara_native", {
      events,
      rules,
      strictness,
    });

    onProgress?.(total, total, result.stats.matchesFound);
    return normalizeNativeResult(result);
  } catch {
    return null;
  }
}

export function runYaraScanInWorker(
  events: LogEntry[],
  rules: BundledYaraRule[],
  strictness: YaraStrictness,
  onProgress?: (processed: number, total: number, matchesFound: number) => void,
  chunkSize: number = 50,
): Promise<{ matches: YaraRuleMatch[]; stats: YaraScanStats }> {
  return new Promise((resolve, reject) => {
    runYaraScanNativeIfAvailable(events, rules, strictness, onProgress)
      .then((nativeResult) => {
        if (nativeResult) {
          resolve(nativeResult);
          return;
        }

        if (typeof Worker === "undefined") {
          reject(new Error("Web Worker is not available in this environment."));
          return;
        }

        const worker = new Worker(
          new URL("../workers/yaraScanWorker.ts", import.meta.url),
          {
            type: "module",
          },
        );

        worker.onmessage = (event: MessageEvent<YaraWorkerResponse>) => {
          const message = event.data;

          if (message.type === "progress") {
            onProgress?.(
              message.processed,
              message.total,
              message.matchesFound,
            );
            return;
          }

          if (message.type === "done") {
            worker.terminate();
            resolve({ matches: message.matches, stats: message.stats });
            return;
          }

          worker.terminate();
          reject(new Error(message.error));
        };

        worker.onerror = (event) => {
          worker.terminate();
          reject(new Error(event.message || "YARA worker failed"));
        };

        worker.postMessage({
          events,
          rules,
          strictness,
          chunkSize,
        });
      })
      .catch(() => {
        reject(new Error("YARA native and worker execution both failed."));
      });
  });
}
