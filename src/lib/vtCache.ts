/**
 * Persistent VirusTotal results cache using sessionStorage.
 * Survives navigation between views within the same browser session.
 * Cleared when the tab/browser is closed or when the user loads a new file.
 */

import { VTResponse } from "./virusTotal";

const VT_CACHE_KEY = "alienx_vt_cache";

interface VTCacheStore {
  /** Maps "type:value" to VTResponse (excluding loading state) */
  results: Record<string, VTResponse>;
}

function loadCache(): VTCacheStore {
  try {
    const raw = sessionStorage.getItem(VT_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as VTCacheStore;
      if (parsed && typeof parsed.results === "object") {
        return parsed;
      }
    }
  } catch {
    // Corrupted cache — reset
  }
  return { results: {} };
}

function saveCache(cache: VTCacheStore): void {
  try {
    sessionStorage.setItem(VT_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Storage full — silently fail
  }
}

/** Get a cached VT result for a key like "ip:1.2.3.4" */
export function getCachedVTResult(key: string): VTResponse | undefined {
  const cache = loadCache();
  return cache.results[key];
}

/** Store a VT result. Skips entries that are still loading. */
export function setCachedVTResult(key: string, result: VTResponse): void {
  if (result.loading) return; // never cache loading states
  const cache = loadCache();
  cache.results[key] = result;
  saveCache(cache);
}

/** Bulk-load all cached results into a Map (for component init). */
export function getAllCachedVTResults(): Map<string, VTResponse> {
  const cache = loadCache();
  return new Map(Object.entries(cache.results));
}

/** Bulk-save a whole Map of results. */
export function bulkSaveVTResults(results: Map<string, VTResponse>): void {
  const cache = loadCache();
  for (const [key, val] of results) {
    if (!val.loading) {
      cache.results[key] = val;
    }
  }
  saveCache(cache);
}

/** Clear the VT cache (e.g., when loading a new file). */
export function clearVTCache(): void {
  sessionStorage.removeItem(VT_CACHE_KEY);
}
