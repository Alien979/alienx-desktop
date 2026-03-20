// correlationNativeClient.ts
// Web build stub: this file is used in the browser build and will throw if called.
// The real implementation is in correlationNativeClient.tauri.ts and is only imported in Tauri builds.

import type { LogEntry } from "../types";
import type { SigmaRuleMatch } from "./sigma/types";

export interface CorrelatedChainNative {
  id: string;
  event_indices: number[];
  severity: string;
  score: number;
  summary: string;
}

export interface CorrelationAnalyticsNative {
  total_chains: number;
  avg_chain_length: number;
  top_processes: string[];
  max_score: number;
}

export interface CorrelationResultNative {
  chains: CorrelatedChainNative[];
  analytics: CorrelationAnalyticsNative;
}

export async function correlateEventsNative(
  // @ts-ignore
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _entries: LogEntry[],
  // @ts-ignore
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _sigmaMatches: SigmaRuleMatch[],
): Promise<CorrelationResultNative> {
  throw new Error(
    "correlateEventsNative is only available in the Tauri desktop app. This stub is used in the web build.",
  );
}
