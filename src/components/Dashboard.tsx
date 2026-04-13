import { useState, useMemo, useEffect } from "react";
import { ParsedData } from "../types";
import SigmaDetections from "./SigmaDetections";
import YaraDetections from "./YaraDetections";
import { SigmaEngine } from "../lib/sigma";
import { SigmaRuleMatch } from "../lib/sigma/types";
import type { YaraRuleMatch, YaraScanStats } from "../lib/yara";
import { extractUnique } from "../lib/utils/setUtils";
import "./Dashboard.css";

interface DashboardProps {
  data: ParsedData;
  filename: string;
  onBack: () => void;
  onOpenRawLogs?: () => void;
  sigmaEngine?: SigmaEngine;
  cachedMatches?: Map<string, SigmaRuleMatch[]>;
  onMatchesUpdate?: (matches: Map<string, SigmaRuleMatch[]>) => void;
  cachedYaraMatches?: YaraRuleMatch[];
  cachedYaraStats?: YaraScanStats;
  onYaraMatchesUpdate?: (
    matches: YaraRuleMatch[],
    stats: YaraScanStats | null,
  ) => void;
  playbookFilterId?: string | null;
  onOpenYaraRuleLab?: () => void;
}

export default function Dashboard({
  data,
  filename,
  onBack,
  onOpenRawLogs,
  sigmaEngine,
  cachedMatches,
  onMatchesUpdate,
  cachedYaraMatches,
  cachedYaraStats,
  onYaraMatchesUpdate,
  playbookFilterId: _playbookFilterId,
  onOpenYaraRuleLab,
}: DashboardProps) {
  // Track if analysis is complete - disable back button until done
  const [isAnalysisComplete, setIsAnalysisComplete] = useState(
    cachedMatches !== undefined,
  );

  // Keep isAnalysisComplete in sync if parent provides cached results after mount
  useEffect(() => {
    if (cachedMatches !== undefined) setIsAnalysisComplete(true);
  }, [cachedMatches]);

  // Handle analysis completion
  const handleAnalysisComplete = (matches: Map<string, SigmaRuleMatch[]>) => {
    setIsAnalysisComplete(true);
    if (onMatchesUpdate) {
      onMatchesUpdate(matches);
    }
  };

  // Build investigation summary from available data
  const summary = useMemo(() => {
    const entries = data.entries;
    if (entries.length === 0) return null;

    const timestamps = entries
      .map((e) => new Date(e.timestamp).getTime())
      .filter((t) => !isNaN(t))
      .sort((a, b) => a - b);
    const earliest = timestamps.length > 0 ? new Date(timestamps[0]) : null;
    const latest =
      timestamps.length > 0
        ? new Date(timestamps[timestamps.length - 1])
        : null;

    const computers = extractUnique(
      entries,
      (e) => e.computer || e.host || e.eventData?.Computer || null,
    );
    const eventIds = extractUnique(entries, (e) => e.eventId);
    const fileCount = data.sourceFiles?.length ?? 1;

    // Detection breakdown from cached matches
    const matches = cachedMatches ?? new Map<string, SigmaRuleMatch[]>();
    const sevCounts: Record<string, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };
    let totalDetections = 0;
    for (const ruleMatches of matches.values()) {
      if (ruleMatches.length > 0) {
        const level = ruleMatches[0].rule.level || "low";
        sevCounts[level] = (sevCounts[level] || 0) + ruleMatches.length;
        totalDetections += ruleMatches.length;
      }
    }
    const highestSeverity =
      sevCounts.critical > 0
        ? "critical"
        : sevCounts.high > 0
          ? "high"
          : sevCounts.medium > 0
            ? "medium"
            : sevCounts.low > 0
              ? "low"
              : null;

    return {
      earliest,
      latest,
      computers: computers.size,
      eventIds: eventIds.size,
      fileCount,
      totalDetections,
      ruleCount: matches.size,
      sevCounts,
      highestSeverity,
    };
  }, [data, cachedMatches]);

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div>
          <div className="logo-container">
            <h1>ALIENX</h1>
            <span style={{ fontSize: "2rem" }}>🔆</span>
          </div>
          <p className="tagline">
            {data.platform === "windows"
              ? "Your EVTX companion"
              : "Your Linux detection companion"}
          </p>
          <p className="filename">
            {filename} • {data.entries.length.toLocaleString()} events • Format:{" "}
            {data.format.toUpperCase()}
          </p>
        </div>
        <div className="header-buttons">
          <button
            className="timeline-button"
            onClick={() => {
              if (!isAnalysisComplete) {
                if (
                  window.confirm("Analysis is still running. Leave anyway?")
                ) {
                  onBack();
                }
              } else {
                onBack();
              }
            }}
            title={
              !isAnalysisComplete ? "Analysis in progress – click to leave" : ""
            }
          >
            {isAnalysisComplete ? "← Back to Selection" : "⟳ Analyzing..."}
          </button>
        </div>
      </header>

      {/* Investigation Summary Card */}
      {isAnalysisComplete && summary && (
        <div className="investigation-summary">
          <h3 className="summary-title">Investigation Summary</h3>
          <p className="summary-text">
            {summary.fileCount > 1
              ? `Analysed ${summary.fileCount} ${data.platform === "windows" ? "EVTX" : "Linux evidence"} files containing `
              : "Analysed "}
            <strong>{data.entries.length.toLocaleString()}</strong> events
            {summary.earliest && summary.latest && (
              <>
                {" "}
                spanning{" "}
                <strong>
                  {summary.earliest.toLocaleDateString()} –{" "}
                  {summary.latest.toLocaleDateString()}
                </strong>
              </>
            )}
            {summary.computers > 0 && (
              <>
                {" "}
                across{" "}
                <strong>
                  {summary.computers} computer
                  {summary.computers !== 1 ? "s" : ""}
                </strong>
              </>
            )}
            .{" "}
            {summary.totalDetections > 0 ? (
              <>
                SIGMA engine matched{" "}
                <strong>
                  {summary.totalDetections.toLocaleString()} event
                  {summary.totalDetections !== 1 ? "s" : ""}
                </strong>{" "}
                against{" "}
                <strong>
                  {summary.ruleCount} rule
                  {summary.ruleCount !== 1 ? "s" : ""}
                </strong>
                {summary.highestSeverity && (
                  <>
                    {" "}
                    with highest severity{" "}
                    <span
                      className={`severity-tag severity-${summary.highestSeverity}`}
                    >
                      {summary.highestSeverity}
                    </span>
                  </>
                )}
                .
              </>
            ) : (
              "No SIGMA detections were triggered."
            )}
          </p>
          <div className="summary-stats">
            <div className="stat-chip">
              <span className="stat-value">{summary.eventIds}</span>
              <span className="stat-label">Event Types</span>
            </div>
            <div className="stat-chip">
              <span className="stat-value">{summary.computers}</span>
              <span className="stat-label">Computers</span>
            </div>
            <div className="stat-chip">
              <span className="stat-value">{summary.ruleCount}</span>
              <span className="stat-label">Rules Matched</span>
            </div>
            {summary.sevCounts.critical > 0 && (
              <div className="stat-chip stat-critical">
                <span className="stat-value">{summary.sevCounts.critical}</span>
                <span className="stat-label">Critical</span>
              </div>
            )}
            {summary.sevCounts.high > 0 && (
              <div className="stat-chip stat-high">
                <span className="stat-value">{summary.sevCounts.high}</span>
                <span className="stat-label">High</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Detection Sections */}
      {data.entries.length > 0 && (
        <>
          <div className="sigma-section">
            <SigmaDetections
              events={data.entries}
              sigmaEngine={sigmaEngine}
              onMatchesUpdate={handleAnalysisComplete}
              cachedMatches={cachedMatches}
              sourceFiles={data.sourceFiles}
              // playbookFilterId={playbookFilterId}
            />
          </div>
          <div className="sigma-section">
            <YaraDetections
              events={data.entries}
              platform={data.platform}
              onOpenRawLogs={onOpenRawLogs}
              onOpenRuleLab={onOpenYaraRuleLab}
              cachedMatches={cachedYaraMatches}
              cachedStats={cachedYaraStats}
              onMatchesUpdate={onYaraMatchesUpdate}
            />
          </div>
        </>
      )}
    </div>
  );
}
