import { LogEntry, LogPlatform, ParsedFormat } from "../types";

export interface ParsedFileMeta {
  fileName: string;
  sourcePath: string;
}

export interface PlatformLogParser {
  id: ParsedFormat;
  platform: LogPlatform;
  canParse: (fileName: string, sample: string, sourcePath?: string) => boolean;
  parse: (
    content: string,
    meta: ParsedFileMeta,
    onProgress?: (processed: number, total: number) => void,
  ) => LogEntry[];
}

export interface ParserResult {
  entries: LogEntry[];
  parsedFiles: string[];
  skippedFiles: Array<{ fileName: string; reason: string }>;
  errors: Array<{ fileName: string; error: string }>;
}
