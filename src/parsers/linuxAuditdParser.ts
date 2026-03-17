import { LogEntry } from "../types";
import { PlatformLogParser } from "./types";

function parseKvPairs(line: string): Record<string, string> {
  const result: Record<string, string> = {};
  const regex = /(\w+)=(("[^"]*")|([^\s]+))/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(line)) !== null) {
    const key = match[1];
    const raw = match[2] || "";
    result[key] = raw.replace(/^"|"$/g, "");
  }

  return result;
}

function parseAuditTime(value: string | undefined): Date {
  if (!value) return new Date();
  const m = value.match(/audit\((\d+)(?:\.(\d+))?/);
  if (!m) return new Date();
  const seconds = Number.parseInt(m[1], 10);
  const millis = m[2]
    ? Number.parseInt(m[2].padEnd(3, "0").slice(0, 3), 10)
    : 0;
  if (Number.isNaN(seconds)) return new Date();
  return new Date(seconds * 1000 + millis);
}

export const linuxAuditdParser: PlatformLogParser = {
  id: "linux-auditd",
  platform: "linux",
  canParse: (_fileName: string, sample: string) => {
    return /(?:^|\n)\s*type=\w+\s+msg=audit\(/m.test(sample);
  },
  parse: (content, meta) => {
    const entries: LogEntry[] = [];
    const lines = content.split(/\r?\n/);

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.includes("msg=audit(")) continue;

      const kv = parseKvPairs(trimmed);
      const msgTypeMatch = trimmed.match(/^type=(\w+)/);
      const msgType = msgTypeMatch ? msgTypeMatch[1] : "audit";

      const pid = Number.parseInt(kv.pid || kv.ppid || "", 10);
      const ppid = Number.parseInt(kv.ppid || "", 10);
      const eventData: Record<string, string> = { ...kv, type: msgType };

      entries.push({
        timestamp: parseAuditTime(trimmed),
        ip: kv.addr || kv.hostname || "N/A",
        method: "auditd",
        path: msgType,
        statusCode: 0,
        size: 0,
        rawLine: trimmed,
        source: "auditd",
        host: kv.hostname,
        user: kv.auid || kv.uid,
        pid: Number.isNaN(pid) ? undefined : pid,
        ppid: Number.isNaN(ppid) ? undefined : ppid,
        processName: kv.comm || kv.exe,
        processCmd: kv.exe,
        sourceType: "auditd",
        severity: kv.res || undefined,
        message: kv.exe || kv.comm || msgType,
        eventData,
        sourceFile: meta.sourcePath,
        platform: "linux",
      });
    }

    return entries;
  },
};
