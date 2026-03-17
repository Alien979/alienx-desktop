// VirusTotal API integration
// API Documentation: https://developers.virustotal.com/reference/overview

export interface VTResponse {
  positives: number;
  total: number;
  scanDate?: string;
  permalink?: string;
  error?: string;
  loading?: boolean;
}

export interface VTFileReport {
  positives: number;
  total: number;
  scanDate: string;
  permalink: string;
  scans?: Record<string, { detected: boolean; result: string }>;
}

export interface VTIPReport {
  asOwner?: string;
  country?: string;
  detectedUrls?: number;
  detectedCommunicatingSamples?: number;
  detectedDownloadedSamples?: number;
}

export interface VTDomainReport {
  categories?: string[];
  detectedUrls?: number;
  detectedCommunicatingSamples?: number;
  detectedDownloadedSamples?: number;
  whoisDate?: string;
}

// Rate limiting: VT public API allows 4 requests/minute
const RATE_LIMIT_DELAY = 15500; // 15.5 seconds between requests
const MAX_RETRIES = 2;
const RETRY_DELAY = 20000; // 20 seconds before retry on 429
let lastRequestTime = 0;

async function rateLimitedFetch(
  url: string,
  options: RequestInit,
): Promise<Response> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < RATE_LIMIT_DELAY) {
    await new Promise((resolve) =>
      setTimeout(resolve, RATE_LIMIT_DELAY - timeSinceLastRequest),
    );
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    lastRequestTime = Date.now();
    const response = await fetch(url, options);

    if (response.status === 429 && attempt < MAX_RETRIES) {
      // Rate-limited by server — wait and retry
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
      continue;
    }

    return response;
  }

  // Shouldn't reach here, but satisfy TS
  lastRequestTime = Date.now();
  return fetch(url, options);
}

// Lookup file hash (MD5, SHA1, SHA256)
export async function lookupHash(
  hash: string,
  apiKey: string,
): Promise<VTResponse> {
  try {
    const response = await rateLimitedFetch(
      `https://www.virustotal.com/api/v3/files/${hash}`,
      {
        headers: {
          "x-apikey": apiKey,
        },
      },
    );

    if (response.status === 404) {
      return { positives: 0, total: 0, error: "Not found in VT database" };
    }

    if (response.status === 401) {
      return { positives: 0, total: 0, error: "Invalid API key" };
    }

    if (response.status === 429) {
      return { positives: 0, total: 0, error: "Rate limit exceeded" };
    }

    if (!response.ok) {
      return { positives: 0, total: 0, error: `API error: ${response.status}` };
    }

    const data = await response.json();
    const stats = data.data?.attributes?.last_analysis_stats;

    if (!stats) {
      return { positives: 0, total: 0, error: "Invalid response format" };
    }

    const positives = stats.malicious + stats.suspicious;
    const total =
      stats.malicious + stats.suspicious + stats.undetected + stats.harmless;

    return {
      positives,
      total,
      scanDate: data.data?.attributes?.last_analysis_date
        ? new Date(data.data.attributes.last_analysis_date * 1000).toISOString()
        : undefined,
      permalink: `https://www.virustotal.com/gui/file/${hash}`,
    };
  } catch (error) {
    return { positives: 0, total: 0, error: `Network error: ${error}` };
  }
}

// Lookup IP address
export async function lookupIP(
  ip: string,
  apiKey: string,
): Promise<VTResponse> {
  try {
    const response = await rateLimitedFetch(
      `https://www.virustotal.com/api/v3/ip_addresses/${ip}`,
      {
        headers: {
          "x-apikey": apiKey,
        },
      },
    );

    if (response.status === 404) {
      return { positives: 0, total: 0, error: "Not found in VT database" };
    }

    if (response.status === 401) {
      return { positives: 0, total: 0, error: "Invalid API key" };
    }

    if (response.status === 429) {
      return { positives: 0, total: 0, error: "Rate limit exceeded" };
    }

    if (!response.ok) {
      return { positives: 0, total: 0, error: `API error: ${response.status}` };
    }

    const data = await response.json();
    const stats = data.data?.attributes?.last_analysis_stats;

    if (!stats) {
      return { positives: 0, total: 0 };
    }

    const positives = stats.malicious + stats.suspicious;
    const total =
      stats.malicious + stats.suspicious + stats.undetected + stats.harmless;

    return {
      positives,
      total,
      permalink: `https://www.virustotal.com/gui/ip-address/${ip}`,
    };
  } catch (error) {
    return { positives: 0, total: 0, error: `Network error: ${error}` };
  }
}

// Lookup domain
export async function lookupDomain(
  domain: string,
  apiKey: string,
): Promise<VTResponse> {
  try {
    const response = await rateLimitedFetch(
      `https://www.virustotal.com/api/v3/domains/${domain}`,
      {
        headers: {
          "x-apikey": apiKey,
        },
      },
    );

    if (response.status === 404) {
      return { positives: 0, total: 0, error: "Not found in VT database" };
    }

    if (response.status === 401) {
      return { positives: 0, total: 0, error: "Invalid API key" };
    }

    if (response.status === 429) {
      return { positives: 0, total: 0, error: "Rate limit exceeded" };
    }

    if (!response.ok) {
      return { positives: 0, total: 0, error: `API error: ${response.status}` };
    }

    const data = await response.json();
    const stats = data.data?.attributes?.last_analysis_stats;

    if (!stats) {
      return { positives: 0, total: 0 };
    }

    const positives = stats.malicious + stats.suspicious;
    const total =
      stats.malicious + stats.suspicious + stats.undetected + stats.harmless;

    return {
      positives,
      total,
      permalink: `https://www.virustotal.com/gui/domain/${domain}`,
    };
  } catch (error) {
    return { positives: 0, total: 0, error: `Network error: ${error}` };
  }
}

// Lookup URL
export async function lookupURL(
  url: string,
  apiKey: string,
): Promise<VTResponse> {
  try {
    // VT uses base64-encoded URL as identifier
    const urlId = btoa(url).replace(/=/g, "");

    const response = await rateLimitedFetch(
      `https://www.virustotal.com/api/v3/urls/${urlId}`,
      {
        headers: {
          "x-apikey": apiKey,
        },
      },
    );

    if (response.status === 404) {
      return { positives: 0, total: 0, error: "Not found in VT database" };
    }

    if (response.status === 401) {
      return { positives: 0, total: 0, error: "Invalid API key" };
    }

    if (response.status === 429) {
      return { positives: 0, total: 0, error: "Rate limit exceeded" };
    }

    if (!response.ok) {
      return { positives: 0, total: 0, error: `API error: ${response.status}` };
    }

    const data = await response.json();
    const stats = data.data?.attributes?.last_analysis_stats;

    if (!stats) {
      return { positives: 0, total: 0 };
    }

    const positives = stats.malicious + stats.suspicious;
    const total =
      stats.malicious + stats.suspicious + stats.undetected + stats.harmless;

    return {
      positives,
      total,
      permalink: `https://www.virustotal.com/gui/url/${urlId}`,
    };
  } catch (error) {
    return { positives: 0, total: 0, error: `Network error: ${error}` };
  }
}

// Generic lookup based on IOC type
export async function lookupIOC(
  type: "ip" | "domain" | "hash" | "url",
  value: string,
  apiKey: string,
): Promise<VTResponse> {
  switch (type) {
    case "ip":
      return lookupIP(value, apiKey);
    case "domain":
      return lookupDomain(value, apiKey);
    case "hash":
      return lookupHash(value, apiKey);
    case "url":
      return lookupURL(value, apiKey);
    default:
      return { positives: 0, total: 0, error: "Unsupported IOC type" };
  }
}

// Store API key in localStorage
export function saveAPIKey(key: string): void {
  localStorage.setItem("vt_api_key", key);
}

export function getAPIKey(): string | null {
  return localStorage.getItem("vt_api_key");
}

export function clearAPIKey(): void {
  localStorage.removeItem("vt_api_key");
}
