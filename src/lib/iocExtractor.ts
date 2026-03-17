/**
 * Shared IOC extraction logic used by IOCExtractor component and export reports.
 */

import { LogEntry } from "../types";

export type IOCType =
  | "ip"
  | "domain"
  | "hash"
  | "filepath"
  | "url"
  | "email"
  | "registry"
  | "base64";

export interface ExtractedIOC {
  type: IOCType;
  value: string;
  count: number;
  sources: string[];
}

// Regex patterns for IOC extraction
const IOC_PATTERNS: Record<IOCType, RegExp> = {
  ip: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
  domain:
    /\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+(?:com|net|org|edu|gov|mil|io|co|info|biz|xyz|online|site|tech|cloud|app|dev|me|tv|cc|ru|cn|de|uk|fr|jp|br|au|in|nl|es|it|pl|ca|se|ch|be|at|dk|no|fi|ie|nz|sg|hk|kr|tw|mx|ar|za|ua|cz|hu|ro|gr|pt|il|ae|sa|pk|bd|vn|th|ph|my|id|tr|eg)\b/gi,
  hash: /\b(?:[a-fA-F0-9]{32}|[a-fA-F0-9]{40}|[a-fA-F0-9]{64})\b/g,
  filepath: /[A-Za-z]:\\(?:[^\\/:*?"<>|\r\n\s]+\\)*[^\\/:*?"<>|\r\n\s]+/g,
  url: /https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_+.~#?&/=]*)/gi,
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  registry:
    /\b(?:HKEY_(?:LOCAL_MACHINE|CURRENT_USER|CLASSES_ROOT|USERS|CURRENT_CONFIG)|HKLM|HKCU|HKCR|HKU|HKCC)\\[^\s"'<>|]+/gi,
  base64:
    /\b(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{4}){5,}\b/g,
};

const VERSION_CONTEXT_PATTERNS = [
  /version[:\s]+\d+\.\d+\.\d+\.\d+/gi,
  /v\d+\.\d+\.\d+\.\d+/gi,
  /\d+\.\d+\.\d+\.\d+[\s-]*(build|release|beta|alpha|rc|patch)/gi,
  /(build|release|beta|alpha|rc|patch|rev)[\s-]*\d+\.\d+\.\d+\.\d+/gi,
  /\.NET Framework \d+\.\d+\.\d+\.\d+/gi,
  /Windows \d+\.\d+\.\d+\.\d+/gi,
  /assembly[^,]*\d+\.\d+\.\d+\.\d+/gi,
];

function isVersionString(potentialIP: string, sourceText: string): boolean {
  for (const pattern of VERSION_CONTEXT_PATTERNS) {
    const matches = sourceText.match(pattern);
    if (matches && matches.some((m) => m.includes(potentialIP))) {
      return true;
    }
  }
  const parts = potentialIP.split(".").map(Number);
  if (parts[2] === 0 && parts[3] === 0 && parts[0] < 20) return true;
  return false;
}

const FALSE_POSITIVES: Record<IOCType, string[]> = {
  ip: ["0.0.0.0", "127.0.0.1", "255.255.255.255", "224.0.0.1"],
  domain: ["localhost", "example.com", "test.com"],
  hash: [],
  filepath: [],
  url: [],
  email: [],
  registry: [],
  base64: [],
};

function isReservedIP(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p))) return false;
  const [a, b, c] = parts;
  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 0 && c === 0) return true;
  if (a === 192 && b === 0 && c === 2) return true;
  if (a === 192 && b === 88 && c === 99) return true;
  if (a === 192 && b === 168) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51 && c === 100) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  if (a >= 224 && a <= 239) return true;
  if (a >= 240 && a <= 255) return true;
  return false;
}

/**
 * Check if an IP is RFC-1918 private (10.x, 172.16-31.x, 192.168.x)
 * or other non-routable (loopback, link-local, multicast, etc.).
 * Exported so IOCExtractor UI can classify without re-filtering.
 */
export function isPrivateIP(ip: string): boolean {
  return isReservedIP(ip);
}

/** Domains that are local / infrastructure noise and rarely useful as IOCs. */
const NOISE_DOMAINS = new Set([
  "localhost",
  "wpad",
  "isatap",
  "time.windows.com",
  "ocsp.digicert.com",
  "crl.microsoft.com",
  "ctldl.windowsupdate.com",
  "go.microsoft.com",
]);
const NOISE_SUFFIXES = [
  ".local",
  ".internal",
  ".corp",
  ".lan",
  ".home",
  ".localdomain",
  ".arpa",
  ".windowsupdate.com",
  ".microsoft.com",
  ".msftncsi.com",
  ".msftconnecttest.com",
];

/**
 * Check if a domain is infrastructure noise (internal, Microsoft infra, etc.).
 */
export function isNoiseDomain(domain: string): boolean {
  const d = domain.toLowerCase();
  if (NOISE_DOMAINS.has(d)) return true;
  return NOISE_SUFFIXES.some((s) => d.endsWith(s));
}

function isValidFilePath(path: string): boolean {
  if (path.length < 5) return false;
  if (!/^[A-Za-z]:\\/.test(path)) return false;
  if (/^[A-Za-z]:\\[A-Z]+\s/.test(path)) return false;
  if (!/\.\w{1,10}$/.test(path) && !path.endsWith("\\")) return false;
  return true;
}

function isLikelyBase64(str: string): boolean {
  if (str.length < 20) return false;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(str)) return false;
  if (str.length % 4 !== 0) return false;
  try {
    const decoded = atob(str);
    let printableCount = 0;
    for (let i = 0; i < decoded.length; i++) {
      const code = decoded.charCodeAt(i);
      if (
        (code >= 32 && code < 127) ||
        code === 10 ||
        code === 13 ||
        code === 9
      )
        printableCount++;
    }
    return printableCount / decoded.length > 0.7;
  } catch {
    return false;
  }
}

/**
 * Extract IOCs from log entries.
 * @param entries Log entries to scan
 * @param types Which IOC types to extract (defaults to all VT-scannable types for export)
 */
export function extractIOCsFromEntries(
  entries: LogEntry[],
  types: IOCType[] = ["ip", "domain", "hash", "url"],
): ExtractedIOC[] {
  const iocMap = new Map<string, ExtractedIOC>();

  for (const entry of entries) {
    const searchFields = [
      { name: "rawLine", value: entry.rawLine },
      { name: "message", value: entry.message },
      { name: "path", value: entry.path },
      { name: "ip", value: entry.ip },
      { name: "computer", value: entry.computer },
      { name: "userAgent", value: entry.userAgent },
    ];

    for (const { name, value } of searchFields) {
      if (!value) continue;

      for (const type of types) {
        const pattern = IOC_PATTERNS[type];
        if (!pattern) continue;

        const matches = value.match(pattern);
        if (!matches) continue;

        for (const match of matches) {
          if (FALSE_POSITIVES[type].includes(match.toLowerCase())) continue;
          if (type === "ip" && isReservedIP(match)) continue;
          if (type === "ip" && isVersionString(match, value)) continue;
          if (type === "filepath" && !isValidFilePath(match)) continue;
          if (type === "base64" && !isLikelyBase64(match)) continue;

          const key = `${type}:${match.toLowerCase()}`;
          const existing = iocMap.get(key);
          if (existing) {
            existing.count++;
            if (!existing.sources.includes(name)) existing.sources.push(name);
          } else {
            iocMap.set(key, { type, value: match, count: 1, sources: [name] });
          }
        }
      }
    }
  }

  return Array.from(iocMap.values()).sort(
    (a, b) => b.count - a.count || a.value.localeCompare(b.value),
  );
}
