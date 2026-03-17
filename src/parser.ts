import { ParsedData } from "./types";
import { parseWindowsEvtxXml } from "./parsers/windowsEvtxParser";

/**
 * Legacy parser entrypoint kept for backward compatibility.
 * This path parses Windows EVTX XML payloads.
 */
export function parseLogFile(
  content: string,
  onProgress?: (processed: number, total: number) => void,
  filename?: string,
): ParsedData {
  const entries = parseWindowsEvtxXml(content, onProgress, filename);

  return {
    entries,
    format: entries.length > 0 ? "evtx" : "unknown",
    platform: "windows",
    totalLines: entries.length,
    parsedLines: entries.length,
    sourceFiles: filename ? [filename] : undefined,
  };
}
