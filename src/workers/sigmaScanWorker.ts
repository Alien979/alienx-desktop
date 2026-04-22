// sigmaScanWorker.ts - ES module Web Worker for async Sigma detection with progress/cancel
import { processEventsOptimized } from "../lib/sigma/engine/optimizedMatcher";
import { CompiledSigmaRule } from "../lib/sigma/types";

let cancelled = false;

function reviveCompiledRules(rawRules: any[]): CompiledSigmaRule[] {
  return (rawRules || []).map((rule: any) => {
    const selectionsRaw = rule?.selections;
    const selections =
      selectionsRaw instanceof Map
        ? selectionsRaw
        : new Map<string, any>(
            selectionsRaw && typeof selectionsRaw === "object"
              ? Object.entries(selectionsRaw)
              : [],
          );

    return {
      ...rule,
      selections,
    } as CompiledSigmaRule;
  });
}

self.onmessage = async (e) => {
  const { type, payload } = e.data;
  if (type === "start") {
    cancelled = false;
    const { entries, rules } = payload;
    try {
      const revivedRules = reviveCompiledRules(rules as any[]);

      // Use optimized batch matcher with progress callback
      const { matches, stats } = await processEventsOptimized(
        entries,
        revivedRules,
        (completed: number, total: number, partialStats) => {
          if (!cancelled) {
            self.postMessage({
              type: "progress",
              completed,
              total,
              matchesFound:
                typeof partialStats?.matchesFound === "number"
                  ? partialStats.matchesFound
                  : 0,
            });
          }
        },
        500, // chunkSize
      );

      if (cancelled) {
        self.postMessage({ type: "cancelled" });
        return;
      }

      // Convert Map to plain object for transfer
      const matchesObj = Object.fromEntries(matches);
      self.postMessage({
        type: "done",
        matches: matchesObj,
        stats, // Include optimization stats for debugging
      });
    } catch (err) {
      self.postMessage({
        type: "error",
        error: (err && (err as any).message) || String(err),
      });
      return;
    }
  } else if (type === "cancel") {
    cancelled = true;
  }
};
