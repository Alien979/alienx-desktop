// Utility to detect if running in Tauri (desktop)
export function isTauri(): boolean {
  // Tauri injects a global __TAURI__ object
  return typeof (window as any).__TAURI__ !== "undefined";
}
