// correlationNativeClient.tauri.ts
// Only imported in Tauri (desktop) builds
// @ts-ignore
import { invoke } from "@tauri-apps/api/core";
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
  entries: LogEntry[],
  sigmaMatches: SigmaRuleMatch[],
): Promise<CorrelationResultNative> {
  return invoke<CorrelationResultNative>("correlate_events_native", {
    entries,
    sigmaMatches,
  });
}
