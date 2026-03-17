import { LogEntry } from "../types";
import { PlatformLogParser } from "./types";

const JOURNAL_FILE_HINTS = ["journal", "journalctl", "jsonl", "ndjson"];

function parseLine(line: string): any | null {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function looksLikeJournalObject(
  value: unknown,
): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  return Boolean(
    obj.__REALTIME_TIMESTAMP ||
    obj._SOURCE_REALTIME_TIMESTAMP ||
    obj._SYSTEMD_UNIT ||
    obj.SYSLOG_IDENTIFIER ||
    obj._HOSTNAME,
  );
}

function toDate(value: unknown): Date {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d+$/.test(trimmed)) {
      const parsed = Number.parseInt(trimmed, 10);
      if (!Number.isNaN(parsed)) {
        return toDate(parsed);
      }
    }

    const d = new Date(value);
    if (!isNaN(d.getTime())) return d;
  }

  if (typeof value === "number") {
    let ms = value;
    // journalctl __REALTIME_TIMESTAMP is often microseconds since epoch
    if (value > 1e14) {
      ms = Math.floor(value / 1000);
    } else if (value > 1e12) {
      // Treat 13-digit values as milliseconds (common JS epoch format)
      ms = value;
    } else {
      // 10-digit unix seconds
      ms = value * 1000;
    }

    const d = new Date(ms);
    if (!isNaN(d.getTime())) return d;
  }

  return new Date();
}

export const linuxJournalParser: PlatformLogParser = {
  id: "linux-journal",
  platform: "linux",
  canParse: (fileName: string, sample: string) => {
    const lower = fileName.toLowerCase();
    const firstLine =
      sample.split(/\r?\n/).find((line) => line.trim().length > 0) || "";
    const obj = parseLine(firstLine.trim());

    if (looksLikeJournalObject(obj)) {
      return true;
    }

    // Only accept filename-hinted files when they appear JSON-like,
    // otherwise let other parsers (e.g., syslog) try first.
    if (JOURNAL_FILE_HINTS.some((hint) => lower.includes(hint))) {
      const trimmed = firstLine.trim();
      return trimmed.startsWith("{") && trimmed.endsWith("}");
    }

    return false;
  },
  parse: (content, meta) => {
    const entries: LogEntry[] = [];
    const lines = content.split(/\r?\n/);

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const obj = parseLine(trimmed);
      if (!obj || typeof obj !== "object") continue;

      if (!looksLikeJournalObject(obj)) {
        continue;
      }

      const tsRaw =
        obj.__REALTIME_TIMESTAMP ||
        obj._SOURCE_REALTIME_TIMESTAMP ||
        obj.SYSLOG_TIMESTAMP;

      const host = String(obj._HOSTNAME || obj.HOSTNAME || "");
      const message = String(obj.MESSAGE || "");
      const unit = String(
        obj._SYSTEMD_UNIT || obj.SYSLOG_IDENTIFIER || "journal",
      );
      const severity = String(obj.PRIORITY || obj.SYSLOG_FACILITY || "");
      const pid = Number.parseInt(String(obj._PID || obj.SYSLOG_PID || ""), 10);

      entries.push({
        timestamp: toDate(tsRaw),
        ip: host || "N/A",
        method: unit.substring(0, 20),
        path: unit || "journal",
        statusCode: 0,
        size: 0,
        rawLine: trimmed,
        source: unit,
        computer: host || undefined,
        host: host || undefined,
        user: obj._UID ? String(obj._UID) : undefined,
        pid: Number.isNaN(pid) ? undefined : pid,
        processName: obj.SYSLOG_IDENTIFIER
          ? String(obj.SYSLOG_IDENTIFIER)
          : undefined,
        processCmd: obj.CMDLINE ? String(obj.CMDLINE) : undefined,
        sourceType: "journal",
        severity,
        message,
        eventData: Object.fromEntries(
          Object.entries(obj).map(([k, v]) => [k, String(v)]),
        ),
        sourceFile: meta.sourcePath,
        platform: "linux",
      });
    }

    return entries;
  },
};
