import { useMemo, useState, useCallback, useEffect } from "react";
import { LogEntry } from "../types";
import {
  lookupIOC,
  VTResponse,
  getAPIKey,
  saveAPIKey,
  clearAPIKey,
} from "../lib/virusTotal";
import {
  getAllCachedVTResults,
  setCachedVTResult,
  bulkSaveVTResults,
} from "../lib/vtCache";
import { SigmaRuleMatch } from "../lib/sigma/types";
import { isPrivateIP, isNoiseDomain } from "../lib/iocExtractor";
import {
  EnrichmentResult,
  lookupAbuseIPDB,
  getAbuseIPDBKey,
  saveAbuseIPDBKey,
  clearAbuseIPDBKey,
  exportSTIX,
} from "../lib/iocEnrichment";
import {
  addThreatActorIOC,
  createThreatActor,
  deleteThreatActor,
  deleteThreatActorIOC,
  getThreatActors,
  ThreatActorProfile,
} from "../lib/threatActorRepo";
import { IOCPivotView } from "./IOCPivotView";
import "./IOCExtractor.css";

interface IOCExtractorProps {
  entries: LogEntry[];
  onBack: () => void;
  sigmaMatches?: Map<string, SigmaRuleMatch[]>;
}

// IOC types
type IOCType =
  | "ip"
  | "domain"
  | "hash"
  | "filepath"
  | "url"
  | "email"
  | "registry"
  | "base64";

interface ExtractedIOC {
  type: IOCType;
  value: string;
  count: number;
  sources: string[]; // Which fields it was found in
}

// Patterns that look like version strings (to filter false positive IPs)
const VERSION_CONTEXT_PATTERNS = [
  /version[:\s]+\d+\.\d+\.\d+\.\d+/gi,
  /v\d+\.\d+\.\d+\.\d+/gi,
  /\d+\.\d+\.\d+\.\d+[\s-]*(build|release|beta|alpha|rc|patch)/gi,
  /(build|release|beta|alpha|rc|patch|rev)[\s-]*\d+\.\d+\.\d+\.\d+/gi,
  /\.NET Framework \d+\.\d+\.\d+\.\d+/gi,
  /Windows \d+\.\d+\.\d+\.\d+/gi,
  /assembly[^,]*\d+\.\d+\.\d+\.\d+/gi,
];

// Check if an IP-like string appears in a version context within the source text
function isVersionString(potentialIP: string, sourceText: string): boolean {
  // Check if this IP appears in a version-like context
  for (const pattern of VERSION_CONTEXT_PATTERNS) {
    const matches = sourceText.match(pattern);
    if (matches && matches.some((m) => m.includes(potentialIP))) {
      return true;
    }
  }

  // Also filter IPs that end with .0 in the last two octets (common version patterns)
  // e.g., 6.0.0.0, 4.0.0.0, 2.0.0.0 are almost always versions
  const parts = potentialIP.split(".").map(Number);
  if (parts[2] === 0 && parts[3] === 0 && parts[0] < 20) {
    return true;
  }

  return false;
}

// Regex patterns for IOC extraction
const IOC_PATTERNS: Record<IOCType, RegExp> = {
  ip: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
  domain:
    /\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+(?:com|net|org|edu|gov|mil|io|co|info|biz|xyz|online|site|tech|cloud|app|dev|me|tv|cc|ru|cn|de|uk|fr|jp|br|au|in|nl|es|it|pl|ca|se|ch|be|at|dk|no|fi|ie|nz|sg|hk|kr|tw|mx|ar|za|ua|cz|hu|ro|gr|pt|il|ae|sa|pk|bd|vn|th|ph|my|id|tr|eg)\b/gi,
  hash: /\b(?:[a-fA-F0-9]{32}|[a-fA-F0-9]{40}|[a-fA-F0-9]{64})\b/g,
  // Only match Windows paths (C:\...) - Unix paths have too many false positives with command args
  filepath: /[A-Za-z]:\\(?:[^\\/:*?"<>|\r\n\s]+\\)*[^\\/:*?"<>|\r\n\s]+/g,
  url: /https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_+.~#?&/=]*)/gi,
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  // Registry keys - matches common Windows registry hives and paths
  registry:
    /\b(?:HKEY_(?:LOCAL_MACHINE|CURRENT_USER|CLASSES_ROOT|USERS|CURRENT_CONFIG)|HKLM|HKCU|HKCR|HKU|HKCC)\\[^\s"'<>|]+/gi,
  // Base64 - matches strings that are likely Base64 encoded (min 20 chars, proper padding)
  base64:
    /\b(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{4}){5,}\b/g,
};

// Validate file path to filter out command-line arguments
function isValidFilePath(path: string): boolean {
  // Must be at least 5 chars (e.g., C:\a)
  if (path.length < 5) return false;
  // Must start with drive letter
  if (!/^[A-Za-z]:\\/.test(path)) return false;
  // Must not contain typical command-line argument patterns
  if (/^[A-Za-z]:\\[A-Z]+\s/.test(path)) return false;
  // Must have a file extension or be a directory path ending in \
  if (!/\.\w{1,10}$/.test(path) && !path.endsWith("\\")) return false;
  return true;
}

// Validate Base64 string - check if it decodes to something meaningful
function isLikelyBase64(str: string): boolean {
  // Must be at least 20 chars to avoid false positives
  if (str.length < 20) return false;

  // Check for proper Base64 structure
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(str)) return false;

  // Length must be valid for Base64 (multiple of 4)
  if (str.length % 4 !== 0) return false;

  try {
    const decoded = atob(str);
    // Check if decoded content has mostly printable ASCII or common binary patterns
    let printableCount = 0;
    let controlCount = 0;
    for (let i = 0; i < decoded.length && i < 100; i++) {
      const code = decoded.charCodeAt(i);
      if (code >= 32 && code <= 126) printableCount++;
      else if (code < 32 && code !== 9 && code !== 10 && code !== 13)
        controlCount++;
    }
    // If more than 60% printable or has PowerShell/command indicators, likely real
    const sampleLength = Math.min(decoded.length, 100);
    const printableRatio = printableCount / sampleLength;

    // Look for command-like patterns in decoded content
    const hasCommandPatterns =
      /powershell|cmd|invoke|iex|downloadstring|webclient|system\.|exec|eval/i.test(
        decoded,
      );

    return printableRatio > 0.6 || hasCommandPatterns;
  } catch {
    return false;
  }
}

// IOC type labels and icons
const IOC_INFO: Record<
  IOCType,
  { label: string; icon: string; description: string }
> = {
  ip: {
    label: "IP Addresses",
    icon: "🌐",
    description: "IPv4 addresses found in logs",
  },
  domain: {
    label: "Domains",
    icon: "🔗",
    description: "Domain names and hostnames",
  },
  hash: {
    label: "File Hashes",
    icon: "🔑",
    description: "MD5, SHA1, and SHA256 hashes",
  },
  filepath: {
    label: "File Paths",
    icon: "📁",
    description: "Windows and Unix file paths",
  },
  url: { label: "URLs", icon: "🔗", description: "Full URLs with protocols" },
  email: {
    label: "Email Addresses",
    icon: "📧",
    description: "Email addresses",
  },
  registry: {
    label: "Registry Keys",
    icon: "🗝️",
    description: "Windows registry key paths",
  },
  base64: {
    label: "Base64 Strings",
    icon: "🔐",
    description: "Encoded strings (potentially malicious commands)",
  },
};

// Filter out common false positives
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

const IOC_DETECTION_PRIORITY: IOCType[] = [
  "url",
  "email",
  "registry",
  "filepath",
  "hash",
  "ip",
  "domain",
  "base64",
];

function detectIOCTypeAndValue(token: string): {
  type: IOCType;
  value: string;
} | null {
  const trimmed = token.trim();
  if (!trimmed) return null;

  const tokenLower = trimmed.toLowerCase();
  for (const type of IOC_DETECTION_PRIORITY) {
    const pattern = IOC_PATTERNS[type];
    try {
      pattern.lastIndex = 0;
    } catch {
      // ignore
    }

    const matches = trimmed.match(pattern);
    if (!matches || matches.length === 0) continue;

    // Ensure the match is (at least) the full token, not just a substring.
    const hasExact = matches.some((m) => m.toLowerCase() === tokenLower);
    if (!hasExact) continue;

    if (FALSE_POSITIVES[type].includes(tokenLower)) continue;

    // Reduce false positives using the same heuristics as extraction.
    if (type === "ip" && isVersionString(trimmed, trimmed)) continue;
    if (type === "filepath" && !isValidFilePath(trimmed)) continue;
    if (type === "base64" && !isLikelyBase64(trimmed)) continue;

    return { type, value: trimmed };
  }

  return null;
}

// Common benign paths to optionally filter
const BENIGN_PATHS = [
  "C:\\Windows\\System32",
  "C:\\Windows\\SysWOW64",
  "C:\\Program Files",
  "C:\\Program Files (x86)",
  "/usr/bin",
  "/usr/lib",
  "/bin",
  "/sbin",
];

export default function IOCExtractor({
  entries,
  onBack,
  sigmaMatches,
}: IOCExtractorProps) {
  const [selectedTypes, setSelectedTypes] = useState<Set<IOCType>>(
    new Set([
      "ip",
      "domain",
      "hash",
      "filepath",
      "url",
      "email",
      "registry",
      "base64",
    ]),
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [showBenignPaths, setShowBenignPaths] = useState(false);
  const [showPrivateIPs, setShowPrivateIPs] = useState(false);
  const [showNoiseDomains, setShowNoiseDomains] = useState(false);
  const [copiedIOC, setCopiedIOC] = useState<string | null>(null);

  // VirusTotal integration state — initialise from persistent cache
  const [vtApiKey, setVtApiKey] = useState<string>(getAPIKey() || "");
  const [showVtConfig, setShowVtConfig] = useState(false);
  const [vtResults, setVtResults] = useState<Map<string, VTResponse>>(() =>
    getAllCachedVTResults(),
  );
  const [vtLookupQueue, setVtLookupQueue] = useState<string[]>([]);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [categoryLookingUp, setCategoryLookingUp] = useState<IOCType | null>(
    null,
  );
  const hasVtKey = vtApiKey.trim().length > 0;

  // AbuseIPDB enrichment state
  const [abuseIPDBKey, setAbuseIPDBKey] = useState<string>(
    getAbuseIPDBKey() || "",
  );
  const [abuseKeySaved, setAbuseKeySaved] =
    useState<boolean>(!!getAbuseIPDBKey());
  const hasAbuseKey = abuseKeySaved;
  const [enrichResults, setEnrichResults] = useState<
    Map<string, EnrichmentResult>
  >(new Map());

  // Persist VT results to sessionStorage whenever they change
  useEffect(() => {
    bulkSaveVTResults(vtResults);
  }, [vtResults]);

  // Pivot functionality state
  const [pivotIOC, setPivotIOC] = useState<ExtractedIOC | null>(null);

  // Threat actor repository state
  const [threatActors, setThreatActors] = useState<ThreatActorProfile[]>(() =>
    getThreatActors(),
  );
  const [selectedThreatActorId, setSelectedThreatActorId] =
    useState<string>("");
  const [newThreatActorName, setNewThreatActorName] = useState("");
  const [newThreatActorAliases, setNewThreatActorAliases] = useState("");
  const [newThreatActorDescription, setNewThreatActorDescription] =
    useState("");
  const [newActorIOCType, setNewActorIOCType] = useState<IOCType>("ip");
  const [newActorIOCValue, setNewActorIOCValue] = useState("");
  const [newActorBulkIOCText, setNewActorBulkIOCText] = useState("");
  const [newActorIOCNote, setNewActorIOCNote] = useState("");
  const [threatRepoError, setThreatRepoError] = useState<string | null>(null);
  const [feedName, setFeedName] = useState("Imported Feed");

  // Progressive loading for IOC lists per type
  const IOC_PAGE_SIZE = 100;
  const [iocVisiblePerType, setIocVisiblePerType] = useState<
    Record<string, number>
  >({});

  // Process all entries for IOC extraction
  const limitedEntries = useMemo(() => entries, [entries]);

  // Extract all IOCs from log entries
  const extractedIOCs = useMemo(() => {
    const iocMap = new Map<string, ExtractedIOC>();

    for (const entry of limitedEntries) {
      // Fields to search for IOCs
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

        // Extract each IOC type
        for (const [type, pattern] of Object.entries(IOC_PATTERNS) as [
          IOCType,
          RegExp,
        ][]) {
          const matches = value.match(pattern);
          if (!matches) continue;

          for (const match of matches) {
            // Skip false positives
            if (FALSE_POSITIVES[type].includes(match.toLowerCase())) continue;

            // Skip version strings that look like IPs (e.g., 6.0.0.0, Version 4.0.0.0)
            if (type === "ip" && isVersionString(match, value)) continue;

            // Validate file paths to filter out command-line fragments
            if (type === "filepath" && !isValidFilePath(match)) continue;

            // Validate Base64 strings to reduce false positives
            if (type === "base64" && !isLikelyBase64(match)) continue;

            const key = `${type}:${match.toLowerCase()}`;
            const existing = iocMap.get(key);

            if (existing) {
              existing.count++;
              if (!existing.sources.includes(name)) {
                existing.sources.push(name);
              }
            } else {
              iocMap.set(key, {
                type,
                value: match,
                count: 1,
                sources: [name],
              });
            }
          }
        }
      }
    }

    return Array.from(iocMap.values());
  }, [entries]);

  // Count hidden items for toggle labels
  const hiddenCounts = useMemo(() => {
    let privateIPs = 0;
    let noiseDomains = 0;
    let benignPaths = 0;
    for (const ioc of extractedIOCs) {
      if (ioc.type === "ip" && isPrivateIP(ioc.value)) privateIPs++;
      if (ioc.type === "domain" && isNoiseDomain(ioc.value)) noiseDomains++;
      if (
        ioc.type === "filepath" &&
        BENIGN_PATHS.some((bp) =>
          ioc.value.toLowerCase().startsWith(bp.toLowerCase()),
        )
      )
        benignPaths++;
    }
    return { privateIPs, noiseDomains, benignPaths };
  }, [extractedIOCs]);

  // Filter and sort IOCs
  const filteredIOCs = useMemo(() => {
    let result = extractedIOCs.filter((ioc) => selectedTypes.has(ioc.type));

    // Filter private IPs unless toggle is on
    if (!showPrivateIPs) {
      result = result.filter(
        (ioc) => !(ioc.type === "ip" && isPrivateIP(ioc.value)),
      );
    }

    // Filter noise domains unless toggle is on
    if (!showNoiseDomains) {
      result = result.filter(
        (ioc) => !(ioc.type === "domain" && isNoiseDomain(ioc.value)),
      );
    }

    // Filter benign paths unless toggle is on
    if (!showBenignPaths) {
      result = result.filter(
        (ioc) =>
          !(
            ioc.type === "filepath" &&
            BENIGN_PATHS.some((bp) =>
              ioc.value.toLowerCase().startsWith(bp.toLowerCase()),
            )
          ),
      );
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter((ioc) => ioc.value.toLowerCase().includes(query));
    }

    // Sort by count descending, then alphabetically
    return result.sort(
      (a, b) => b.count - a.count || a.value.localeCompare(b.value),
    );
  }, [
    extractedIOCs,
    selectedTypes,
    searchQuery,
    showPrivateIPs,
    showNoiseDomains,
    showBenignPaths,
  ]);

  // Group IOCs by type for display
  const groupedIOCs = useMemo(() => {
    const groups: Record<IOCType, ExtractedIOC[]> = {
      ip: [],
      domain: [],
      hash: [],
      filepath: [],
      url: [],
      email: [],
      registry: [],
      base64: [],
    };

    for (const ioc of filteredIOCs) {
      groups[ioc.type].push(ioc);
    }

    return groups;
  }, [filteredIOCs]);

  const actorMatchSummaries = useMemo(() => {
    const observed = new Map<string, number>();
    for (const ioc of extractedIOCs) {
      observed.set(`${ioc.type}:${ioc.value.toLowerCase()}`, ioc.count);
    }

    return threatActors.map((actor) => {
      let matched = 0;
      let totalHits = 0;
      for (const ioc of actor.iocs) {
        const key = `${ioc.type}:${ioc.value.toLowerCase()}`;
        const hits = observed.get(key) || 0;
        if (hits > 0) {
          matched += 1;
          totalHits += hits;
        }
      }
      return {
        actorId: actor.id,
        matched,
        totalIocs: actor.iocs.length,
        totalHits,
      };
    });
  }, [threatActors, extractedIOCs]);

  const knownIOCSet = useMemo(() => {
    const set = new Set<string>();
    for (const actor of threatActors) {
      for (const ioc of actor.iocs) {
        set.add(`${ioc.type}:${ioc.value.toLowerCase()}`);
      }
    }
    return set;
  }, [threatActors]);

  // Stats
  const stats = useMemo(() => {
    const byType: Record<IOCType, number> = {
      ip: 0,
      domain: 0,
      hash: 0,
      filepath: 0,
      url: 0,
      email: 0,
      registry: 0,
      base64: 0,
    };

    for (const ioc of extractedIOCs) {
      byType[ioc.type]++;
    }

    return {
      total: extractedIOCs.length,
      filtered: filteredIOCs.length,
      byType,
    };
  }, [extractedIOCs, filteredIOCs]);

  // VirusTotal API key handlers
  const handleSaveApiKey = useCallback(() => {
    if (vtApiKey.trim()) {
      saveAPIKey(vtApiKey.trim());
      setShowVtConfig(false);
    }
  }, [vtApiKey]);

  const handleClearApiKey = useCallback(() => {
    clearAPIKey();
    setVtApiKey("");
    setVtResults(new Map());
  }, []);

  // Lookup single IOC on VirusTotal
  const lookupSingleIOC = useCallback(
    async (type: IOCType, value: string) => {
      const apiKey = getAPIKey();
      if (!apiKey || !hasVtKey) {
        alert(
          "VirusTotal API key is required. Please configure your API key first.",
        );
        setShowVtConfig(true);
        return;
      }

      if (!["ip", "domain", "hash", "url"].includes(type)) return;

      const key = `${type}:${value}`;
      setVtResults((prev) =>
        new Map(prev).set(key, { positives: 0, total: 0, loading: true }),
      );

      const result = await lookupIOC(
        type as "ip" | "domain" | "hash" | "url",
        value,
        apiKey,
      );
      setVtResults((prev) => {
        const next = new Map(prev).set(key, result);
        setCachedVTResult(key, result);
        return next;
      });
    },
    [hasVtKey],
  );

  // Batch lookup all IOCs on VirusTotal
  const lookupAllIOCs = useCallback(async () => {
    if (isLookingUp) return; // Prevent concurrent scans
    const apiKey = getAPIKey();
    if (!apiKey || !hasVtKey) {
      alert(
        "VirusTotal API key is required. Please configure your API key first.",
      );
      setShowVtConfig(true);
      return;
    }

    const supportedIOCs = extractedIOCs.filter((ioc) =>
      ["ip", "domain", "hash", "url"].includes(ioc.type),
    );

    if (supportedIOCs.length === 0) {
      alert(
        "No supported IOCs found for VirusTotal lookup. Only IPs, domains, hashes, and URLs are supported.",
      );
      return;
    }

    setIsLookingUp(true);
    setVtLookupQueue(supportedIOCs.map((ioc) => `${ioc.type}:${ioc.value}`));

    // Snapshot already-completed keys to avoid stale closure reads of vtResults
    const alreadyDone = new Set<string>();
    vtResults.forEach((v, k) => {
      if (!v.error && !v.loading) alreadyDone.add(k);
    });

    for (const ioc of supportedIOCs) {
      const key = `${ioc.type}:${ioc.value}`;
      // Skip already-cached results that aren't errors
      if (alreadyDone.has(key)) {
        setVtLookupQueue((prev) => prev.filter((k) => k !== key));
        continue;
      }

      setVtResults((prev) =>
        new Map(prev).set(key, { positives: 0, total: 0, loading: true }),
      );
      const result = await lookupIOC(
        ioc.type as "ip" | "domain" | "hash" | "url",
        ioc.value,
        apiKey,
      );
      setVtResults((prev) => {
        const next = new Map(prev).set(key, result);
        setCachedVTResult(key, result);
        return next;
      });
      // Track this key so subsequent iterations skip it
      if (!result.error) alreadyDone.add(key);
      setVtLookupQueue((prev) => prev.filter((k) => k !== key));
    }

    setIsLookingUp(false);
  }, [extractedIOCs, vtResults, hasVtKey, isLookingUp]);

  // Lookup all IOCs of a specific category on VirusTotal
  const lookupCategoryIOCs = useCallback(
    async (category: IOCType) => {
      if (isLookingUp) return; // Prevent concurrent scans
      const apiKey = getAPIKey();
      if (!apiKey || !hasVtKey) {
        alert(
          "VirusTotal API key is required. Please configure your API key first.",
        );
        setShowVtConfig(true);
        return;
      }

      if (!["ip", "domain", "hash", "url"].includes(category)) {
        alert(
          `VirusTotal lookup is not supported for ${IOC_INFO[category].label}.`,
        );
        return;
      }

      const categoryIOCs = extractedIOCs.filter((ioc) => ioc.type === category);
      if (categoryIOCs.length === 0) return;

      setCategoryLookingUp(category);
      setIsLookingUp(true);
      setVtLookupQueue(categoryIOCs.map((ioc) => `${ioc.type}:${ioc.value}`));

      // Snapshot already-completed keys to avoid stale closure reads of vtResults
      const alreadyDone = new Set<string>();
      vtResults.forEach((v, k) => {
        if (!v.error && !v.loading) alreadyDone.add(k);
      });

      for (const ioc of categoryIOCs) {
        const key = `${ioc.type}:${ioc.value}`;
        // Skip already-cached results that aren't errors
        if (alreadyDone.has(key)) {
          setVtLookupQueue((prev) => prev.filter((k) => k !== key));
          continue;
        }

        setVtResults((prev) =>
          new Map(prev).set(key, { positives: 0, total: 0, loading: true }),
        );
        const result = await lookupIOC(
          ioc.type as "ip" | "domain" | "hash" | "url",
          ioc.value,
          apiKey,
        );
        setVtResults((prev) => {
          const next = new Map(prev).set(key, result);
          setCachedVTResult(key, result);
          return next;
        });
        // Track this key so subsequent iterations skip it
        if (!result.error) alreadyDone.add(key);
        setVtLookupQueue((prev) => prev.filter((k) => k !== key));
      }

      setCategoryLookingUp(null);
      setIsLookingUp(false);
    },
    [extractedIOCs, vtResults, hasVtKey, isLookingUp],
  );

  // ===== AbuseIPDB Enrichment =====
  const lookupAbuseIPDBSingle = useCallback(async (ip: string) => {
    const key = getAbuseIPDBKey();
    if (!key) {
      alert(
        "AbuseIPDB API key is required. Please save your key in the config panel first.",
      );
      return;
    }
    const rk = `abuseipdb:${ip}`;
    setEnrichResults((prev) =>
      new Map(prev).set(rk, {
        source: "abuseipdb",
        malicious: false,
        score: 0,
        detail: "",
        loading: true,
      }),
    );
    try {
      const result = await lookupAbuseIPDB(ip, key);
      setEnrichResults((prev) => new Map(prev).set(rk, result));
    } catch (err) {
      console.error("AbuseIPDB lookup failed:", err);
      setEnrichResults((prev) =>
        new Map(prev).set(rk, {
          source: "abuseipdb" as const,
          malicious: false,
          score: 0,
          detail: "",
          error: "Network error",
        }),
      );
    }
  }, []);

  // ===== STIX Export =====
  const exportSTIXBundle = useCallback(() => {
    const stixIOCs = filteredIOCs
      .filter((ioc) =>
        ["ip", "domain", "url", "hash", "email"].includes(ioc.type),
      )
      .map((ioc) => ({ type: ioc.type, value: ioc.value, count: ioc.count }));
    if (stixIOCs.length === 0) {
      alert("No IOCs of exportable type (IP, domain, URL, hash, email) found.");
      return;
    }
    const json = exportSTIX(stixIOCs);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "alienx_iocs.stix.json";
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredIOCs]);

  // Toggle IOC type filter
  const toggleType = useCallback((type: IOCType) => {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }, []);

  // Copy single IOC
  const copyIOC = useCallback((value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedIOC(value);
    setTimeout(() => setCopiedIOC(null), 2000);
  }, []);

  // Copy all IOCs of a type
  const copyAllOfType = useCallback(
    (type: IOCType) => {
      const values = groupedIOCs[type].map((ioc) => ioc.value).join("\n");
      navigator.clipboard.writeText(values);
      setCopiedIOC(`all-${type}`);
      setTimeout(() => setCopiedIOC(null), 2000);
    },
    [groupedIOCs],
  );

  // Export all filtered IOCs
  const exportIOCs = useCallback(() => {
    const output: Record<string, string[]> = {};

    for (const [type, iocs] of Object.entries(groupedIOCs)) {
      if (iocs.length > 0) {
        output[type] = iocs.map((ioc) => ioc.value);
      }
    }

    const json = JSON.stringify(output, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "extracted_iocs.json";
    a.click();
    URL.revokeObjectURL(url);
  }, [groupedIOCs]);

  // Export as CSV
  const exportCSV = useCallback(() => {
    const rows = ["Type,Value,Count,Sources"];

    for (const ioc of filteredIOCs) {
      rows.push(
        `${ioc.type},"${ioc.value}",${ioc.count},"${ioc.sources.join("; ")}"`,
      );
    }

    const csv = rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "extracted_iocs.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredIOCs]);

  const refreshThreatRepo = useCallback(() => {
    setThreatActors(getThreatActors());
  }, []);

  const handleCreateThreatActor = useCallback(() => {
    const result = createThreatActor({
      name: newThreatActorName,
      aliases: newThreatActorAliases,
      description: newThreatActorDescription,
    });
    if (!result.ok) {
      setThreatRepoError(result.error);
      return;
    }
    setThreatRepoError(null);
    setNewThreatActorName("");
    setNewThreatActorAliases("");
    setNewThreatActorDescription("");
    setSelectedThreatActorId(result.actor.id);
    refreshThreatRepo();
  }, [
    newThreatActorAliases,
    newThreatActorDescription,
    newThreatActorName,
    refreshThreatRepo,
  ]);

  const handleAddThreatActorIOC = useCallback(() => {
    if (!selectedThreatActorId) {
      setThreatRepoError("Select a threat actor first.");
      return;
    }

    const note = newActorIOCNote.trim();
    const bulkText = newActorBulkIOCText.trim();

    const pushDetectedItems = (items: Array<{ type: IOCType; value: string }>) => {
      let added = 0;
      let duplicates = 0;
      let invalid = 0;

      // Dedupe by (type,value) after normalization rules inside addThreatActorIOC.
      const seen = new Set<string>();
      const uniqueItems: Array<{ type: IOCType; value: string }> = [];

      for (const it of items) {
        const normalized =
          it.type === "base64" ? it.value.trim() : it.value.trim().toLowerCase();
        const key = `${it.type}:${normalized}`;
        if (seen.has(key)) continue;
        seen.add(key);
        uniqueItems.push({ type: it.type, value: it.value.trim() });
      }

      for (const item of uniqueItems) {
        const result = addThreatActorIOC(selectedThreatActorId, {
          type: item.type,
          value: item.value,
          note,
        });

        if (result.ok) added++;
        else {
          const msg = result.error.toLowerCase();
          if (msg.includes("already exists") || msg.includes("duplicate"))
            duplicates++;
          else invalid++;
        }
      }

      refreshThreatRepo();
      setThreatRepoError(null);

      if (added === 0 && (duplicates > 0 || invalid > 0)) {
        setThreatRepoError(
          invalid > 0
            ? "Bulk import completed, but no valid IOCs were added."
            : "Bulk import completed, but all IOCs were duplicates.",
        );
      }
    };

    // Bulk autodetect mode
    if (bulkText) {
      const tokens = bulkText
        .split(/[,\s]+/g)
        .map((t) => t.trim())
        .filter(Boolean);

      if (tokens.length === 0) {
        setThreatRepoError("Paste at least one IOC value.");
        return;
      }

      const detected: Array<{ type: IOCType; value: string }> = [];
      for (const token of tokens) {
        const d = detectIOCTypeAndValue(token);
        if (!d) continue;
        detected.push(d);
      }

      if (detected.length === 0) {
        setThreatRepoError(
          "No IOC values detected. Ensure values are separated by commas/spaces/new lines.",
        );
        return;
      }

      pushDetectedItems(detected);
      setNewActorBulkIOCText("");
      setNewActorIOCNote("");
      return;
    }

    // Fixed-type single IOC fallback (backwards compatible)
    if (!newActorIOCValue.trim()) {
      setThreatRepoError("IOC value is required.");
      return;
    }

    const result = addThreatActorIOC(selectedThreatActorId, {
      type: newActorIOCType,
      value: newActorIOCValue,
      note,
    });

    if (!result.ok) {
      setThreatRepoError(result.error);
      return;
    }

    setThreatRepoError(null);
    setNewActorIOCValue("");
    setNewActorIOCNote("");
    refreshThreatRepo();
  }, [
    newActorBulkIOCText,
    newActorIOCNote,
    newActorIOCType,
    newActorIOCValue,
    refreshThreatRepo,
    selectedThreatActorId,
  ]);

  const selectedThreatActor = useMemo(
    () =>
      threatActors.find((actor) => actor.id === selectedThreatActorId) || null,
    [threatActors, selectedThreatActorId],
  );

  const handleImportThreatIntelFeed = useCallback(
    async (file: File) => {
      setThreatRepoError(null);
      const text = await file.text();
      const importItems: Array<{
        type: IOCType;
        value: string;
        note?: string;
      }> = [];

      try {
        if (file.name.toLowerCase().endsWith(".json")) {
          const parsed = JSON.parse(text) as unknown;
          const list = Array.isArray(parsed)
            ? parsed
            : parsed &&
                typeof parsed === "object" &&
                Array.isArray((parsed as any).iocs)
              ? (parsed as any).iocs
              : [];
          for (const item of list) {
            if (!item || typeof item !== "object") continue;
            const type = String(
              (item as any).type || "",
            ).toLowerCase() as IOCType;
            const value = String((item as any).value || "").trim();
            const note = String((item as any).note || "").trim();
            if (
              [
                "ip",
                "domain",
                "hash",
                "filepath",
                "url",
                "email",
                "registry",
                "base64",
              ].includes(type) &&
              value
            ) {
              importItems.push({ type, value, note });
            }
          }
        } else {
          const rows = text.split(/\r?\n/).filter(Boolean);
          for (let i = 0; i < rows.length; i++) {
            const row = rows[i].split(/,|\t/).map((part) => part.trim());
            if (i === 0 && row.some((col) => /type|value/i.test(col))) continue;
            const [typeRaw, valueRaw, noteRaw] = row;
            const type = String(typeRaw || "").toLowerCase() as IOCType;
            const value = String(valueRaw || "").trim();
            if (
              [
                "ip",
                "domain",
                "hash",
                "filepath",
                "url",
                "email",
                "registry",
                "base64",
              ].includes(type) &&
              value
            ) {
              importItems.push({ type, value, note: noteRaw || "" });
            }
          }
        }
      } catch {
        setThreatRepoError(
          "Could not parse feed. Use JSON array or CSV/TSV with type,value,note.",
        );
        return;
      }

      if (importItems.length === 0) {
        setThreatRepoError("No valid IOCs found in feed.");
        return;
      }

      const actorResult = createThreatActor({
        name: `${feedName} (${file.name})`,
      });
      if (!actorResult.ok) {
        setThreatRepoError(actorResult.error);
        return;
      }

      let added = 0;
      for (const item of importItems) {
        const result = addThreatActorIOC(actorResult.actor.id, item);
        if (result.ok) added += 1;
      }

      refreshThreatRepo();
      setSelectedThreatActorId(actorResult.actor.id);
      if (added === 0) {
        setThreatRepoError(
          "Feed imported but all IOCs were duplicates/invalid.",
        );
      }
    },
    [feedName, refreshThreatRepo],
  );

  return (
    <div className="ioc-extractor">
      <header className="ioc-header">
        <div>
          <h1>🎯 IOC Extractor</h1>
          <p className="ioc-subtitle">
            Extract Indicators of Compromise from{" "}
            {entries.length.toLocaleString()} log entries
          </p>
        </div>
        <button className="back-button" onClick={onBack}>
          ← Back to Selection
        </button>
      </header>

      {/* Stats Overview */}
      <div className="ioc-stats">
        <div className="stat-card total">
          <span className="stat-number">{stats.total}</span>
          <span className="stat-label">Total IOCs Found</span>
        </div>
        {(Object.entries(stats.byType) as [IOCType, number][]).map(
          ([type, count]) => (
            <div
              key={type}
              className={`stat-card ${type} ${selectedTypes.has(type) ? "active" : "inactive"}`}
              onClick={() => toggleType(type)}
            >
              <span className="stat-icon">{IOC_INFO[type].icon}</span>
              <span className="stat-number">{count}</span>
              <span className="stat-label">{IOC_INFO[type].label}</span>
            </div>
          ),
        )}
      </div>

      {/* Controls */}
      <div className="ioc-controls">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search IOCs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
        </div>

        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={showBenignPaths}
            onChange={(e) => setShowBenignPaths(e.target.checked)}
          />
          Show benign system paths
          {!showBenignPaths && hiddenCounts.benignPaths > 0 && (
            <span style={{ color: "#888", fontSize: "0.8rem", marginLeft: 4 }}>
              ({hiddenCounts.benignPaths} hidden)
            </span>
          )}
        </label>

        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={showPrivateIPs}
            onChange={(e) => setShowPrivateIPs(e.target.checked)}
          />
          Show private/reserved IPs
          {!showPrivateIPs && hiddenCounts.privateIPs > 0 && (
            <span style={{ color: "#888", fontSize: "0.8rem", marginLeft: 4 }}>
              ({hiddenCounts.privateIPs} hidden)
            </span>
          )}
        </label>

        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={showNoiseDomains}
            onChange={(e) => setShowNoiseDomains(e.target.checked)}
          />
          Show noise domains
          {!showNoiseDomains && hiddenCounts.noiseDomains > 0 && (
            <span style={{ color: "#888", fontSize: "0.8rem", marginLeft: 4 }}>
              ({hiddenCounts.noiseDomains} hidden)
            </span>
          )}
        </label>

        <div className="export-buttons">
          <button className="export-btn" onClick={exportIOCs}>
            📥 Export JSON
          </button>
          <button className="export-btn" onClick={exportCSV}>
            📊 Export CSV
          </button>
          <button
            className="export-btn"
            onClick={exportSTIXBundle}
            title="Export as STIX 2.1 bundle (compatible with MISP, TheHive, OpenCTI)"
          >
            🔗 Export STIX
          </button>
        </div>

        <div className="vt-controls">
          <button
            className={`vt-btn ${isLookingUp ? "loading" : ""} ${!hasVtKey ? "disabled" : ""}`}
            onClick={lookupAllIOCs}
            disabled={isLookingUp || !hasVtKey}
            title={
              hasVtKey
                ? "Lookup IPs, domains, hashes, and URLs on VirusTotal"
                : "VirusTotal API key required - Click to configure"
            }
          >
            {hasVtKey
              ? isLookingUp
                ? `Looking up (${vtLookupQueue.length})...`
                : "VT Lookup All"
              : "🔒 API Key Required"}
          </button>
          <button
            className="vt-config-btn"
            onClick={() => setShowVtConfig(!showVtConfig)}
            title={
              hasVtKey
                ? "API key configured - Click to update"
                : "Configure VirusTotal API key"
            }
          >
            {hasVtKey ? "✓ ⚙" : "⚙"}
          </button>
        </div>
      </div>

      <div className="threat-actor-repo">
        <div className="threat-actor-repo-header">
          <h3>Threat Actor IOC Repository</h3>
          <span>
            Persisted locally for reuse across Windows and Linux investigations
          </span>
        </div>

        <div className="threat-actor-repo-grid">
          <div className="threat-actor-card">
            <h4>Import Threat Intel Feed</h4>
            <input
              className="threat-input"
              placeholder="Feed label (e.g., MISP Daily)"
              value={feedName}
              onChange={(e) => setFeedName(e.target.value)}
            />
            <input
              className="threat-input"
              type="file"
              accept=".json,.csv,.tsv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  handleImportThreatIntelFeed(file);
                }
                e.currentTarget.value = "";
              }}
            />
            <p style={{ fontSize: "0.75rem", color: "#9ca3af", margin: 0 }}>
              Accepts JSON array or CSV/TSV with columns: type,value,note
            </p>
          </div>

          <div className="threat-actor-card">
            <h4>Create Threat Actor</h4>
            <input
              className="threat-input"
              placeholder="Actor name (e.g., APT29)"
              value={newThreatActorName}
              onChange={(e) => setNewThreatActorName(e.target.value)}
            />
            <input
              className="threat-input"
              placeholder="Aliases (comma-separated)"
              value={newThreatActorAliases}
              onChange={(e) => setNewThreatActorAliases(e.target.value)}
            />
            <input
              className="threat-input"
              placeholder="Description"
              value={newThreatActorDescription}
              onChange={(e) => setNewThreatActorDescription(e.target.value)}
            />
            <button className="threat-btn" onClick={handleCreateThreatActor}>
              Create Actor
            </button>
          </div>

          <div className="threat-actor-card">
            <h4>Add IOC To Actor</h4>
            <select
              className="threat-input"
              value={selectedThreatActorId}
              onChange={(e) => setSelectedThreatActorId(e.target.value)}
            >
              <option value="">Select threat actor</option>
              {threatActors.map((actor) => (
                <option key={actor.id} value={actor.id}>
                  {actor.name}
                </option>
              ))}
            </select>
            <div className="threat-inline">
              <select
                className="threat-input"
                value={newActorIOCType}
                onChange={(e) => setNewActorIOCType(e.target.value as IOCType)}
              >
                {(
                  [
                    "ip",
                    "domain",
                    "hash",
                    "filepath",
                    "url",
                    "email",
                    "registry",
                    "base64",
                  ] as IOCType[]
                ).map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <input
                className="threat-input"
                placeholder="IOC value"
                value={newActorIOCValue}
                onChange={(e) => setNewActorIOCValue(e.target.value)}
              />
            </div>
            <textarea
              value={newActorBulkIOCText}
              onChange={(e) => setNewActorBulkIOCText(e.target.value)}
              placeholder="Bulk paste IOCs here (auto-detect type). Separate by commas, spaces, or new lines. Example: 1.2.3.4, bad.com, https://evil.com/a"
              rows={3}
              style={{
                marginTop: 8,
                width: "100%",
                background: "var(--bg-hover)",
                border: "1px solid var(--border-primary)",
                color: "var(--text-primary)",
                borderRadius: 8,
                padding: "0.5rem",
                boxSizing: "border-box",
                resize: "vertical",
              }}
            />
            <p style={{ fontSize: "0.75rem", color: "#9ca3af", margin: "6px 0 0" }}>
              If bulk text is filled, values above (fixed type) are ignored.
              The note applies to every added IOC.
            </p>
            <input
              className="threat-input"
              placeholder="IOC note (optional)"
              value={newActorIOCNote}
              onChange={(e) => setNewActorIOCNote(e.target.value)}
            />
            <button className="threat-btn" onClick={handleAddThreatActorIOC}>
              Add IOC
            </button>
            {threatRepoError && (
              <div className="threat-error">{threatRepoError}</div>
            )}
          </div>
        </div>

        {threatActors.length > 0 && (
          <div className="threat-actor-list">
            {threatActors.map((actor) => {
              const summary = actorMatchSummaries.find(
                (item) => item.actorId === actor.id,
              );
              const isSelected = selectedThreatActorId === actor.id;
              return (
                <div
                  key={actor.id}
                  className={`threat-actor-item ${isSelected ? "selected" : ""}`}
                >
                  <div className="threat-actor-main">
                    <button
                      className="threat-link"
                      onClick={() =>
                        setSelectedThreatActorId(isSelected ? "" : actor.id)
                      }
                    >
                      {actor.name}
                    </button>
                    <span>
                      {summary?.matched || 0}/
                      {summary?.totalIocs || actor.iocs.length} IOCs matched in
                      current environment
                    </span>
                    <span>{summary?.totalHits || 0} total IOC hits</span>
                  </div>
                  <button
                    className="threat-delete"
                    onClick={() => {
                      deleteThreatActor(actor.id);
                      if (selectedThreatActorId === actor.id) {
                        setSelectedThreatActorId("");
                      }
                      refreshThreatRepo();
                    }}
                  >
                    Delete Actor
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {selectedThreatActor && selectedThreatActor.iocs.length > 0 && (
          <div className="threat-actor-iocs">
            <h4>{selectedThreatActor.name} IOC Set</h4>
            {selectedThreatActor.iocs.map((ioc) => {
              const key = `${ioc.type}:${ioc.value.toLowerCase()}`;
              const match = extractedIOCs.find(
                (candidate) =>
                  `${candidate.type}:${candidate.value.toLowerCase()}` === key,
              );
              return (
                <div key={ioc.id} className="threat-ioc-row">
                  <span className="threat-ioc-type">{ioc.type}</span>
                  <span className="threat-ioc-value">{ioc.value}</span>
                  <span className={match ? "threat-hit" : "threat-miss"}>
                    {match ? `${match.count} hits` : "no hits"}
                  </span>
                  {ioc.note && (
                    <span className="threat-ioc-note">{ioc.note}</span>
                  )}
                  <button
                    className="threat-delete"
                    onClick={() => {
                      deleteThreatActorIOC(selectedThreatActor.id, ioc.id);
                      refreshThreatRepo();
                    }}
                  >
                    Remove
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* VirusTotal API Key Configuration */}
      {showVtConfig && (
        <div className="vt-config-panel">
          <h4>VirusTotal API Configuration</h4>
          <p className="vt-config-info">
            A VirusTotal API key is <strong>required</strong> to perform IOC
            lookups. Get your free API key at{" "}
            <a
              href="https://www.virustotal.com/gui/my-apikey"
              target="_blank"
              rel="noopener noreferrer"
            >
              virustotal.com/gui/my-apikey
            </a>
          </p>
          <div className="vt-config-form">
            <input
              type="password"
              placeholder="Enter VirusTotal API key..."
              value={vtApiKey}
              onChange={(e) => setVtApiKey(e.target.value)}
              className="vt-api-input"
            />
            <button
              className="vt-save-btn"
              onClick={handleSaveApiKey}
              disabled={!vtApiKey.trim()}
            >
              Save
            </button>
            {getAPIKey() && (
              <button className="vt-clear-btn" onClick={handleClearApiKey}>
                Clear
              </button>
            )}
          </div>
          <p className="vt-privacy-note">
            🔒 Your API key is stored locally in your browser and never sent
            anywhere except VirusTotal.
          </p>
          {/* AbuseIPDB configuration — inline */}
          <div
            style={{
              marginTop: "0.75rem",
              borderTop: "1px solid var(--border-primary)",
              paddingTop: "0.75rem",
            }}
          >
            <h4
              style={{
                margin: "0 0 0.25rem",
                fontSize: "0.9rem",
                color: "#60a5fa",
              }}
            >
              AbuseIPDB (IP Reputation)
            </h4>
            <p
              style={{
                fontSize: "0.8rem",
                color: "#888",
                margin: "0 0 0.5rem",
              }}
            >
              Free API key from{" "}
              <a
                href="https://www.abuseipdb.com/account/api"
                target="_blank"
                rel="noopener noreferrer"
              >
                abuseipdb.com
              </a>
            </p>
            <div className="vt-config-form">
              <input
                type="password"
                placeholder="Enter AbuseIPDB API key..."
                value={abuseIPDBKey}
                onChange={(e) => {
                  setAbuseIPDBKey(e.target.value);
                  setAbuseKeySaved(false);
                }}
                className="vt-api-input"
              />
              <button
                className="vt-save-btn"
                onClick={() => {
                  if (abuseIPDBKey.trim()) {
                    saveAbuseIPDBKey(abuseIPDBKey.trim());
                    setAbuseKeySaved(true);
                  }
                }}
                disabled={!abuseIPDBKey.trim()}
              >
                {abuseKeySaved ? "✓ Saved" : "Save"}
              </button>
              {abuseKeySaved && (
                <button
                  className="vt-clear-btn"
                  onClick={() => {
                    clearAbuseIPDBKey();
                    setAbuseIPDBKey("");
                    setAbuseKeySaved(false);
                  }}
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* IOC Lists */}
      <div className="ioc-lists">
        {(Object.entries(groupedIOCs) as [IOCType, ExtractedIOC[]][]).map(
          ([type, iocs]) => {
            if (!selectedTypes.has(type) || iocs.length === 0) return null;

            return (
              <div key={type} className={`ioc-section ${type}`}>
                <div className="section-header">
                  <h3>
                    {IOC_INFO[type].icon} {IOC_INFO[type].label}
                    <span className="section-count">({iocs.length})</span>
                  </h3>
                  <div className="section-header-actions">
                    {/* Per-category VT scan button */}
                    {["ip", "domain", "hash", "url"].includes(type) && (
                      <button
                        className={`vt-category-btn ${
                          categoryLookingUp === type ? "loading" : ""
                        } ${!hasVtKey ? "disabled" : ""}`}
                        onClick={() => lookupCategoryIOCs(type)}
                        disabled={isLookingUp || !hasVtKey}
                        title={
                          hasVtKey
                            ? `Scan all ${IOC_INFO[type].label.toLowerCase()} on VirusTotal`
                            : "VirusTotal API key required"
                        }
                      >
                        {categoryLookingUp === type
                          ? `Scanning (${vtLookupQueue.length})...`
                          : `🔍 VT Scan All ${IOC_INFO[type].label}`}
                      </button>
                    )}
                    <button
                      className={`copy-all-btn ${copiedIOC === `all-${type}` ? "copied" : ""}`}
                      onClick={() => copyAllOfType(type)}
                    >
                      {copiedIOC === `all-${type}`
                        ? "✓ Copied!"
                        : "📋 Copy All"}
                    </button>
                  </div>
                </div>
                <p className="section-description">
                  {IOC_INFO[type].description}
                </p>
                <div className="ioc-list">
                  {iocs
                    .slice(0, iocVisiblePerType[type] || IOC_PAGE_SIZE)
                    .map((ioc, idx) => {
                      const vtKey = `${ioc.type}:${ioc.value}`;
                      const vtResult = vtResults.get(vtKey);
                      const isVtSupported = [
                        "ip",
                        "domain",
                        "hash",
                        "url",
                      ].includes(ioc.type);

                      return (
                        <div key={idx} className="ioc-item">
                          <span
                            className="ioc-value"
                            title={ioc.value}
                            style={{ wordBreak: "break-all" as const }}
                          >
                            {ioc.value}
                          </span>
                          <span
                            className="ioc-count"
                            title={`Found ${ioc.count} times`}
                          >
                            ×{ioc.count}
                          </span>
                          {knownIOCSet.has(
                            `${ioc.type}:${ioc.value.toLowerCase()}`,
                          ) && (
                            <span
                              className="vt-result detected"
                              title="Matched imported threat intelligence"
                            >
                              🎯 Intel Match
                            </span>
                          )}

                          {/* VirusTotal result indicator */}
                          {isVtSupported && vtResult && (
                            <span
                              className={`vt-result ${vtResult.loading ? "loading" : vtResult.error ? "error" : vtResult.positives > 0 ? "detected" : "clean"}`}
                              title={
                                vtResult.loading
                                  ? "Looking up..."
                                  : vtResult.error ||
                                    `${vtResult.positives}/${vtResult.total} detections`
                              }
                            >
                              {vtResult.loading
                                ? "⏳"
                                : vtResult.error
                                  ? "⚠️"
                                  : vtResult.positives > 0
                                    ? `🚨 ${vtResult.positives}/${vtResult.total}`
                                    : "✅"}
                            </span>
                          )}

                          {/* VT lookup button for supported types */}
                          {isVtSupported && !vtResult && (
                            <button
                              className={`vt-lookup-btn ${!hasVtKey ? "disabled" : ""}`}
                              onClick={() =>
                                lookupSingleIOC(ioc.type, ioc.value)
                              }
                              disabled={!hasVtKey}
                              title={
                                hasVtKey
                                  ? "Lookup on VirusTotal"
                                  : "VirusTotal API key required"
                              }
                            >
                              {hasVtKey ? "VT" : "🔒"}
                            </button>
                          )}

                          {/* VT permalink */}
                          {vtResult?.permalink && (
                            <a
                              href={vtResult.permalink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="vt-link"
                              title="View on VirusTotal"
                            >
                              ↗
                            </a>
                          )}

                          {/* AbuseIPDB enrichment (IPs only) */}
                          {ioc.type === "ip" &&
                            (() => {
                              const er = enrichResults.get(
                                `abuseipdb:${ioc.value}`,
                              );
                              if (er) {
                                return (
                                  <>
                                    <span
                                      className={`vt-result ${er.loading ? "loading" : er.error ? "error" : er.malicious ? "detected" : "clean"}`}
                                      title={
                                        er.loading
                                          ? "Looking up..."
                                          : er.error || er.detail
                                      }
                                    >
                                      {er.loading
                                        ? "⏳"
                                        : er.error
                                          ? "⚠️"
                                          : er.malicious
                                            ? `🛑 ${er.score}%`
                                            : `✅ ${er.score}%`}
                                      <span
                                        style={{
                                          fontSize: "0.55rem",
                                          marginLeft: 2,
                                        }}
                                      >
                                        AIPDB
                                      </span>
                                    </span>
                                    {!er.loading && !er.error && (
                                      <a
                                        href={`https://www.abuseipdb.com/check/${encodeURIComponent(ioc.value)}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="vt-lookup-btn"
                                        title="View full report on AbuseIPDB"
                                        style={{
                                          textDecoration: "none",
                                          fontSize: "0.7rem",
                                        }}
                                      >
                                        View ↗
                                      </a>
                                    )}
                                  </>
                                );
                              }
                              return hasAbuseKey ? (
                                <button
                                  className="vt-lookup-btn"
                                  onClick={() =>
                                    lookupAbuseIPDBSingle(ioc.value)
                                  }
                                  title="Lookup on AbuseIPDB"
                                >
                                  AIPDB
                                </button>
                              ) : null;
                            })()}

                          {/* Pivot button */}
                          <button
                            className="pivot-btn"
                            onClick={() => setPivotIOC(ioc)}
                            title={`Search all events for ${ioc.value}`}
                          >
                            Pivot
                          </button>

                          <button
                            className={`copy-btn ${copiedIOC === ioc.value ? "copied" : ""}`}
                            onClick={() => copyIOC(ioc.value)}
                            title="Copy to clipboard"
                          >
                            {copiedIOC === ioc.value ? "✓" : "📋"}
                          </button>
                        </div>
                      );
                    })}
                  {iocs.length > (iocVisiblePerType[type] || IOC_PAGE_SIZE) && (
                    <div className="more-iocs">
                      <span>
                        Showing {iocVisiblePerType[type] || IOC_PAGE_SIZE} of{" "}
                        {iocs.length} {IOC_INFO[type].label.toLowerCase()}
                      </span>
                      <button
                        className="load-more-btn"
                        onClick={() =>
                          setIocVisiblePerType((prev) => ({
                            ...prev,
                            [type]:
                              (prev[type] || IOC_PAGE_SIZE) + IOC_PAGE_SIZE,
                          }))
                        }
                      >
                        Load More
                      </button>
                      <button
                        className="load-more-btn"
                        onClick={() =>
                          setIocVisiblePerType((prev) => ({
                            ...prev,
                            [type]: iocs.length,
                          }))
                        }
                      >
                        Show All
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          },
        )}

        {filteredIOCs.length === 0 && (
          <div className="no-iocs">
            <span className="no-iocs-icon">🔍</span>
            <h3>No IOCs Found</h3>
            <p>
              {searchQuery
                ? "No IOCs match your search query. Try a different search term."
                : "No indicators of compromise were found in the log entries."}
            </p>
          </div>
        )}
      </div>

      <div className="privacy-note">
        🔒 All extraction is performed locally in your browser. No data is sent
        anywhere.
      </div>

      {/* IOC Pivot Modal */}
      {pivotIOC && (
        <IOCPivotView
          ioc={pivotIOC.value}
          type={pivotIOC.type}
          entries={entries}
          sigmaMatches={sigmaMatches || new Map()}
          onClose={() => setPivotIOC(null)}
        />
      )}
    </div>
  );
}
