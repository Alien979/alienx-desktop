import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { ParsedData, LogEntry } from "../types";
import { SigmaRuleMatch } from "../lib/sigma/types";
import { EventDetailsModal } from "./EventDetailsModal";
import { computeTriageScore } from "../lib/triageScore";
import ExportReport from "./ExportReport";
import {
  getSavedSearchQueries,
  saveSearchQuery,
  deleteSearchQuery,
  SavedSearchQuery,
} from "../lib/searchPresets";
import { THREAT_HUNT_PLAYBOOKS } from "../lib/threatHuntPlaybooks";
import "./AnalysisSelector.css";

export type AnalysisMode =
  | "sigma"
  | "dashboards"
  | "yara-rule-lab"
  | "process-analysis"
  | "timeline"
  | "raw-logs"
  | "rarity-analysis"
  | "ioc-extraction"
  | "event-correlation"
  | "ai-analysis";

interface AnalysisSelectorProps {
  data: ParsedData;
  filename: string;
  onSelect: (mode: AnalysisMode) => void;
  onReset: () => void;
  onOpenSessions?: () => void;
  sigmaMatches?: Map<string, SigmaRuleMatch[]>;
  platform?: string | null;
  onSelectPlaybook?: (playbookId: string, suggestedQuery: string) => void;
}

export default function AnalysisSelector({
  data,
  filename,
  onSelect,
  onReset,
  onOpenSessions,
  sigmaMatches = new Map(),
  platform = null,
  onSelectPlaybook,
}: AnalysisSelectorProps) {
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const [showExportReport, setShowExportReport] = useState(false);
  const [sigmaAnalyzed, setSigmaAnalyzed] = useState(false);
  const [dismissedBanner, setDismissedBanner] = useState(false);

  // Global search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchRegex, setSearchRegex] = useState(false);
  const [searchRegexError, setSearchRegexError] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [savedSearches, setSavedSearches] = useState<SavedSearchQuery[]>(() =>
    getSavedSearchQueries(),
  );
  const [selectedSearchEvent, setSelectedSearchEvent] =
    useState<LogEntry | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const searchResults = useMemo(() => {
    const q = searchQuery.trim();
    if (q.length < 2) return [];

    let regex: RegExp | null = null;
    if (searchRegex) {
      try {
        regex = new RegExp(q, "i");
      } catch {
        return [];
      }
    }

    const queryLower = q.toLowerCase();
    const matchText = (value: string): boolean => {
      if (!value) return false;
      if (regex) return regex.test(value);
      return value.toLowerCase().includes(queryLower);
    };

    const results: LogEntry[] = [];
    for (const entry of data.entries) {
      if (results.length >= 50) break;
      // Search rawLine, message, eventData values, source, computer, eventId
      if (matchText(entry.rawLine || "")) {
        results.push(entry);
        continue;
      }
      if (matchText(entry.message || "")) {
        results.push(entry);
        continue;
      }
      if (matchText(entry.computer || "")) {
        results.push(entry);
        continue;
      }
      if (matchText(entry.source || "")) {
        results.push(entry);
        continue;
      }
      if (matchText(String(entry.eventId || ""))) {
        results.push(entry);
        continue;
      }
      if (entry.eventData) {
        const vals = Object.values(entry.eventData);
        if (vals.some((v) => matchText(v || ""))) {
          results.push(entry);
          continue;
        }
      }
    }
    return results;
  }, [searchQuery, searchRegex, data.entries]);

  useEffect(() => {
    if (!searchRegex) {
      setSearchRegexError(null);
      return;
    }
    if (searchQuery.trim().length < 2) {
      setSearchRegexError(null);
      return;
    }
    try {
      new RegExp(searchQuery.trim(), "i");
      setSearchRegexError(null);
    } catch {
      setSearchRegexError("Invalid regex pattern");
    }
  }, [searchRegex, searchQuery]);

  const highlightMatch = useCallback(
    (text: string) => {
      if (!searchQuery.trim()) return text;

      if (searchRegex && !searchRegexError) {
        try {
          const regex = new RegExp(searchQuery.trim(), "ig");
          const parts: React.ReactNode[] = [];
          let start = 0;
          let match: RegExpExecArray | null;
          while ((match = regex.exec(text)) !== null) {
            if (match.index > start) {
              parts.push(text.slice(start, match.index));
            }
            parts.push(
              <mark key={`${match.index}-${match[0]}`}>{match[0]}</mark>,
            );
            start = match.index + match[0].length;
            if (match[0].length === 0) break;
          }
          if (start < text.length) {
            parts.push(text.slice(start));
          }
          return parts.length > 0 ? parts : text;
        } catch {
          return text;
        }
      }

      const query = searchQuery.trim().toLowerCase();
      const lower = text.toLowerCase();
      const index = lower.indexOf(query);
      if (index < 0) return text;
      return (
        <>
          {text.slice(0, index)}
          <mark>{text.slice(index, index + query.length)}</mark>
          {text.slice(index + query.length)}
        </>
      );
    },
    [searchQuery, searchRegex, searchRegexError],
  );

  const handleSaveCurrentSearch = useCallback(() => {
    const name = window.prompt("Save search as:", searchQuery.trim());
    if (!name) return;
    const result = saveSearchQuery({
      name,
      query: searchQuery.trim(),
      regex: searchRegex,
    });
    if (!result.ok) {
      alert(result.error);
      return;
    }
    setSavedSearches(getSavedSearchQueries());
  }, [searchQuery, searchRegex]);

  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setSearchQuery("");
      setSearchOpen(false);
    }
  }, []);

  const triage = useMemo(
    () =>
      sigmaMatches.size > 0 ? computeTriageScore(data, sigmaMatches) : null,
    [data, sigmaMatches],
  );

  const isWindows = data.platform === "windows";
  const isEvtx = data.format === "evtx";

  // Check if SIGMA has been analyzed (has any results)
  const hasSigmaResults = sigmaMatches.size > 0;

  // Update sigmaAnalyzed when we have results
  useEffect(() => {
    if (hasSigmaResults) {
      setSigmaAnalyzed(true);
    }
  }, [hasSigmaResults]);

  // Show the "Start with SIGMA" banner if:
  // - SIGMA hasn't been analyzed yet in this session
  // - User hasn't dismissed the banner
  const showSigmaBanner = !sigmaAnalyzed && !dismissedBanner;

  // Handle SIGMA card click
  const handleSigmaClick = () => {
    setSigmaAnalyzed(true);
    onSelect("sigma");
  };

  return (
    <div className="analysis-selector">
      <div className="selector-header">
        <div className="header-content">
          <div className="logo-container">
            <h1>ALIENX</h1>
            <span className="logo-icon">🔆</span>
          </div>
          <p className="tagline">
            {isWindows
              ? "Your EVTX companion"
              : "Your Linux log investigation companion"}
          </p>
        </div>
        <div className="header-actions">
          <button
            className="export-button"
            onClick={() => setShowExportReport(true)}
          >
            Export Report
          </button>
          {onOpenSessions && (
            <button className="sessions-button" onClick={onOpenSessions}>
              Sessions
            </button>
          )}
          <button className="reset-button" onClick={onReset}>
            ← Choose Different Source
          </button>
        </div>
      </div>

      <div className="file-info">
        <div className="file-badge">
          <span className="file-icon">📄</span>
          <span className="file-name">{filename}</span>
        </div>
        <div className="file-stats">
          <span className="stat">
            <strong>{data.entries.length.toLocaleString()}</strong> events
          </span>
          <span className="stat">
            <strong>{data.format.toUpperCase()}</strong> format
          </span>
          {isWindows && isEvtx && (
            <span className="stat">
              <strong>
                {new Set(data.entries.map((e) => e.eventId)).size}
              </strong>{" "}
              unique event IDs
            </span>
          )}
        </div>
      </div>

      {/* Global Event Search Bar */}
      <div style={{ position: "relative", margin: "1rem 0" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "var(--card-bg, rgba(255,255,255,0.04))",
            border: "1px solid rgba(0,240,255,0.15)",
            borderRadius: 8,
            padding: "8px 14px",
          }}
        >
          <span style={{ fontSize: "1.1rem", opacity: 0.6 }}>🔍</span>
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search all events — process names, IPs, commands, registry keys…"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSearchOpen(true);
            }}
            onFocus={() => setSearchOpen(true)}
            onKeyDown={handleSearchKeyDown}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--text-primary, #e4e4e7)",
              fontSize: "0.92rem",
              fontFamily: "inherit",
            }}
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery("");
                setSearchOpen(false);
              }}
              style={{
                background: "none",
                border: "none",
                color: "#888",
                cursor: "pointer",
                fontSize: "1rem",
              }}
            >
              ✕
            </button>
          )}
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              color: "#9ca3af",
              fontSize: "0.75rem",
            }}
            title="Enable regex search"
          >
            <input
              type="checkbox"
              checked={searchRegex}
              onChange={(e) => setSearchRegex(e.target.checked)}
            />
            Regex
          </label>
          <button
            onClick={handleSaveCurrentSearch}
            disabled={searchQuery.trim().length < 2 || !!searchRegexError}
            style={{
              background: "rgba(96,165,250,0.12)",
              border: "1px solid rgba(96,165,250,0.25)",
              color: "#93c5fd",
              borderRadius: 6,
              padding: "2px 8px",
              cursor: "pointer",
              fontSize: "0.72rem",
            }}
            title="Save this search query"
          >
            Save
          </button>
        </div>
        {searchRegexError && (
          <div style={{ color: "#f87171", fontSize: "0.75rem", marginTop: 6 }}>
            {searchRegexError}
          </div>
        )}
        {savedSearches.length > 0 && (
          <div
            style={{
              marginTop: 8,
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
            }}
          >
            {savedSearches.slice(0, 8).map((preset) => (
              <span
                key={preset.id}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 999,
                  padding: "2px 8px",
                  fontSize: "0.72rem",
                  color: "#d1d5db",
                }}
              >
                <button
                  onClick={() => {
                    setSearchQuery(preset.query);
                    setSearchRegex(preset.regex);
                    setSearchOpen(true);
                  }}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "inherit",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  {preset.name}
                </button>
                <button
                  onClick={() => {
                    deleteSearchQuery(preset.id);
                    setSavedSearches(getSavedSearchQueries());
                  }}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "#9ca3af",
                    cursor: "pointer",
                    padding: 0,
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        {searchOpen && searchQuery.trim().length >= 2 && (
          <div
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              right: 0,
              zIndex: 100,
              maxHeight: 360,
              overflowY: "auto",
              background: "var(--bg-secondary, #1a1a2e)",
              border: "1px solid rgba(0,240,255,0.2)",
              borderTop: "none",
              borderRadius: "0 0 8px 8px",
              boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
            }}
          >
            {searchResults.length === 0 ? (
              <div
                style={{
                  padding: "12px 16px",
                  color: "#888",
                  fontSize: "0.85rem",
                }}
              >
                No results for "{searchQuery}"
              </div>
            ) : (
              <>
                <div
                  style={{
                    padding: "6px 14px",
                    fontSize: "0.75rem",
                    color: "#888",
                    borderBottom: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  {searchResults.length >= 50
                    ? "50+ matches"
                    : `${searchResults.length} match${searchResults.length !== 1 ? "es" : ""}`}
                </div>
                {searchResults.map((entry, i) => (
                  <div
                    key={i}
                    onClick={() => {
                      setSelectedSearchEvent(entry);
                      setSearchOpen(false);
                    }}
                    style={{
                      padding: "8px 14px",
                      cursor: "pointer",
                      fontSize: "0.82rem",
                      borderBottom: "1px solid rgba(255,255,255,0.04)",
                      display: "flex",
                      gap: 10,
                      alignItems: "center",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background =
                        "rgba(0,240,255,0.06)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "transparent")
                    }
                  >
                    <span
                      style={{
                        color: "#888",
                        minWidth: 70,
                        fontSize: "0.75rem",
                      }}
                    >
                      {entry.timestamp instanceof Date
                        ? entry.timestamp.toLocaleTimeString()
                        : String(entry.timestamp)}
                    </span>
                    {entry.eventId && (
                      <span
                        style={{
                          color: "#00c8ff",
                          fontFamily: "monospace",
                          minWidth: 45,
                          fontSize: "0.75rem",
                        }}
                      >
                        {entry.eventId}
                      </span>
                    )}
                    <span
                      style={{
                        color: "#ccc",
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {highlightMatch(
                        entry.message ||
                          entry.rawLine?.slice(0, 120) ||
                          "No message",
                      )}
                    </span>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* Automated Triage Score */}
      {triage && (
        <div
          style={{
            margin: "1rem 0",
            padding: "1rem 1.25rem",
            background: "rgba(0,0,0,0.2)",
            borderRadius: 10,
            border: `1px solid ${triage.color}44`,
            display: "flex",
            alignItems: "flex-start",
            gap: "1.25rem",
          }}
        >
          <div
            style={{
              minWidth: 72,
              height: 72,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "column",
              border: `3px solid ${triage.color}`,
              background: `${triage.color}18`,
            }}
          >
            <span
              style={{
                fontSize: "1.4rem",
                fontWeight: 700,
                color: triage.color,
                lineHeight: 1,
              }}
            >
              {triage.score}
            </span>
            <span
              style={{
                fontSize: "0.55rem",
                color: "#aaa",
                textTransform: "uppercase",
                letterSpacing: 1,
              }}
            >
              /100
            </span>
          </div>
          <div style={{ flex: 1 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 6,
              }}
            >
              <span
                style={{
                  fontWeight: 600,
                  color: triage.color,
                  fontSize: "0.95rem",
                }}
              >
                Triage: {triage.label}
              </span>
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "6px 16px",
                fontSize: "0.78rem",
              }}
            >
              {triage.factors.map((f) => (
                <span key={f.name} style={{ color: "#bbb" }} title={f.detail}>
                  <span style={{ color: "#fff", fontWeight: 600 }}>
                    +{f.points}
                  </span>{" "}
                  {f.name}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SIGMA First Banner */}
      {showSigmaBanner && (
        <div className="sigma-first-banner">
          <div className="banner-content">
            <div className="banner-icon">🛡️</div>
            <div className="banner-text">
              <h3>Start with SIGMA Detection</h3>
              <p>
                For best results, run SIGMA threat detection first. Other
                analysis features like Timeline and Event Correlation rely on
                SIGMA results.
              </p>
            </div>
            <button
              className="banner-dismiss"
              onClick={() => setDismissedBanner(true)}
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
          <button className="banner-cta" onClick={handleSigmaClick}>
            Run SIGMA Analysis →
          </button>
        </div>
      )}

      <h2 className="section-title">Select Analysis Type</h2>

      <div
        style={{
          marginBottom: 16,
          padding: "12px 14px",
          borderRadius: 10,
          border: "1px solid rgba(34,197,94,0.25)",
          background: "rgba(34,197,94,0.08)",
        }}
      >
        <h3
          style={{ margin: "0 0 8px", fontSize: "0.92rem", color: "#4ade80" }}
        >
          Threat Hunt Playbooks
        </h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {THREAT_HUNT_PLAYBOOKS.map((playbook) => (
            <button
              key={playbook.id}
              onClick={() =>
                onSelectPlaybook?.(playbook.id, playbook.suggestedQuery)
              }
              title={playbook.description}
              style={{
                border: "1px solid rgba(255,255,255,0.16)",
                background: "rgba(15,23,42,0.5)",
                color: "#e5e7eb",
                borderRadius: 8,
                padding: "6px 10px",
                fontSize: "0.78rem",
                cursor: "pointer",
              }}
            >
              {playbook.name}
            </button>
          ))}
        </div>
      </div>

      <div className="analysis-cards">
        {/* SIGMA Detection */}
        <div
          className={`analysis-card sigma ${hoveredCard === "sigma" ? "hovered" : ""} ${showSigmaBanner ? "recommended" : ""}`}
          onClick={handleSigmaClick}
          onMouseEnter={() => setHoveredCard("sigma")}
          onMouseLeave={() => setHoveredCard(null)}
        >
          {showSigmaBanner && (
            <div className="recommended-badge">Recommended First</div>
          )}
          <div className="card-icon">🛡️</div>
          <div className="card-content">
            <h3>SIGMA Detection</h3>
            <p>
              Detect threats using SIGMA rules. Identify malicious patterns,
              suspicious behaviors, and security incidents in your logs.
            </p>
          </div>
          <div className="card-arrow">→</div>
        </div>

        {/* Dashboards & Metrics */}
        <div
          className={`analysis-card dashboards ${hoveredCard === "dashboards" ? "hovered" : ""}`}
          onClick={() => onSelect("dashboards")}
          onMouseEnter={() => setHoveredCard("dashboards")}
          onMouseLeave={() => setHoveredCard(null)}
        >
          <div className="card-icon">📊</div>
          <div className="card-content">
            <h3>Dashboards & Metrics</h3>
            <p>
              Visualize log data with interactive charts. View event
              distributions, time series, and aggregated statistics.
            </p>
          </div>
          <div className="card-arrow">→</div>
        </div>

        {/* Process Analysis - only for EVTX */}
        {isWindows && isEvtx && (
          <div
            className={`analysis-card process ${hoveredCard === "process" ? "hovered" : ""}`}
            onClick={() => onSelect("process-analysis")}
            onMouseEnter={() => setHoveredCard("process")}
            onMouseLeave={() => setHoveredCard(null)}
          >
            <div className="card-icon">⚙️</div>
            <div className="card-content">
              <h3>Process Execution Analysis</h3>
              <p>
                Analyze process creation events. Identify suspicious executions,
                parent-child relationships, and unusual locations.
              </p>
            </div>
            <div className="card-arrow">→</div>
          </div>
        )}

        {/* Timeline View - only for EVTX with SIGMA */}
        {isWindows && isEvtx && (
          <div
            className={`analysis-card timeline ${hoveredCard === "timeline" ? "hovered" : ""}`}
            onClick={() => onSelect("timeline")}
            onMouseEnter={() => setHoveredCard("timeline")}
            onMouseLeave={() => setHoveredCard(null)}
          >
            <div className="card-icon">📅</div>
            <div className="card-content">
              <h3>Threat Timeline</h3>
              <p>
                View SIGMA detections on a timeline. Understand the sequence of
                security events and investigate incident progression.
              </p>
            </div>
            <div className="card-arrow">→</div>
          </div>
        )}

        {/* Event Correlation - only for EVTX */}
        {isWindows && isEvtx && (
          <div
            className={`analysis-card correlation ${hoveredCard === "correlation" ? "hovered" : ""}`}
            onClick={() => onSelect("event-correlation")}
            onMouseEnter={() => setHoveredCard("correlation")}
            onMouseLeave={() => setHoveredCard(null)}
          >
            <div className="card-icon">🔗</div>
            <div className="card-content">
              <h3>Event Correlation</h3>
              <p>
                Build chains of related events. Identify attack patterns,
                process relationships, and correlated activities across logs.
              </p>
            </div>
            <div className="card-arrow">→</div>
          </div>
        )}

        {/* IOC Extraction */}
        <div
          className={`analysis-card ioc ${hoveredCard === "ioc" ? "hovered" : ""}`}
          onClick={() => onSelect("ioc-extraction")}
          onMouseEnter={() => setHoveredCard("ioc")}
          onMouseLeave={() => setHoveredCard(null)}
        >
          <div className="card-icon">🎯</div>
          <div className="card-content">
            <h3>IOC Extraction</h3>
            <p>
              Extract Indicators of Compromise from logs. Find IPs, domains,
              file hashes, paths, URLs, and email addresses.
            </p>
          </div>
          <div className="card-arrow">→</div>
        </div>

        {/* Raw Logs */}
        <div
          className={`analysis-card raw-logs ${hoveredCard === "raw-logs" ? "hovered" : ""}`}
          onClick={() => onSelect("raw-logs")}
          onMouseEnter={() => setHoveredCard("raw-logs")}
          onMouseLeave={() => setHoveredCard(null)}
        >
          <div className="card-icon">📋</div>
          <div className="card-content">
            <h3>Raw Logs Explorer</h3>
            <p>
              Browse and filter all log entries. Search by timestamp,
              {isWindows
                ? " event ID, computer, source"
                : " process, host, source"}
              , or message content.
            </p>
          </div>
          <div className="card-arrow">→</div>
        </div>

        <div
          className={`analysis-card dashboards ${hoveredCard === "yara-rule-lab" ? "hovered" : ""}`}
          onClick={() => onSelect("yara-rule-lab")}
          onMouseEnter={() => setHoveredCard("yara-rule-lab")}
          onMouseLeave={() => setHoveredCard(null)}
        >
          <div className="card-icon">🧪</div>
          <div className="card-content">
            <h3>YARA Rule Lab</h3>
            <p>
              Create, edit, and tune custom YARA rules in a dedicated authoring
              workspace.
            </p>
          </div>
          <div className="card-arrow">→</div>
        </div>

        <div
          className={`analysis-card rarity ${hoveredCard === "rarity" ? "hovered" : ""}`}
          onClick={() => onSelect("rarity-analysis")}
          onMouseEnter={() => setHoveredCard("rarity")}
          onMouseLeave={() => setHoveredCard(null)}
        >
          <div className="card-icon">🧬</div>
          <div className="card-content">
            <h3>Frequency / Rarity Analysis</h3>
            <p>
              Rank event IDs, process names, and command-lines by least frequent
              first to surface anomalies fast.
            </p>
          </div>
          <div className="card-arrow">→</div>
        </div>

        {/* AI Analysis */}
        <div
          className={`analysis-card ai ${hoveredCard === "ai" ? "hovered" : ""}`}
          onClick={() => onSelect("ai-analysis")}
          onMouseEnter={() => setHoveredCard("ai")}
          onMouseLeave={() => setHoveredCard(null)}
        >
          <div className="card-icon">🤖</div>
          <div className="card-content">
            <h3>AI-Powered Analysis</h3>
            <p>
              Let AI analyze your logs, identify anomalies, and provide natural
              language insights about security events.
            </p>
          </div>
          <div className="card-arrow">→</div>
        </div>
      </div>

      <div className="privacy-note">
        All analysis is performed locally in your browser. No data leaves your
        machine (except when using AI features).
      </div>

      {/* Search Result Detail Modal */}
      {selectedSearchEvent && (
        <EventDetailsModal
          event={selectedSearchEvent}
          isOpen={true}
          onClose={() => setSelectedSearchEvent(null)}
          title="Search Result"
        />
      )}

      {/* Export Report Modal */}
      {showExportReport && (
        <ExportReport
          data={data}
          filename={filename}
          platform={platform}
          sigmaMatches={sigmaMatches}
          onClose={() => setShowExportReport(false)}
        />
      )}
    </div>
  );
}
