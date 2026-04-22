/**
 * Central, versioned scan cache for expensive analyses (Sigma/YARA).
 *
 * Goal: avoid re-scans when switching views, and prevent stale reuse when
 * dataset/rules/options change.
 */

export const ANALYSIS_CACHE_VERSION = "v1";

type CacheValue<T> = {
  version: string;
  createdAt: number;
  value: T;
};

const memCache = new Map<string, CacheValue<any>>();

function safeGetSessionItem(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetSessionItem(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Best effort only (storage quota / privacy mode)
  }
}

// Simple stable hash (FNV-1a 32-bit) for cache keys.
export function stableHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function makeDatasetFingerprint(payload: {
  platform?: string | null;
  format?: string | null;
  filename?: string | null;
  entriesCount: number;
  parsedLines?: number | null;
  sourceFiles?: string[] | null;
  firstTimestamp?: string | null;
  lastTimestamp?: string | null;
}): string {
  const normalized = JSON.stringify({
    v: ANALYSIS_CACHE_VERSION,
    platform: payload.platform || null,
    format: payload.format || null,
    filename: payload.filename || null,
    entriesCount: payload.entriesCount,
    parsedLines: payload.parsedLines ?? null,
    sourceFiles: (payload.sourceFiles || []).slice().sort(),
    firstTimestamp: payload.firstTimestamp || null,
    lastTimestamp: payload.lastTimestamp || null,
  });
  return stableHash(normalized);
}

export function makeRulesetFingerprint(payload: {
  kind: "sigma" | "yara";
  ruleIds: string[];
  options?: Record<string, any>;
}): string {
  const normalized = JSON.stringify({
    v: ANALYSIS_CACHE_VERSION,
    kind: payload.kind,
    ruleIds: payload.ruleIds.slice().sort(),
    options: payload.options || {},
  });
  return stableHash(normalized);
}

export function makeCacheKey(parts: {
  kind: "sigma" | "yara";
  datasetFingerprint: string;
  rulesetFingerprint: string;
  engineVersion: string;
  optionsFingerprint?: string;
}): string {
  return [
    "alienx",
    "analysisCache",
    ANALYSIS_CACHE_VERSION,
    parts.kind,
    parts.datasetFingerprint,
    parts.rulesetFingerprint,
    parts.engineVersion,
    parts.optionsFingerprint || "noopt",
  ].join(":");
}

export function getCached<T>(key: string): T | null {
  const mem = memCache.get(key);
  if (mem && mem.version === ANALYSIS_CACHE_VERSION) return mem.value as T;

  const raw = safeGetSessionItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CacheValue<T>;
    if (!parsed || parsed.version !== ANALYSIS_CACHE_VERSION) return null;
    memCache.set(key, parsed);
    return parsed.value;
  } catch {
    return null;
  }
}

export function setCached<T>(key: string, value: T): void {
  const wrapped: CacheValue<T> = {
    version: ANALYSIS_CACHE_VERSION,
    createdAt: Date.now(),
    value,
  };
  memCache.set(key, wrapped);
  safeSetSessionItem(key, JSON.stringify(wrapped));
}

export function clearCached(key: string): void {
  memCache.delete(key);
  try {
    sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

