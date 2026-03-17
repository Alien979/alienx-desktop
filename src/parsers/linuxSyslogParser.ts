import { LogEntry } from "../types";
import { PlatformLogParser } from "./types";

const SYSLOG_FILE_HINTS = [
  "syslog",
  "messages",
  "auth.log",
  "secure",
  "kern.log",
  "daemon.log",
];

const MONTHS: Record<string, number> = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
};

function parseTimestamp(mon: string, day: string, time: string): Date {
  const now = new Date();
  const year = now.getFullYear();
  const [hh, mm, ss] = time.split(":").map((n) => Number.parseInt(n, 10));
  const parsed = new Date(
    year,
    MONTHS[mon] ?? now.getMonth(),
    Number.parseInt(day, 10),
    Number.isNaN(hh) ? 0 : hh,
    Number.isNaN(mm) ? 0 : mm,
    Number.isNaN(ss) ? 0 : ss,
  );

  // Syslog lines often omit year. If parsed time lands in the near future,
  // assume it belongs to the previous year.
  if (parsed.getTime() - now.getTime() > 24 * 60 * 60 * 1000) {
    parsed.setFullYear(parsed.getFullYear() - 1);
  }

  return parsed;
}

const SYSLOG_LINE_REGEX =
  /^[A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+[^\s]+\s+[^:]+:\s*/;

export const linuxSyslogParser: PlatformLogParser = {
  id: "linux-syslog",
  platform: "linux",
  canParse: (fileName: string, sample: string, sourcePath?: string) => {
    const lower = `${fileName} ${sourcePath || ""}`.toLowerCase();
    const hinted = SYSLOG_FILE_HINTS.some((hint) => lower.includes(hint));

    const lines = sample
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 20);
    const hasSyslogLine = lines.some((line) => SYSLOG_LINE_REGEX.test(line));

    if (hasSyslogLine) {
      return true;
    }

    return hinted;
  },
  parse: (content, meta) => {
    const entries: LogEntry[] = [];
    const lines = content.split(/\r?\n/);

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const match = trimmed.match(
        /^([A-Z][a-z]{2})\s+(\d{1,2})\s+(\d{2}:\d{2}:\d{2})\s+([^\s]+)\s+([^:]+):\s*(.*)$/,
      );
      if (!match) continue;

      const [, mon, day, time, host, proc, message] = match;
      const processName = proc.replace(/\[[0-9]+\]$/, "");
      const pidMatch = proc.match(/\[([0-9]+)\]$/);
      const pid = pidMatch ? Number.parseInt(pidMatch[1], 10) : undefined;

      entries.push({
        timestamp: parseTimestamp(mon, day, time),
        ip: host,
        method: processName.substring(0, 20),
        path: processName,
        statusCode: 0,
        size: 0,
        rawLine: trimmed,
        source: processName,
        host,
        computer: host,
        pid,
        processName,
        sourceType: "syslog",
        message,
        sourceFile: meta.sourcePath,
        platform: "linux",
      });
    }

    return entries;
  },
};
