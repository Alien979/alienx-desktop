/**
 * IOC Enrichment services — AbuseIPDB lookups
 */

// ============================================================================
// Types
// ============================================================================

export interface EnrichmentResult {
  source: "abuseipdb";
  malicious: boolean;
  score: number; // 0–100
  detail: string;
  loading?: boolean;
  error?: string;
}

// ============================================================================
// AbuseIPDB
// ============================================================================

const ABUSEIPDB_STORAGE_KEY = "alienx_abuseipdb_key";

export function saveAbuseIPDBKey(key: string): void {
  localStorage.setItem(ABUSEIPDB_STORAGE_KEY, key);
}

export function getAbuseIPDBKey(): string | null {
  return localStorage.getItem(ABUSEIPDB_STORAGE_KEY);
}

export function clearAbuseIPDBKey(): void {
  localStorage.removeItem(ABUSEIPDB_STORAGE_KEY);
}

export async function lookupAbuseIPDB(
  ip: string,
  apiKey: string,
): Promise<EnrichmentResult> {
  try {
    const res = await fetch(
      `/api/abuseipdb/api/v2/check?ipAddress=${encodeURIComponent(ip)}&maxAgeInDays=90`,
      {
        headers: {
          Key: apiKey,
          Accept: "application/json",
        },
      },
    );
    if (!res.ok) {
      return {
        source: "abuseipdb",
        malicious: false,
        score: 0,
        detail: "",
        error: `HTTP ${res.status}`,
      };
    }
    const json = await res.json();
    const data = json?.data;
    if (!data) {
      return {
        source: "abuseipdb",
        malicious: false,
        score: 0,
        detail: "",
        error: "No data",
      };
    }
    const score = data.abuseConfidenceScore ?? 0;
    const reports = data.totalReports ?? 0;
    const country = data.countryCode || "?";
    const isp = data.isp || "?";
    return {
      source: "abuseipdb",
      malicious: score > 25,
      score,
      detail: `${score}% confidence, ${reports} reports, ${country}, ISP: ${isp}`,
    };
  } catch (e: any) {
    return {
      source: "abuseipdb",
      malicious: false,
      score: 0,
      detail: "",
      error: e.message || "Network error",
    };
  }
}

// ============================================================================
// STIX 2.1 Export
// ============================================================================

interface STIXIndicator {
  type: string;
  value: string;
  count: number;
}

export function exportSTIX(iocs: STIXIndicator[]): string {
  const now = new Date().toISOString();
  const objects: any[] = [];

  // Identity object for the tool
  const identityId = "identity--alienx-evtx-analyzer";
  objects.push({
    type: "identity",
    spec_version: "2.1",
    id: identityId,
    created: now,
    modified: now,
    name: "ALIENX EVTX Analyzer",
    identity_class: "tool",
  });

  for (const ioc of iocs) {
    const id = `indicator--${crypto.randomUUID()}`;
    let pattern = "";

    switch (ioc.type) {
      case "ip":
        pattern = `[ipv4-addr:value = '${ioc.value}']`;
        break;
      case "domain":
        pattern = `[domain-name:value = '${ioc.value}']`;
        break;
      case "url":
        pattern = `[url:value = '${ioc.value}']`;
        break;
      case "hash":
        if (ioc.value.length === 32)
          pattern = `[file:hashes.MD5 = '${ioc.value}']`;
        else if (ioc.value.length === 40)
          pattern = `[file:hashes.'SHA-1' = '${ioc.value}']`;
        else pattern = `[file:hashes.'SHA-256' = '${ioc.value}']`;
        break;
      case "email":
        pattern = `[email-addr:value = '${ioc.value}']`;
        break;
      default:
        continue; // Skip types without STIX patterns
    }

    objects.push({
      type: "indicator",
      spec_version: "2.1",
      id,
      created: now,
      modified: now,
      name: `${ioc.type.toUpperCase()}: ${ioc.value}`,
      pattern,
      pattern_type: "stix",
      valid_from: now,
      indicator_types: ["malicious-activity"],
      created_by_ref: identityId,
      labels: [`ioc-type:${ioc.type}`],
      confidence: Math.min(100, 50 + ioc.count * 5),
    });
  }

  const bundle = {
    type: "bundle",
    id: `bundle--${crypto.randomUUID()}`,
    objects,
  };

  return JSON.stringify(bundle, null, 2);
}
