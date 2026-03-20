// sigmaScanWorker.ts - ES module Web Worker for async Sigma detection with progress/cancel
import { matchRules } from "../lib/sigma/engine/matcher";

// @ts-ignore: variable is kept for future use
let running = false;

self.onmessage = async (e) => {
  const { type, payload } = e.data;
  if (type === "start") {
    running = true;
    const { entries, rules } = payload;
    let matchesMap = new Map();
    let matchesFound = 0;
    try {
      // Progress-enabled matching
      const total = entries.length;
      matchesMap = new Map();
      for (let i = 0; i < entries.length; i++) {
        if (!running) break;
        const event = entries[i];
        const matches = matchRules(event, rules);
        for (const match of matches) {
          const ruleId = match.rule.id;
          const existing = matchesMap.get(ruleId) || [];
          existing.push(match);
          matchesMap.set(ruleId, existing);
          matchesFound++;
        }
        if (i % 500 === 0 || i === entries.length - 1) {
          self.postMessage({
            type: "progress",
            processed: i + 1,
            total,
            matchesFound,
          });
        }
      }
    } catch (err) {
      self.postMessage({
        type: "error",
        error: (err && (err as any).message) || String(err),
      });
      return;
    }
    // Convert Map to plain object for transfer
    const matches = Object.fromEntries(matchesMap);
    self.postMessage({ type: "done", matches });
  } else if (type === "cancel") {
    running = false;
  }
};
