// Bridge for calling native Rust CSV/TSV parser via Tauri
// Only used in desktop builds

// @ts-ignore
import { invoke } from "@tauri-apps/api/core";
import type { ParsedData } from "../types";

export async function parseCsvFileNative(path: string): Promise<ParsedData> {
  return invoke<ParsedData>("parse_csv_file_native", { path });
}
