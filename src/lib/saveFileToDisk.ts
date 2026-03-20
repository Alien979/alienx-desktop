// Utility to save a File object to disk in Tauri (desktop)
// Returns the absolute path to the saved file
// @ts-ignore
import { writeBinaryFile, BaseDirectory } from "@tauri-apps/api/fs";
import { join } from "@tauri-apps/api/path";

export async function saveFileToDisk(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  // Save to app's temp directory with original name
  const tempDir = await join(BaseDirectory.Temp, "alienx-desktop-imports");
  const filePath = await join(tempDir, file.name);
  await writeBinaryFile({ path: filePath, contents: bytes });
  return filePath;
}
