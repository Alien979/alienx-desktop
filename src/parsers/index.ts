import { LogPlatform, ParsedData, ParsedFormat } from "../types";
import { PlatformLogParser, ParserResult } from "./types";
import { windowsEvtxParser } from "./windowsEvtxParser";
import { linuxJournalParser } from "./linuxJournalParser";
import { linuxAuditdParser } from "./linuxAuditdParser";
import { linuxSyslogParser } from "./linuxSyslogParser";

export interface ParserInputFile {
  file: File;
  sourcePath?: string;
}

const WINDOWS_PARSERS: PlatformLogParser[] = [windowsEvtxParser];
const LINUX_PARSERS: PlatformLogParser[] = [
  linuxJournalParser,
  linuxAuditdParser,
  linuxSyslogParser,
];

function getParsers(platform: LogPlatform): PlatformLogParser[] {
  return platform === "windows" ? WINDOWS_PARSERS : LINUX_PARSERS;
}

function detectFormat(formats: Set<ParsedFormat>): ParsedFormat {
  if (formats.size === 0) return "unknown";
  if (formats.size === 1) return formats.values().next().value as ParsedFormat;
  return "mixed";
}

async function getSample(file: File): Promise<string> {
  const sampleText = await file.slice(0, 8192).text();
  return sampleText;
}

export async function parseFilesForPlatform(
  files: ParserInputFile[],
  platform: LogPlatform,
  onProgress?: (processed: number, total: number) => void,
): Promise<ParsedData & { parserResult: ParserResult }> {
  const result: ParserResult = {
    entries: [],
    parsedFiles: [],
    skippedFiles: [],
    errors: [],
  };

  const formats = new Set<ParsedFormat>();
  const parsers = getParsers(platform);
  const total = files.length;

  for (let i = 0; i < files.length; i++) {
    const item = files[i];
    const sourcePath =
      item.sourcePath || item.file.webkitRelativePath || item.file.name;

    try {
      const sample = await getSample(item.file);
      const candidateParsers = parsers.filter((p) =>
        p.canParse(item.file.name, sample, sourcePath),
      );

      if (candidateParsers.length === 0) {
        result.skippedFiles.push({
          fileName: sourcePath,
          reason: "Unsupported log format",
        });
        if (onProgress) onProgress(i + 1, total);
        continue;
      }

      const content = await item.file.text();
      let parsed = false;
      let lastError: string | null = null;

      for (const parser of candidateParsers) {
        try {
          const entries = parser.parse(content, {
            fileName: item.file.name,
            sourcePath,
          });

          if (entries.length > 0) {
            result.entries.push(...entries);
            result.parsedFiles.push(sourcePath);
            formats.add(parser.id);
            parsed = true;
            break;
          }
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
        }
      }

      if (!parsed) {
        if (lastError) {
          result.errors.push({
            fileName: sourcePath,
            error: lastError,
          });
        } else {
          result.skippedFiles.push({
            fileName: sourcePath,
            reason: "No parseable events found",
          });
        }
      }
    } catch (error) {
      result.errors.push({
        fileName: sourcePath,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    if (onProgress) onProgress(i + 1, total);
  }

  return {
    entries: result.entries,
    format: detectFormat(formats),
    platform,
    totalLines: result.entries.length,
    parsedLines: result.entries.length,
    sourceFiles: result.parsedFiles,
    parserResult: result,
  };
}
