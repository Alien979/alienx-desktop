// sigmaScanWorker.ts - ES module Web Worker for async Sigma detection with progress/cancel
import { matchAllEventsOptimized } from "../lib/sigma/engine/optimizedMatcher";
import { CompiledSigmaRule } from "../lib/sigma/types";

let cancelled = false;

self.onmessage = async (e) => {
  const { type, payload } = e.data;
  if (type === "start") {
    cancelled = false;
    const { entries, rules } = payload;
    let matchesMap = new Map();
    try {
      // Use optimized batch matcher with progress callback
      const { matches, stats } = await matchAllEventsOptimized(
        entries,
        rules as CompiledSigmaRule[],
        (completed: number, total: number) => {
          if (!cancelled) {
            self.postMessage({
              type: "progress",
              completed,
              total,
              matchesFound: Array.from(matches.values()).reduce(
                (sum, m) => sum + m.length,
                0,
              ),
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
