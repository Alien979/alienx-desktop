import { useMemo, useState } from "react";
import { LogEntry } from "../types";
import { SigmaRuleMatch } from "../lib/sigma/types";
import { getFileColor } from "../lib/fileColors";

interface MultiFileComparisonProps {
  entries: LogEntry[];
  sourceFiles?: string[];
  matches: Map<string, SigmaRuleMatch[]>;
}

interface FileStats {
  file: string;
  totalEvents: number;
  detectionCount: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  informational: number;
  uniqueTechniques: Set<string>;
  uniqueRules: Set<string>;
}

export function MultiFileComparison({
  entries,
  sourceFiles,
  matches,
}: MultiFileComparisonProps) {
  const [sortBy, setSortBy] = useState<"detections" | "events" | "critical">(
    "detections",
  );

  const fileStats = useMemo(() => {
    if (!sourceFiles || sourceFiles.length <= 1) return null;

    // Initialize per-file stats
    const statsMap = new Map<string, FileStats>();
    for (const f of sourceFiles) {
      statsMap.set(f, {
        file: f,
        totalEvents: 0,
        detectionCount: 0,
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        informational: 0,
        uniqueTechniques: new Set(),
        uniqueRules: new Set(),
      });
    }

    // Count events per file
    for (const entry of entries) {
      const f = entry.sourceFile || "Unknown";
      const s = statsMap.get(f);
      if (s) s.totalEvents++;
    }

    // Count detections per file
    for (const [ruleId, ruleMatches] of matches) {
      if (ruleMatches.length === 0) continue;
      const rule = ruleMatches[0].rule;
      let severity: string = rule.level || "medium";
      if (severity === "info") severity = "informational";
      const tags = rule.tags || [];

      for (const m of ruleMatches) {
        const f = m.event.sourceFile || "Unknown";
        const s = statsMap.get(f);
        if (!s) continue;
        s.detectionCount++;
        s.uniqueRules.add(ruleId);
        if (severity === "critical") s.critical++;
        else if (severity === "high") s.high++;
        else if (severity === "medium") s.medium++;
        else if (severity === "low") s.low++;
        else s.informational++;

        for (const tag of tags) {
          const lower = tag.toLowerCase().replace("attack.", "");
          if (/^t\d{4}/.test(lower)) {
            s.uniqueTechniques.add(lower.toUpperCase());
          }
        }
      }
    }

    let arr = Array.from(statsMap.values());
    if (sortBy === "detections")
      arr.sort((a, b) => b.detectionCount - a.detectionCount);
    else if (sortBy === "events")
      arr.sort((a, b) => b.totalEvents - a.totalEvents);
    else arr.sort((a, b) => b.critical + b.high - (a.critical + a.high));

    return arr;
  }, [entries, sourceFiles, matches, sortBy]);

  if (!fileStats || fileStats.length <= 1) return null;

  const maxDetections = Math.max(1, ...fileStats.map((f) => f.detectionCount));

  return (
    <div
      style={{
        marginTop: "1rem",
        padding: "1rem",
        backgroundColor: "rgba(0,0,0,0.2)",
        borderRadius: "8px",
        border: "1px solid rgba(0,240,255,0.1)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "0.75rem",
        }}
      >
        <h4
          style={{
            color: "#00f0ff",
            fontSize: "0.95rem",
            fontWeight: 600,
            margin: 0,
          }}
        >
          Multi-File Comparison — {fileStats.length} files
        </h4>
        <div style={{ display: "flex", gap: "4px", fontSize: "0.72rem" }}>
          {(["detections", "events", "critical"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSortBy(s)}
              style={{
                background:
                  sortBy === s
                    ? "rgba(0,240,255,0.15)"
                    : "rgba(255,255,255,0.04)",
                border: `1px solid ${sortBy === s ? "rgba(0,240,255,0.4)" : "#333"}`,
                color: sortBy === s ? "#00f0ff" : "#888",
                borderRadius: 4,
                padding: "2px 8px",
                cursor: "pointer",
              }}
            >
              Sort: {s}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {fileStats.map((fs) => (
          <div
            key={fs.file}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: "12px",
              alignItems: "center",
              padding: "8px 12px",
              backgroundColor: "rgba(255,255,255,0.02)",
              borderRadius: "6px",
              borderLeft: `3px solid ${getFileColor(fs.file)}`,
            }}
          >
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "4px",
                }}
              >
                <span
                  style={{
                    color: "#e0e0e0",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                  }}
                  title={fs.file}
                >
                  {fs.file.length > 50 ? "…" + fs.file.slice(-48) : fs.file}
                </span>
                <span style={{ color: "#666", fontSize: "0.72rem" }}>
                  {fs.totalEvents.toLocaleString()} events
                </span>
              </div>

              {/* Detection bar */}
              <div
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                <div
                  style={{
                    flex: 1,
                    height: "8px",
                    borderRadius: "4px",
                    background: "rgba(255,255,255,0.05)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      height: "100%",
                      width: `${(fs.detectionCount / maxDetections) * 100}%`,
                    }}
                  >
                    {fs.critical > 0 && (
                      <div
                        style={{ flex: fs.critical, background: "#f87171" }}
                      />
                    )}
                    {fs.high > 0 && (
                      <div style={{ flex: fs.high, background: "#fb923c" }} />
                    )}
                    {fs.medium > 0 && (
                      <div style={{ flex: fs.medium, background: "#fbbf24" }} />
                    )}
                    {fs.low > 0 && (
                      <div style={{ flex: fs.low, background: "#4ade80" }} />
                    )}
                    {fs.informational > 0 && (
                      <div
                        style={{
                          flex: fs.informational,
                          background: "#60a5fa",
                        }}
                      />
                    )}
                  </div>
                </div>
                <span
                  style={{
                    color: "#aaa",
                    fontSize: "0.75rem",
                    minWidth: "55px",
                    textAlign: "right",
                  }}
                >
                  {fs.detectionCount} det.
                </span>
              </div>
            </div>

            {/* Severity mini badges */}
            <div
              style={{
                display: "flex",
                gap: "4px",
                flexWrap: "wrap",
                justifyContent: "flex-end",
              }}
            >
              {fs.critical > 0 && (
                <SevBadge label="C" count={fs.critical} color="#f87171" />
              )}
              {fs.high > 0 && (
                <SevBadge label="H" count={fs.high} color="#fb923c" />
              )}
              {fs.medium > 0 && (
                <SevBadge label="M" count={fs.medium} color="#fbbf24" />
              )}
              {fs.low > 0 && (
                <SevBadge label="L" count={fs.low} color="#4ade80" />
              )}
              {fs.uniqueRules.size > 0 && (
                <span
                  style={{
                    fontSize: "0.68rem",
                    color: "#888",
                    padding: "1px 5px",
                    borderRadius: 3,
                    background: "rgba(255,255,255,0.04)",
                  }}
                  title={`${fs.uniqueRules.size} unique rule(s), ${fs.uniqueTechniques.size} technique(s)`}
                >
                  {fs.uniqueRules.size}R / {fs.uniqueTechniques.size}T
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SevBadge({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: string;
}) {
  return (
    <span
      style={{
        fontSize: "0.68rem",
        fontWeight: 700,
        color,
        background: `${color}18`,
        border: `1px solid ${color}44`,
        borderRadius: 3,
        padding: "1px 5px",
      }}
      title={`${label === "C" ? "Critical" : label === "H" ? "High" : label === "M" ? "Medium" : "Low"}: ${count}`}
    >
      {label}:{count}
    </span>
  );
}

export default MultiFileComparison;
