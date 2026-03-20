// Bridge for calling native Rust folder parser via Tauri
// Only used in desktop builds

import type { LogEntry } from "../types";

// Only import Tauri API if running in Tauri
let invoke: any = undefined;
if ((window as any).__TAURI__) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  // @ts-ignore
  // Tauri v2: invoke is exported from @tauri-apps/api/core (not /tauri)
  invoke = require("@tauri-apps/api/core").invoke;
}

export async function parseFolderNative(
  folderPath: string,
): Promise<LogEntry[]> {
  if (!invoke) {
    throw new Error(
      "Native folder parsing is only available in the Tauri desktop app.",
    );
  }
  // @ts-ignore
  return invoke<LogEntry[]>("parse_folder_native", { folderPath });
}
