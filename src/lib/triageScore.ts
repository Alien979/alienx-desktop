import type { ParsedData } from "../types";
import type { SigmaRuleMatch } from "./sigma/types";

export interface TriageResult {
  score: number; // 0-100
  label: "Critical" | "High" | "Medium" | "Low" | "Informational";
  color: string;
  factors: TriageFactor[];
}

export interface TriageFactor {
  name: string;
  points: number;
  detail: string;
}

const LEVEL_WEIGHT: Record<string, number> = {
  critical: 25,
  high: 12,
  medium: 5,
  low: 2,
  informational: 0.5,
};

/** Suspicious parent→child spawns that inflate risk */
const SUSPICIOUS_SPAWN_PATTERNS = [
  /cmd\.exe/i,
  /powershell\.exe/i,
  /wscript\.exe/i,
  /cscript\.exe/i,
  /mshta\.exe/i,
  /certutil\.exe/i,
  /bitsadmin\.exe/i,
  /rundll32\.exe/i,
  /regsvr32\.exe/i,
];

const SUSPICIOUS_PATHS = [
  /\\temp\\/i,
  /\\tmp\\/i,
  /\\appdata\\local\\temp/i,
  /\\downloads\\/i,
  /\\public\\/i,
  /\\users\\public/i,
  /\\programdata\\/i,
];

export function computeTriageScore(
  data: ParsedData,
  sigmaMatches: Map<string, SigmaRuleMatch[]>,
): TriageResult {
  const factors: TriageFactor[] = [];
  let raw = 0;

  // 1. SIGMA severity distribution
  let critCount = 0,
    highCount = 0,
    medCount = 0,
    lowCount = 0;
  const allMatches: SigmaRuleMatch[] = [];
  for (const matches of sigmaMatches.values()) {
    for (const m of matches) {
      allMatches.push(m);
      const lvl = m.rule.level || "low";
      if (lvl === "critical") critCount++;
      else if (lvl === "high") highCount++;
      else if (lvl === "medium") medCount++;
      else lowCount++;
    }
  }

  if (allMatches.length > 0) {
    const sigmaPoints = Math.min(
      40,
      critCount * LEVEL_WEIGHT.critical +
        highCount * LEVEL_WEIGHT.high +
        medCount * LEVEL_WEIGHT.medium +
        lowCount * LEVEL_WEIGHT.low,
    );
    raw += sigmaPoints;
    factors.push({
      name: "SIGMA Detections",
      points: Math.round(sigmaPoints),
      detail: `${critCount} critical, ${highCount} high, ${medCount} medium, ${lowCount} low`,
    });
  }

  // 2. MITRE tactic breadth — more tactics = wider attack
  const tacticSet = new Set<string>();
  for (const m of allMatches) {
    for (const tag of m.rule.tags || []) {
      const t = tag.toLowerCase().replace("attack.", "");
      if (!t.startsWith("t") && t.length > 2) tacticSet.add(t);
    }
  }
  if (tacticSet.size > 0) {
    const breadthPoints = Math.min(15, tacticSet.size * 3);
    raw += breadthPoints;
    factors.push({
      name: "ATT&CK Tactic Breadth",
      points: breadthPoints,
      detail: `${tacticSet.size} distinct tactic(s): ${[...tacticSet].slice(0, 5).join(", ")}`,
    });
  }

  // 3. Suspicious processes
  const suspiciousProcesses = new Set<string>();
  for (const entry of data.entries) {
    const img =
      entry.eventData?.Image ||
      entry.eventData?.ParentImage ||
      entry.eventData?.CommandLine ||
      "";
    for (const pat of SUSPICIOUS_SPAWN_PATTERNS) {
      if (pat.test(img)) {
        suspiciousProcesses.add(img.split("\\").pop() || img);
      }
    }
  }
  if (suspiciousProcesses.size > 0) {
    const pts = Math.min(15, suspiciousProcesses.size * 3);
    raw += pts;
    factors.push({
      name: "Suspicious Processes",
      points: pts,
      detail: [...suspiciousProcesses].slice(0, 5).join(", "),
    });
  }

  // 4. Execution from unusual paths
  let suspPathCount = 0;
  for (const entry of data.entries) {
    const img = entry.eventData?.Image || "";
    if (SUSPICIOUS_PATHS.some((p) => p.test(img))) suspPathCount++;
  }
  if (suspPathCount > 0) {
    const pts = Math.min(10, Math.ceil(suspPathCount / 5));
    raw += pts;
    factors.push({
      name: "Unusual Exec Paths",
      points: pts,
      detail: `${suspPathCount} execution(s) from temp/downloads/public folders`,
    });
  }

  // 5. Network connections (if present)
  const netEntries = data.entries.filter(
    (e) => e.eventId === 3 || e.eventData?.DestinationIp,
  );
  if (netEntries.length > 0) {
    const externalIps = new Set<string>();
    for (const e of netEntries) {
      const ip = e.eventData?.DestinationIp || "";
      if (ip && !ip.startsWith("127.") && !ip.startsWith("10.") && !ip.startsWith("192.168.") && !ip.startsWith("::1")) {
        externalIps.add(ip);
      }
    }
    if (externalIps.size > 0) {
      const pts = Math.min(10, externalIps.size * 2);
      raw += pts;
      factors.push({
        name: "External Network Connections",
        points: pts,
        detail: `${externalIps.size} unique external IP(s)`,
      });
    }
  }

  // 6. Volume amplifier — lots of matched events is worse
  if (allMatches.length > 50) {
    const pts = Math.min(10, Math.floor(allMatches.length / 50) * 2);
    raw += pts;
    factors.push({
      name: "High Detection Volume",
      points: pts,
      detail: `${allMatches.length} total SIGMA matches`,
    });
  }

  const score = Math.min(100, Math.round(raw));
  const label: TriageResult["label"] =
    score >= 80
      ? "Critical"
      : score >= 55
        ? "High"
        : score >= 30
          ? "Medium"
          : score >= 10
            ? "Low"
            : "Informational";
  const color =
    score >= 80
      ? "#ef4444"
      : score >= 55
        ? "#f97316"
        : score >= 30
          ? "#eab308"
          : score >= 10
            ? "#22c55e"
            : "#6b7280";

  return { score, label, color, factors };
}
