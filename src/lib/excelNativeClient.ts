// Bridge for calling native Rust CSV/TSV parser via Tauri
// Only used in desktop builds

import { invoke } from "@tauri-apps/api/tauri";
import type { ParsedData } from "../types";

export async function parseCsvFileNative(path: string): Promise<ParsedData> {
  return invoke<ParsedData>("parse_csv_file_native", { path });
}
