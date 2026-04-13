/**
 * Excel / CSV parser for SIEM log exports.
 *
 * Supports .xlsx, .xls, .csv, and .tsv files.
 * Attempts to map common SIEM column names to LogEntry fields so that
 * all existing analysis views (Sigma, YARA, IOC extractor, timeline …)
 * work out of the box on imported spreadsheet data.
 */

import type { LogEntry, ParsedData, LogPlatform } from "../types";
import Papa, { ParseResult } from "papaparse";

// ─── Column name sets (normalised – lower-case, no spaces/dashes/underscores) ─

const TIMESTAMP_COLS = new Set([
  "timecreated",
  "timegenerated",
  "timestamp",
  "time",
  "datetime",
  "date",
  "eventtime",
  "recordtime",
  "createdat",
  "event_time",
  "systemtime",
  "utctime",
  "@timestamp",
  "eventcreatedtime",
  "datetime(utc)",
  "eventdate",
  "date_generated",
  "logtime",
  "alerttime",
  "occurrencetime",
  "writtentime",
  "generatedtime",
]);

const EVENTID_COLS = new Set([
  "eventid",
  "eventcode",
  "event_id",
  "id",
  "recordnumber",
  "eventrecordid",
  "windowseventid",
]);

const LEVEL_COLS = new Set([
  "level",
  "severity",
  "eventtype",
  "log_level",
  "loglevel",
  "rulelevel",
  "alertlevel",
  "priority",
  "criticality",
]);

const SOURCE_COLS = new Set([
  "source",
  "sourcename",
  "providername",
  "provider",
  "channel",
  "category",
  "logname",
  "taskcategory",
  "task",
  "logsource",
]);

const COMPUTER_COLS = new Set([
  "computer",
  "computername",
  "hostname",
  "host",
  "system",
  "machine",
  "devicename",
  "systemname",
  "workstation",
  "device",
  "endpoint",
  "machinename",
]);

const MESSAGE_COLS = new Set([
  "message",
  "description",
  "eventdescription",
  "msg",
  "text",
  "details",
  "messagetext",
  "rulename",
  "ruletitle",
  "alertname",
  "fullmessage",
  "rawmessage",
]);

const USER_COLS = new Set([
  "user",
  "subjectusername",
  "accountname",
  "username",
  "targetusername",
  "accountdomain",
  "subjectdomainname",
  "account",
  "logonuser",
  "subjectuser",
]);

// Column names that strongly indicate a Linux log export
const LINUX_SOURCE_COLS = new Set([
  "syslogidentifier",
  "systemdunit",
  "transporttype",
  "journaldunit",
  "comm",
  "exe",
  "syscall",
  "auditd",
  "audit",
  "cgroup",
  "bootid",
  "machineid",
]);

const PROCESSNAME_COLS = new Set([
  "processname",
  "image",
  "process_name",
  "applicationname",
  "exe",
  "application",
  "imagepath",
  "executablepath",
]);

const PID_COLS = new Set([
  "processid",
  "pid",
  "process_id",
  "newprocessid",
  "parentprocessid",
]);

const IP_COLS = new Set([
  "ipaddress",
  "sourceip",
  "source_ip",
  "ip",
  "remoteaddress",
  "clientip",
  "sourceaddress",
  "destinationip",
  "dest_ip",
  "srcip",
  "dstip",
  "networksourceip",
  "networkdestinationip",
  "ipaddr",
  "srcaddress",
]);

const METHOD_COLS = new Set([
  "method",
  "httpmethod",
  "requestmethod",
  "csmethod",
  "verb",
]);

const PATH_COLS = new Set([
  "path",
  "url",
  "requestpath",
  "csuri",
  "csuristem",
  "uri",
  "uniformresourceidentifier",
  "requesturl",
]);

const STATUSCODE_COLS = new Set([
  "statuscode",
  "status_code",
  "status",
  "httpstatuscode",
  "scstatus",
  "responsecode",
  "resultcode",
]);

const USERAGENT_COLS = new Set([
  "useragent",
  "user_agent",
  "browser",
  "csuseragent",
  "csversion",
]);

const PROCESSCOMMAND_COLS = new Set([
  "commandline",
  "command_line",
  "processcmd",
  "parentcommandline",
  "commandlinearguments",
  "cmdline",
]);

const PPID_COLS = new Set(["parentprocessid", "ppid", "parentpid"]);

// ─── Helpers ───────────────────────────────────────────────────────────────────

type EntryField = keyof LogEntry | "eventData";
const MAX_XLSX_SIZE_BYTES = 1024 * 1024 * 1024; // 1 GB practical browser limit
const LARGE_FILE_COMPACT_THRESHOLD_BYTES = 1024 * 1024 * 1024; // 1 GB
const MAX_COMPACT_EVENTDATA_FIELDS = 25;

function trimForMemory(value: string, max = 2048): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
}

function normalizeCol(col: string): string {
  return col
    .toLowerCase()
    .replace(/[\s\-_()/\\]/g, "")
    .trim();
}

function detectColumn(col: string, set: Set<string>): boolean {
  return set.has(normalizeCol(col));
}

/** Map an Excel date serial (number) or string to a JS Date. */
function parseTimestamp(value: unknown): Date {
  if (!value && value !== 0) return new Date(0);
  if (value instanceof Date)
    return isNaN(value.getTime()) ? new Date(0) : value;

  // XLSX may already have converted cells to Date objects when cellDates:true;
  // but if raw:false it comes through as a formatted string.
  if (typeof value === "string") {
    const s = value.trim();
    if (!s) return new Date(0);
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d;
    return new Date(0);
  }

  if (typeof value === "number") {
    // Excel date serial: days since 1900-01-00 (with Excel's Feb-29-1900 bug)
    const d = new Date((value - 25569) * 86400 * 1000);
    return isNaN(d.getTime()) ? new Date(0) : d;
  }

  return new Date(0);
}

/** Build the header→field mapping for a sheet. */
function mapHeaders(headers: string[]): Record<string, EntryField> {
  const result: Record<string, EntryField> = {};

  for (const h of headers) {
    const trimmed = h.trim();
    if (!trimmed) continue;

    if (detectColumn(trimmed, TIMESTAMP_COLS)) {
      result[h] = "timestamp";
    } else if (detectColumn(trimmed, EVENTID_COLS)) {
      result[h] = "eventId";
    } else if (detectColumn(trimmed, LEVEL_COLS)) {
      result[h] = "level";
    } else if (detectColumn(trimmed, SOURCE_COLS)) {
      result[h] = "source";
    } else if (detectColumn(trimmed, COMPUTER_COLS)) {
      result[h] = "computer";
    } else if (detectColumn(trimmed, MESSAGE_COLS)) {
      result[h] = "message";
    } else if (detectColumn(trimmed, USER_COLS)) {
      result[h] = "user";
    } else if (detectColumn(trimmed, PROCESSNAME_COLS)) {
      result[h] = "processName";
    } else if (detectColumn(trimmed, PPID_COLS)) {
      result[h] = "ppid";
    } else if (detectColumn(trimmed, PID_COLS)) {
      result[h] = "pid";
    } else if (detectColumn(trimmed, PROCESSCOMMAND_COLS)) {
      result[h] = "processCmd";
    } else if (detectColumn(trimmed, IP_COLS)) {
      result[h] = "ip";
    } else if (detectColumn(trimmed, METHOD_COLS)) {
      result[h] = "method";
    } else if (detectColumn(trimmed, PATH_COLS)) {
      result[h] = "path";
    } else if (detectColumn(trimmed, STATUSCODE_COLS)) {
      result[h] = "statusCode";
    } else if (detectColumn(trimmed, USERAGENT_COLS)) {
      result[h] = "userAgent";
    } else {
      // Store as generic event data so analysis tools can still see it
      result[h] = "eventData";
    }
  }
  return result;
}

function detectFormatAndPlatform(headers: string[]): {
  format: ParsedData["format"];
  platform: LogPlatform;
} {
  const fieldMap = mapHeaders(headers);
  const mappedValues = Object.values(fieldMap);
  const hasEventId = mappedValues.includes("eventId");
  const isLinux = headers.some((h) => LINUX_SOURCE_COLS.has(normalizeCol(h)));
  const platform: LogPlatform = isLinux ? "linux" : "windows";
  const format =
    hasEventId && !isLinux ? ("evtx" as const) : ("unknown" as const);
  return { format, platform };
}

function mapRowToLogEntry(args: {
  row: Record<string, unknown>;
  fieldMap: Record<string, EntryField>;
  platform: LogPlatform;
  sourceFile: string;
  compactMode: boolean;
}): LogEntry {
  const { row, fieldMap, platform, sourceFile, compactMode } = args;

  const entry: LogEntry = {
    timestamp: new Date(0),
    ip: "",
    method: "",
    path: "",
    statusCode: 0,
    size: 0,
    rawLine: "",
    platform,
    eventData: {},
    sourceFile,
  };

  let extraFieldCount = 0;

  for (const [header, field] of Object.entries(fieldMap)) {
    const raw = row[header];
    if (raw === undefined || raw === null || raw === "") continue;

    const stringValue = String(raw).trim();
    if (!stringValue) continue;
    const val = compactMode ? trimForMemory(stringValue) : stringValue;

    switch (field) {
      case "timestamp":
        entry.timestamp = parseTimestamp(raw);
        break;
      case "eventId": {
        const n = parseInt(val, 10);
        if (!isNaN(n)) entry.eventId = n;
        break;
      }
      case "level":
        entry.level = val;
        break;
      case "source":
        entry.source = val;
        break;
      case "computer":
        entry.computer = val;
        entry.host = val;
        break;
      case "message":
        entry.message = val;
        break;
      case "user":
        entry.user = val;
        break;
      case "processName":
        entry.processName = val;
        break;
      case "processCmd":
        entry.processCmd = val;
        break;
      case "pid": {
        const n = parseInt(val, 10);
        if (!isNaN(n)) entry.pid = n;
        break;
      }
      case "ppid": {
        const n = parseInt(val, 10);
        if (!isNaN(n)) entry.ppid = n;
        break;
      }
      case "ip":
        entry.ip = val;
        break;
      case "method":
        entry.method = val;
        break;
      case "path":
        entry.path = val;
        break;
      case "statusCode": {
        const n = parseInt(val, 10);
        if (!isNaN(n)) entry.statusCode = n;
        break;
      }
      case "userAgent":
        entry.userAgent = val;
        break;
      case "eventData":
      default:
        if (compactMode && extraFieldCount >= MAX_COMPACT_EVENTDATA_FIELDS) {
          break;
        }
        entry.eventData![header] = val;
        extraFieldCount += 1;
        break;
    }
  }

  const rawFragments: string[] = [];

  // Include mapped fields first (more structured)
  if (entry.message) rawFragments.push(entry.message);
  if (entry.ip && entry.ip !== "") rawFragments.push(entry.ip);
  if (entry.computer && entry.computer !== "")
    rawFragments.push(entry.computer);
  if (entry.source && entry.source !== "") rawFragments.push(entry.source);
  if (entry.user && entry.user !== "") rawFragments.push(entry.user);
  if (entry.processName && entry.processName !== "")
    rawFragments.push(entry.processName);
  if (entry.processCmd && entry.processCmd !== "")
    rawFragments.push(entry.processCmd);
  if (entry.path && entry.path !== "") rawFragments.push(entry.path);

  // Add eventData fields for better searchability (especially for Excel/CSV)
  if (entry.eventData && Object.keys(entry.eventData).length > 0) {
    const eventDataValues = Object.entries(entry.eventData);
    for (let i = 0; i < eventDataValues.length; i++) {
      if (compactMode && i >= 20) break; // Limit eventData fields in compact mode
      const [key, value] = eventDataValues[i];
      if (value) {
        rawFragments.push(
          compactMode
            ? `${key}=${trimForMemory(String(value), 256)}`
            : `${key}=${String(value)}`,
        );
      }
    }
  }

  entry.rawLine = trimForMemory(
    rawFragments.join(" | "),
    compactMode ? 2048 : 8192,
  );

  return entry;
}

async function parseDelimitedFileStream(
  file: File,
  onProgress?: (processed: number, total: number) => void,
): Promise<ParsedData> {
  return new Promise((resolve, reject) => {
    const entries: LogEntry[] = [];
    let headers: string[] = [];
    let fieldMap: Record<string, EntryField> | null = null;
    let format: ParsedData["format"] = "unknown";
    let platform: LogPlatform = "windows";
    let parsedRows = 0;
    const compactMode = file.size >= LARGE_FILE_COMPACT_THRESHOLD_BYTES;

    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      worker: true,
      chunkSize: 4 * 1024 * 1024,
      delimiter: file.name.toLowerCase().endsWith(".tsv") ? "\t" : "",
      chunk: (results: ParseResult<Record<string, unknown>>) => {
        const rows = (results.data || []) as Record<string, unknown>[];

        if (!fieldMap) {
          headers = (results.meta.fields || []).filter(Boolean);
          if (headers.length === 0 && rows.length > 0) {
            headers = Object.keys(rows[0]);
          }
          fieldMap = mapHeaders(headers);
          const detected = detectFormatAndPlatform(headers);
          format = detected.format;
          platform = detected.platform;
        }

        if (!fieldMap || headers.length === 0) return;

        for (const row of rows) {
          const hasAnyValue = headers.some((header) => {
            const value = row[header];
            return (
              value !== undefined &&
              value !== null &&
              String(value).trim() !== ""
            );
          });
          if (!hasAnyValue) continue;

          entries.push(
            mapRowToLogEntry({
              row,
              fieldMap,
              platform,
              sourceFile: file.name,
              compactMode,
            }),
          );
          parsedRows += 1;
        }

        const cursor =
          typeof results.meta.cursor === "number" ? results.meta.cursor : 0;
        if (onProgress) {
          onProgress(Math.min(cursor, file.size), file.size);
        }
      },
      complete: () => {
        if (onProgress) onProgress(file.size, file.size);
        resolve({
          entries,
          format,
          platform,
          totalLines: parsedRows,
          parsedLines: entries.length,
          sourceFiles: [file.name],
        });
      },
      error: (error: Error) => {
        reject(new Error(`Failed to parse delimited file: ${error.message}`));
      },
    });
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function isExcelFile(file: File): boolean {
  const n = file.name.toLowerCase();
  return n.endsWith(".xlsx") || n.endsWith(".xls");
}

export function isCsvFile(file: File): boolean {
  const n = file.name.toLowerCase();
  return n.endsWith(".csv") || n.endsWith(".tsv");
}

export async function parseExcelFile(
  file: File,
  onProgress?: (processed: number, total: number) => void,
): Promise<ParsedData> {
  if (isCsvFile(file)) {
    return parseDelimitedFileStream(file, onProgress);
  }

  if (file.size > MAX_XLSX_SIZE_BYTES) {
    throw new Error(
      "XLSX/XLS files larger than 1 GB are not practical in browser memory. Export the sheet as CSV/TSV and upload that file instead.",
    );
  }

  // Lazy-load xlsx so it doesn't bloat the main bundle
  const XLSX = await import("xlsx");

  const buffer = await file.arrayBuffer();

  // Parse – cellDates:true makes XLSX convert date serials to JS Date objects
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return {
      entries: [],
      format: "unknown",
      platform: "windows",
      totalLines: 0,
      parsedLines: 0,
      sourceFiles: [file.name],
    };
  }

  const sheet = workbook.Sheets[sheetName];

  // Convert to array of row-objects. raw:false means numbers/dates come as
  // formatted strings, which is safer for heterogeneous SIEM exports.
  // We pass dateNF so that dates look consistent.
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
    dateNF: "yyyy-mm-dd hh:mm:ss",
  });

  if (rows.length === 0) {
    return {
      entries: [],
      format: "unknown",
      platform: "windows",
      totalLines: 0,
      parsedLines: 0,
      sourceFiles: [file.name],
    };
  }

  const headers = Object.keys(rows[0]);
  const fieldMap = mapHeaders(headers);
  const detected = detectFormatAndPlatform(headers);
  const platform = detected.platform;
  const format = detected.format;
  const compactMode = file.size >= LARGE_FILE_COMPACT_THRESHOLD_BYTES;

  const total = rows.length;
  const entries: LogEntry[] = [];

  for (let i = 0; i < rows.length; i++) {
    if (onProgress && i % 500 === 0) onProgress(i, total);

    const row = rows[i];

    entries.push(
      mapRowToLogEntry({
        row,
        fieldMap,
        platform,
        sourceFile: file.name,
        compactMode,
      }),
    );
  }

  if (onProgress) onProgress(total, total);

  return {
    entries,
    format,
    platform,
    totalLines: total,
    parsedLines: entries.length,
    sourceFiles: [file.name],
  };
}
