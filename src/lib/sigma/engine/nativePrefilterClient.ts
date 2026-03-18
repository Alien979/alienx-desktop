import { LogEntry } from "../../../types";

export interface NativeQuickFilter {
  field: string;
  type: "endswith" | "contains" | "startswith" | "equals";
  values: string[];
}

export interface NativePrefilterRule {
  id: string;
  filters: NativeQuickFilter[];
}

export interface NativePrefilterStats {
  totalComparisons: number;
  quickRejects: number;
  candidateComparisons: number;
  processingTimeMs: number;
}

interface NativeRuleCandidates {
  ruleId: string;
  eventIndices: number[];
}

interface NativePrefilterResult {
  candidates: NativeRuleCandidates[];
  stats: NativePrefilterStats;
}

interface NativeProgressPayload {
  processed: number;
  total: number;
  quickRejects: number;
  candidatesFound: number;
}

function isTauriRuntime(): boolean {
  if (typeof window === "undefined") return false;
  const maybeWindow = window as typeof window & {
    __TAURI_INTERNALS__?: unknown;
    __TAURI__?: unknown;
  };
  return Boolean(maybeWindow.__TAURI_INTERNALS__ || maybeWindow.__TAURI__);
}

export async function runSigmaPrefilterNative(
  events: LogEntry[],
  rules: NativePrefilterRule[],
  onProgress?: (payload: NativeProgressPayload) => void,
): Promise<{
  candidatesByRule: Map<string, number[]>;
  stats: NativePrefilterStats;
} | null> {
  if (!isTauriRuntime() || rules.length === 0 || events.length === 0) {
    return null;
  }

  try {
    const [{ invoke }, { listen }] = await Promise.all([
      import("@tauri-apps/api/core"),
      import("@tauri-apps/api/event"),
    ]);

    const unlisten = await listen<NativeProgressPayload>(
      "sigma-native-progress",
      (event) => {
        onProgress?.(event.payload);
      },
    );

    try {
      const result = await invoke<NativePrefilterResult>(
        "sigma_prefilter_native",
        {
          events,
          rules,
          emitEvery: 8000,
        },
      );

      const candidatesByRule = new Map<string, number[]>();
      for (const item of result.candidates) {
        candidatesByRule.set(item.ruleId, item.eventIndices);
      }

      return {
        candidatesByRule,
        stats: result.stats,
      };
    } finally {
      unlisten();
    }
  } catch {
    return null;
  }
}
