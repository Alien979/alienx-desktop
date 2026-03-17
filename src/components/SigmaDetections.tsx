import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { LogEntry } from "../types";
import { getSeverityColor, getSeverityIcon } from "../lib/sigmaRules";
import { SigmaEngine } from "../lib/sigma";
import { SigmaRuleMatch } from "../lib/sigma/types";
import {
  processEventsOptimized,
  OptimizedMatchStats,
} from "../lib/sigma/engine/optimizedMatcher";
import FileFilter from "./FileFilter";
import FileBreakdownStats from "./FileBreakdownStats";
import { EventDetailsModal } from "./EventDetailsModal";
import { MitreHeatmap } from "./MitreHeatmap";
import { MultiFileComparison } from "./MultiFileComparison";
import {
  getSigmaReviewMap,
  upsertSigmaReviewNote,
  SigmaReviewStatus,
} from "../lib/sigmaReviewNotes";
import { THREAT_HUNT_PLAYBOOKS } from "../lib/threatHuntPlaybooks";
import "./SigmaDetections.css";

// ============================================================================
// VIRTUAL SCROLLING CONSTANTS
// ============================================================================
const INITIAL_VISIBLE_COUNT = 10; // Number of cards to show initially
const LOAD_MORE_COUNT = 10; // Number of cards to add when scrolling
const MATCHES_PAGE_SIZE = 20; // Number of matched events to show per rule initially

/**
 * Format selection definition for tooltip display
 * If matchedPattern is provided, only show that specific pattern value
 */
function formatSelectionForTooltip(
  selection: any,
  selectionName: string,
  fieldName?: string,
  matchedPattern?: string | number | null | (string | number | null)[],
): string {
  if (!selection) return `${selectionName}: (no definition available)`;

  // If we have a matched pattern, show only that specific value
  if (matchedPattern !== undefined && fieldName) {
    // Handle array of patterns (for requireAll conditions)
    if (Array.isArray(matchedPattern)) {
      let yaml = `${selectionName}:\n  ${fieldName}:\n`;
      matchedPattern.forEach((pattern) => {
        yaml += `    - '${pattern}'\n`;
      });
      return yaml.trim();
    }
    // Single pattern
    return `${selectionName}:\n  ${fieldName}: '${matchedPattern}'`;
  }

  try {
    // Convert to YAML-like format
    let yaml = `${selectionName}:\n`;

    if (Array.isArray(selection)) {
      // Array-based selection (OR logic)
      selection.forEach((item) => {
        yaml += "  -";
        const entries = Object.entries(item);
        if (entries.length === 1) {
          const [key, value] = entries[0];
          yaml += ` ${key}: ${formatValue(value)}\n`;
        } else {
          yaml += "\n";
          entries.forEach(([key, value]) => {
            yaml += `    ${key}: ${formatValue(value)}\n`;
          });
        }
      });
    } else {
      // Object-based selection (AND logic)
      Object.entries(selection).forEach(([key, value]) => {
        yaml += `  ${key}: ${formatValue(value)}\n`;
      });
    }

    return yaml.trim();
  } catch (e) {
    return `${selectionName}: ${JSON.stringify(selection)}`;
  }
}

function formatValue(value: any): string {
  if (Array.isArray(value)) {
    if (value.length === 1) return `'${value[0]}'`;
    return "\n" + value.map((v) => `      - '${v}'`).join("\n");
  }
  return `'${value}'`;
}

interface SigmaDetectionsProps {
  events: LogEntry[];
  sigmaEngine?: SigmaEngine;
  onMatchesUpdate?: (matches: Map<string, SigmaRuleMatch[]>) => void;
  cachedMatches?: Map<string, SigmaRuleMatch[]>;
  sourceFiles?: string[];
  playbookFilterId?: string | null;
}

export default function SigmaDetections({
  events,
  sigmaEngine,
  onMatchesUpdate,
  cachedMatches,
  sourceFiles,
  playbookFilterId,
}: SigmaDetectionsProps) {
  const [expandedRule, setExpandedRule] = useState<string | null>(null);
  const [matches, setMatches] = useState<Map<string, SigmaRuleMatch[]>>(
    cachedMatches || new Map(),
  );
  // isLoading=false when cachedMatches is provided (even empty Map means "already ran")
  const [isLoading, setIsLoading] = useState(cachedMatches === undefined);
  const [progress, setProgress] = useState({
    processed: 0,
    total: 0,
    matchesFound: 0,
  });
  const [optimizationStats, setOptimizationStats] =
    useState<OptimizedMatchStats | null>(null);
  const [copiedItem, setCopiedItem] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  // Modal state for viewing raw event
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState<string>("");

  // Virtual scrolling state
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COUNT);
  const containerRef = useRef<HTMLDivElement>(null);
  const [matchesVisiblePerRule, setMatchesVisiblePerRule] = useState<
    Record<string, number>
  >({});
  const [reviewNotes, setReviewNotes] = useState(() => getSigmaReviewMap());
  const [draftReview, setDraftReview] = useState<
    Record<string, { status: SigmaReviewStatus; note: string }>
  >({});
  const lastProgressUpdateRef = useRef(0);

  // Auto-clear copied tooltip after 2 seconds
  useEffect(() => {
    if (copiedItem) {
      const timer = setTimeout(() => setCopiedItem(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [copiedItem]);

  // Use ref for callback to avoid re-triggering effect
  const onMatchesUpdateRef = useRef(onMatchesUpdate);
  onMatchesUpdateRef.current = onMatchesUpdate;

  // Sentinel ref for intersection observer (placed at bottom of list)
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Reset visible count when matches change
  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_COUNT);
  }, [matches]);

  // Legacy scroll handler (backup for browsers without IntersectionObserver)
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const scrollThreshold = 200;

    if (scrollHeight - scrollTop - clientHeight < scrollThreshold) {
      setVisibleCount((prev) => prev + LOAD_MORE_COUNT);
    }
  }, []);

  // Run SIGMA matching asynchronously with optimized processing
  useEffect(() => {
    // Skip processing if we already have cached matches (even empty — means analysis already ran)
    if (cachedMatches !== undefined && matches.size === 0) {
      setMatches(cachedMatches);
      setIsLoading(false);
      // Notify parent with cached results
      if (onMatchesUpdateRef.current) {
        onMatchesUpdateRef.current(cachedMatches);
      }
      return;
    }

    // Skip if we already have matches (processing completed)
    if (matches.size > 0) {
      return;
    }

    if (!sigmaEngine || events.length === 0) {
      setMatches(new Map());
      setIsLoading(false);
      setOptimizationStats(null);
      return;
    }

    setIsLoading(true);
    setProgress({ processed: 0, total: events.length, matchesFound: 0 });

    const rules = sigmaEngine.getAllRules();

    let cancelled = false;

    // Start optimized processing on main thread with yields
    processEventsOptimized(
      events,
      rules,
      (processed, total, stats) => {
        if (cancelled) return;
        const now = performance.now();
        // Throttle UI updates to reduce render overhead on large datasets.
        if (now - lastProgressUpdateRef.current < 120 && processed < total) {
          return;
        }
        lastProgressUpdateRef.current = now;

        setProgress({
          processed,
          total,
          matchesFound: stats?.matchesFound || 0,
        });
      },
      1000, // Larger chunk size for better throughput
    )
      .then(({ matches: result, stats }) => {
        if (cancelled) return;
        setMatches(result);
        setOptimizationStats(stats);
        setIsLoading(false);
        // Notify parent that analysis is complete
        if (onMatchesUpdateRef.current) {
          onMatchesUpdateRef.current(result);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("SIGMA processing failed:", err);
        setIsLoading(false);
        setMatches(new Map());
        // Always notify parent so the back button unlocks even on error
        if (onMatchesUpdateRef.current) {
          onMatchesUpdateRef.current(new Map());
        }
      });

    return () => {
      cancelled = true;
    };
  }, [events, sigmaEngine, cachedMatches]);

  // Calculate statistics from matches
  const stats = useMemo(() => {
    const totalMatches = Array.from(matches.values()).reduce(
      (sum, m) => sum + m.length,
      0,
    );
    const bySeverity = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      informational: 0,
    };

    for (const ruleMatches of matches.values()) {
      if (ruleMatches.length > 0) {
        let severity: string = ruleMatches[0].rule.level || "medium";
        // Normalise legacy 'info' level to 'informational'
        if (severity === "info") severity = "informational";
        bySeverity[severity as keyof typeof bySeverity] += ruleMatches.length;
      }
    }

    return {
      totalRules: matches.size,
      matchedRules: matches.size,
      totalMatches,
      bySeverity,
    };
  }, [matches]);

  // Collect all MITRE ATT&CK tags for heatmap — one entry per unique rule
  const allMitreTags = useMemo(() => {
    const tags: string[] = [];
    for (const ruleMatches of matches.values()) {
      if (ruleMatches.length > 0) {
        const ruleTags = ruleMatches[0].rule.tags;
        if (ruleTags) {
          // Each unique rule contributes its tags once (not per-event)
          tags.push(...ruleTags);
        }
      }
    }
    return tags;
  }, [matches]);

  // Sort rules by severity (critical first)
  const sortedMatches = useMemo(() => {
    const entries = Array.from(matches.entries());
    return entries.sort((a, b) => {
      const severityOrder: Record<string, number> = {
        critical: 0,
        high: 1,
        medium: 2,
        low: 3,
        informational: 4,
        info: 4,
      };
      const severityA = a[1][0]?.rule.level || "medium";
      const severityB = b[1][0]?.rule.level || "medium";
      return (severityOrder[severityA] || 2) - (severityOrder[severityB] || 2);
    });
  }, [matches]);

  // Filter matches by selected file
  const filteredMatches = useMemo(() => {
    let baseMatches = sortedMatches;

    if (playbookFilterId) {
      const playbook = THREAT_HUNT_PLAYBOOKS.find(
        (p) => p.id === playbookFilterId,
      );
      if (playbook) {
        baseMatches = baseMatches.filter(([, ruleMatches]) => {
          const tags = ruleMatches[0]?.rule.tags || [];
          const combined =
            `${ruleMatches[0]?.rule.title || ""} ${tags.join(" ")}`.toLowerCase();
          return playbook.sigmaTagKeywords.some((keyword) =>
            combined.includes(keyword.toLowerCase()),
          );
        });
      }
    }

    if (!selectedFile) return baseMatches;

    return baseMatches
      .map(([ruleId, ruleMatches]) => {
        const filtered = ruleMatches.filter(
          (match) => match.event.sourceFile === selectedFile,
        );
        return [ruleId, filtered] as [string, SigmaRuleMatch[]];
      })
      .filter(([, ruleMatches]) => ruleMatches.length > 0);
  }, [sortedMatches, selectedFile, playbookFilterId]);

  // Tooltip positioning is now handled by CSS (position: absolute)
  // No JavaScript positioning needed - tooltip stays relative to its wrapper element

  // Window scroll handler for infinite scroll
  // Using window scroll since parent containers control scrolling
  // Track last scroll position to only trigger on actual scroll down
  const lastScrollY = useRef(0);
  const hasScrolledOnce = useRef(false);

  useEffect(() => {
    if (sortedMatches.length === 0) return;

    // Reset scroll tracking when matches change
    lastScrollY.current = window.scrollY;
    hasScrolledOnce.current = false;

    const handleWindowScroll = () => {
      const currentScrollY = window.scrollY;

      // Only process if user has scrolled down from last position
      if (currentScrollY <= lastScrollY.current && hasScrolledOnce.current) {
        lastScrollY.current = currentScrollY;
        return;
      }

      hasScrolledOnce.current = true;
      lastScrollY.current = currentScrollY;

      const sentinel = sentinelRef.current;
      if (!sentinel) return;

      // Check if sentinel is near the viewport bottom
      const rect = sentinel.getBoundingClientRect();
      const windowHeight = window.innerHeight;

      // Load more when sentinel is within 150px of viewport bottom
      if (rect.top < windowHeight + 150) {
        setVisibleCount((prev) => {
          if (prev >= sortedMatches.length) return prev;
          return Math.min(prev + LOAD_MORE_COUNT, sortedMatches.length);
        });
      }
    };

    // Throttle scroll events
    let ticking = false;
    const throttledScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          handleWindowScroll();
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener("scroll", throttledScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", throttledScroll);
    };
  }, [sortedMatches.length]);

  const toggleExpand = (ruleId: string) => {
    setExpandedRule(expandedRule === ruleId ? null : ruleId);
  };

  // Handle opening event details modal
  const handleViewEvent = (event: any, ruleTitle: string) => {
    const eventData = event as any;
    const eventId = eventData.EventID || eventData.eventId || "Unknown";
    const computer = eventData.Computer || eventData.computer || "Unknown";
    setModalTitle(`${ruleTitle} - Event ID: ${eventId} - ${computer}`);
    setSelectedEvent(event);
    setIsModalOpen(true);
  };

  // Get total rule count from engine
  const totalRules = sigmaEngine?.getAllRules().length || 0;

  return (
    <div className="sigma-detections">
      <div className="sigma-header">
        <h2>SIGMA Threat Detections</h2>
        {totalRules > 0 && (
          <p className="sigma-subtitle">
            Automated detection using {totalRules} security rules
          </p>
        )}
      </div>

      {/* Statistics Summary */}
      <div className="sigma-summary">
        {isLoading ? (
          <div className="loading-state">
            <div className="sigma-loading-spinner"></div>
            <h3>Analyzing Events</h3>
            <p>
              Scanning {events.length.toLocaleString()} events against SIGMA
              rules...
            </p>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{
                  width: `${(progress.processed / Math.max(progress.total, 1)) * 100}%`,
                }}
              />
            </div>
            <div className="progress-text">
              {Math.round(
                (progress.processed / Math.max(progress.total, 1)) * 100,
              )}
              %
              {progress.matchesFound > 0 &&
                ` • ${progress.matchesFound} detections found`}
            </div>
          </div>
        ) : stats.totalMatches === 0 ? (
          <div className="no-threats">
            <span className="success-icon">OK</span>
            <h3>No Threats Detected</h3>
            <p>All {events.length} events passed security checks</p>
          </div>
        ) : (
          <div className="threat-stats">
            <div className="stat-item">
              <span className="stat-number">{stats.totalMatches}</span>
              <span className="stat-label">Total Detections</span>
            </div>
            {stats.bySeverity.critical > 0 && (
              <div className="stat-item critical">
                <span className="stat-icon">🔴</span>
                <span className="stat-number">{stats.bySeverity.critical}</span>
                <span className="stat-label">Critical</span>
              </div>
            )}
            {stats.bySeverity.high > 0 && (
              <div className="stat-item high">
                <span className="stat-icon">🟠</span>
                <span className="stat-number">{stats.bySeverity.high}</span>
                <span className="stat-label">High</span>
              </div>
            )}
            {stats.bySeverity.medium > 0 && (
              <div className="stat-item medium">
                <span className="stat-icon">🟡</span>
                <span className="stat-number">{stats.bySeverity.medium}</span>
                <span className="stat-label">Medium</span>
              </div>
            )}
            {stats.bySeverity.low > 0 && (
              <div className="stat-item low">
                <span className="stat-icon">🟢</span>
                <span className="stat-number">{stats.bySeverity.low}</span>
                <span className="stat-label">Low</span>
              </div>
            )}
            {stats.bySeverity.informational > 0 && (
              <div className="stat-item info">
                <span className="stat-icon">🔵</span>
                <span className="stat-number">
                  {stats.bySeverity.informational}
                </span>
                <span className="stat-label">Informational</span>
              </div>
            )}
          </div>
        )}
        {!isLoading && optimizationStats && (
          <p className="optimization-info">
            Analyzed in {(optimizationStats.processingTimeMs / 1000).toFixed(1)}
            s
          </p>
        )}
      </div>

      {/* MITRE ATT&CK Heatmap */}
      {!isLoading && allMitreTags.length > 0 && (
        <MitreHeatmap tags={allMitreTags} />
      )}

      {/* Multi-file Comparison */}
      {!isLoading && (
        <MultiFileComparison
          entries={events}
          sourceFiles={sourceFiles}
          matches={matches}
        />
      )}

      {/* File Breakdown Stats */}
      <FileBreakdownStats entries={events} sourceFiles={sourceFiles} />

      {/* File Filter */}
      <FileFilter
        sourceFiles={sourceFiles}
        selectedFile={selectedFile}
        onFileSelect={setSelectedFile}
      />

      {/* Detection Cards - Virtual Scrolling */}
      {!isLoading && filteredMatches.length > 0 && (
        <div
          className="sigma-matches"
          ref={containerRef}
          onScroll={handleScroll}
        >
          {filteredMatches
            .slice(0, visibleCount)
            .map(([ruleId, ruleMatches]) => {
              if (ruleMatches.length === 0) return null;

              const rule = ruleMatches[0].rule;
              const isExpanded = expandedRule === ruleId;
              const review = reviewNotes.get(rule.id);
              const draft = draftReview[rule.id] || {
                status: review?.status || "unreviewed",
                note: review?.note || "",
              };

              const level = rule.level || "medium";

              return (
                <div
                  key={ruleId}
                  className={`sigma-match ${level}`}
                  style={{ borderLeftColor: getSeverityColor(level) }}
                >
                  <div
                    onClick={() => toggleExpand(ruleId)}
                    style={{ cursor: "pointer" }}
                  >
                    <div className="match-header">
                      <div className="match-title">
                        <span className="severity-icon">
                          {getSeverityIcon(level)}
                        </span>
                        <div style={{ position: "relative" }}>
                          <h3
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(rule.title);
                              setCopiedItem(`title-${ruleId}`);
                            }}
                            style={{
                              cursor: "pointer !important",
                              userSelect: "none",
                              margin: 0,
                            }}
                            title="Click to copy title"
                          >
                            {rule.title}
                          </h3>
                          {copiedItem === `title-${ruleId}` && (
                            <span
                              style={{
                                position: "absolute",
                                top: "0",
                                left: "100%",
                                marginLeft: "0.75rem",
                                backgroundColor: "#10b981",
                                color: "white",
                                padding: "0.25rem 0.5rem",
                                borderRadius: "4px",
                                fontSize: "0.75rem",
                                fontWeight: "600",
                                zIndex: 1000,
                                whiteSpace: "nowrap",
                                boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                              }}
                            >
                              Copied
                            </span>
                          )}
                          <div
                            style={{
                              fontSize: "0.85rem",
                              color: "#ffffff",
                              marginTop: "0.25rem",
                              fontFamily:
                                "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                              position: "relative",
                            }}
                          >
                            <span
                              style={{ fontWeight: "600", color: "#e5e7eb" }}
                            >
                              Rule ID:{" "}
                            </span>
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(rule.id);
                                setCopiedItem(`id-${ruleId}`);
                              }}
                              style={{ cursor: "pointer", userSelect: "none" }}
                              title="Click to copy rule ID"
                            >
                              {rule.id}
                            </span>
                            {copiedItem === `id-${ruleId}` && (
                              <span
                                style={{
                                  position: "absolute",
                                  top: "0",
                                  left: "100%",
                                  marginLeft: "0.5rem",
                                  backgroundColor: "#10b981",
                                  color: "white",
                                  padding: "0.25rem 0.5rem",
                                  borderRadius: "4px",
                                  fontSize: "0.75rem",
                                  fontWeight: "600",
                                  zIndex: 1000,
                                  whiteSpace: "nowrap",
                                  boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                                }}
                              >
                                Copied
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="match-meta">
                        <span className="match-count">
                          {ruleMatches.length}{" "}
                          {ruleMatches.length === 1 ? "event" : "events"}
                        </span>
                        <button
                          className="expand-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleExpand(ruleId);
                          }}
                        >
                          {isExpanded ? "▼" : "▶"}
                        </button>
                      </div>
                    </div>

                    <p className="match-description">{rule.description}</p>
                    {rule.author && (
                      <div className="rule-author">
                        <span className="author-label">Rule Author:</span>{" "}
                        {rule.author}
                      </div>
                    )}

                    <div className="match-info">
                      <span
                        className="severity-badge"
                        style={{ backgroundColor: getSeverityColor(level) }}
                      >
                        {level.toUpperCase()}
                      </span>
                      {rule.tags && rule.tags.length > 0 && (
                        <span className="tags">
                          {rule.tags.map((tag) => (
                            <span key={tag} className="tag">
                              {tag}
                            </span>
                          ))}
                        </span>
                      )}
                      {review && (
                        <span className="tag" title={review.note || "Reviewed"}>
                          Review: {review.status.replace("_", " ")}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Expandable Details */}
                  {isExpanded && (
                    <div className="match-details">
                      <div
                        style={{
                          marginBottom: "0.8rem",
                          padding: "0.75rem",
                          border: "1px solid rgba(255,255,255,0.1)",
                          borderRadius: 8,
                          background: "rgba(255,255,255,0.03)",
                        }}
                      >
                        <h5 style={{ margin: "0 0 0.5rem" }}>Rule Review</h5>
                        <div
                          style={{
                            display: "flex",
                            gap: 8,
                            alignItems: "center",
                            flexWrap: "wrap",
                          }}
                        >
                          <select
                            value={draft.status}
                            onChange={(e) =>
                              setDraftReview((prev) => ({
                                ...prev,
                                [rule.id]: {
                                  ...draft,
                                  status: e.target.value as SigmaReviewStatus,
                                },
                              }))
                            }
                          >
                            <option value="unreviewed">Unreviewed</option>
                            <option value="reviewed">Reviewed</option>
                            <option value="false_positive">
                              False Positive
                            </option>
                            <option value="confirmed">Confirmed</option>
                          </select>
                          <input
                            value={draft.note}
                            onChange={(e) =>
                              setDraftReview((prev) => ({
                                ...prev,
                                [rule.id]: {
                                  ...draft,
                                  note: e.target.value,
                                },
                              }))
                            }
                            placeholder="Analyst note"
                            style={{
                              flex: 1,
                              minWidth: 220,
                              background: "rgba(255,255,255,0.05)",
                              border: "1px solid rgba(255,255,255,0.14)",
                              borderRadius: 6,
                              color: "#e5e7eb",
                              padding: "6px 8px",
                            }}
                          />
                          <button
                            className="expand-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              const saved = upsertSigmaReviewNote({
                                ruleId: rule.id,
                                status: draft.status,
                                note: draft.note,
                              });
                              setReviewNotes((prev) => {
                                const next = new Map(prev);
                                next.set(saved.ruleId, saved);
                                return next;
                              });
                            }}
                          >
                            Save Review
                          </button>
                        </div>
                      </div>
                      <h4>Matched Events ({ruleMatches.length})</h4>
                      <div className="matched-events">
                        {ruleMatches
                          .slice(
                            0,
                            matchesVisiblePerRule[ruleId] || MATCHES_PAGE_SIZE,
                          )
                          .map((match, idx) => {
                            // Extract matched fields with more details from selection matches
                            const allFieldMatches: Array<{
                              field: string;
                              value: any;
                              selection: string;
                              selectionDef?: any;
                              modifier?: string;
                              matchedPattern?:
                                | string
                                | number
                                | null
                                | (string | number | null)[];
                            }> = [];

                            if (
                              match.selectionMatches &&
                              match.selectionMatches.length > 0
                            ) {
                              for (const selMatch of match.selectionMatches) {
                                // Get the selection definition from compiled rule
                                let selectionDef;
                                if (
                                  match.compiledRule &&
                                  match.compiledRule.selections
                                ) {
                                  const selection =
                                    match.compiledRule.selections.get(
                                      selMatch.selection,
                                    );
                                  selectionDef = selection?.originalDefinition;
                                }

                                if (selMatch.fieldMatches) {
                                  for (const fm of selMatch.fieldMatches) {
                                    // For filter selections (NOT conditions), show all fields even if undefined
                                    // For regular selections, skip undefined/null fields (Sysmon-only fields)
                                    const isFilterSelection = selMatch.selection
                                      .toLowerCase()
                                      .startsWith("filter");

                                    if (
                                      !isFilterSelection &&
                                      (fm.value === undefined ||
                                        fm.value === null)
                                    ) {
                                      continue;
                                    }

                                    // Include ALL field matches, not just matched ones
                                    // This is important for NOT conditions where fields are expected to NOT match
                                    allFieldMatches.push({
                                      field: fm.field,
                                      value: fm.value,
                                      selection: selMatch.selection,
                                      selectionDef: selectionDef,
                                      modifier: fm.modifier,
                                      matchedPattern: fm.matchedPattern,
                                    });
                                  }
                                }
                              }
                            }

                            const eventData = match.event as any;
                            const timestamp =
                              eventData.timestamp ||
                              match.timestamp ||
                              new Date();

                            return (
                              <div key={idx} className="matched-event">
                                <div className="event-header-row">
                                  <div className="event-time">
                                    {timestamp instanceof Date
                                      ? timestamp.toLocaleString()
                                      : new Date(timestamp).toLocaleString()}
                                  </div>
                                  <button
                                    className="view-event-btn"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleViewEvent(eventData, rule.title);
                                    }}
                                    title="View complete event details"
                                  >
                                    📄 View Raw Event
                                  </button>
                                </div>
                                <div className="event-info">
                                  <span>
                                    Computer:{" "}
                                    {eventData.Computer ||
                                      eventData.computer ||
                                      "N/A"}
                                  </span>
                                  <span>
                                    Event ID:{" "}
                                    {eventData.EventID ||
                                      eventData.eventId ||
                                      "N/A"}
                                  </span>
                                  <span>
                                    Source:{" "}
                                    {eventData.Provider ||
                                      eventData.source ||
                                      "N/A"}
                                  </span>
                                </div>
                                {allFieldMatches.length > 0 && (
                                  <div className="matched-fields">
                                    {/* Why Did This Match? — Comprehensive Detection Breakdown */}
                                    <div className="why-matched-panel">
                                      <div className="why-matched-header">
                                        <span className="why-matched-icon">
                                          🔍
                                        </span>
                                        <span className="why-matched-title">
                                          Why did this match?
                                        </span>
                                      </div>

                                      {/* Rule context */}
                                      {rule.description && (
                                        <div className="why-rule-description">
                                          {rule.description}
                                        </div>
                                      )}

                                      <div className="why-matched-body">
                                        {(() => {
                                          // Group field matches by selection
                                          const selGroups = new Map<
                                            string,
                                            typeof allFieldMatches
                                          >();
                                          for (const fm of allFieldMatches) {
                                            const arr =
                                              selGroups.get(fm.selection) || [];
                                            arr.push(fm);
                                            selGroups.set(fm.selection, arr);
                                          }
                                          return Array.from(
                                            selGroups.entries(),
                                          ).map(([sel, fields]) => {
                                            const isFilter = sel
                                              .toLowerCase()
                                              .startsWith("filter");
                                            // Check if this selection overall matched
                                            const selMatch =
                                              match.selectionMatches?.find(
                                                (sm) => sm.selection === sel,
                                              );
                                            const selMatched =
                                              selMatch?.matched ?? false;

                                            return (
                                              <div
                                                key={sel}
                                                className={`why-matched-group ${isFilter ? "why-group-filter" : ""} ${selMatched ? "why-group-matched" : "why-group-unmatched"}`}
                                              >
                                                <div className="why-matched-sel-label">
                                                  <span className="why-sel-status">
                                                    {isFilter
                                                      ? selMatched
                                                        ? "❌"
                                                        : "✅"
                                                      : selMatched
                                                        ? "✅"
                                                        : "❌"}
                                                  </span>
                                                  {isFilter ? (
                                                    <span className="why-sel-badge why-sel-filter">
                                                      FILTER: {sel}
                                                    </span>
                                                  ) : (
                                                    <span className="why-sel-badge why-sel-select">
                                                      {sel}
                                                    </span>
                                                  )}
                                                  <span className="why-sel-summary">
                                                    {isFilter
                                                      ? selMatched
                                                        ? "exclusion matched — would normally suppress, but condition logic allowed detection"
                                                        : "exclusion did not match — detection not suppressed"
                                                      : selMatched
                                                        ? `${fields.filter((f) => f.matchedPattern !== undefined).length} of ${fields.length} field(s) triggered`
                                                        : "selection did not match"}
                                                  </span>
                                                </div>
                                                {fields.map((fm, fi) => {
                                                  const hasPattern =
                                                    fm.matchedPattern !==
                                                    undefined;
                                                  const modLabel =
                                                    fm.modifier || "equals";
                                                  const patternStr =
                                                    fm.matchedPattern !==
                                                    undefined
                                                      ? Array.isArray(
                                                          fm.matchedPattern,
                                                        )
                                                        ? fm.matchedPattern
                                                            .map(
                                                              (p) => `"${p}"`,
                                                            )
                                                            .join(", ")
                                                        : `"${fm.matchedPattern}"`
                                                      : null;
                                                  const valStr =
                                                    fm.value === undefined ||
                                                    fm.value === null
                                                      ? fm.value === null
                                                        ? "null"
                                                        : "not present"
                                                      : fm.value === ""
                                                        ? '""'
                                                        : String(fm.value);
                                                  return (
                                                    <div
                                                      key={fi}
                                                      className={`why-matched-row ${hasPattern ? "why-row-hit" : "why-row-miss"}`}
                                                    >
                                                      <span className="why-row-indicator">
                                                        {hasPattern ? "●" : "○"}
                                                      </span>
                                                      <span className="why-field-name">
                                                        {fm.field}
                                                      </span>
                                                      <span className="why-arrow">
                                                        =
                                                      </span>
                                                      <span
                                                        className="why-actual-value"
                                                        title={valStr}
                                                      >
                                                        {valStr.length > 100
                                                          ? valStr.slice(
                                                              0,
                                                              100,
                                                            ) + "…"
                                                          : valStr}
                                                      </span>
                                                      {patternStr && (
                                                        <span className="why-matched-because">
                                                          <span className="why-modifier">
                                                            {modLabel}
                                                          </span>
                                                          <span className="why-pattern">
                                                            {patternStr}
                                                          </span>
                                                        </span>
                                                      )}
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                            );
                                          });
                                        })()}
                                        {rule.detection?.condition &&
                                          typeof rule.detection.condition ===
                                            "string" && (
                                            <div className="why-condition-row">
                                              <span className="why-condition-label">
                                                Condition:
                                              </span>
                                              <code className="why-condition-code">
                                                {rule.detection.condition}
                                              </code>
                                            </div>
                                          )}
                                      </div>
                                    </div>

                                    {/* Collapsed raw field details */}
                                    <details className="raw-fields-details">
                                      <summary className="raw-fields-summary">
                                        Raw Field Details (
                                        {allFieldMatches.length} fields)
                                        <span className="raw-fields-hint">
                                          Hover selection names for YAML
                                          definition
                                        </span>
                                      </summary>
                                      {allFieldMatches.map((fm, fmIdx) => (
                                        <div
                                          key={fmIdx}
                                          className="field-match"
                                        >
                                          <div className="field-match-header">
                                            <span className="field-name">
                                              {fm.field}
                                            </span>
                                            {fm.modifier &&
                                              fm.modifier !== "equals" && (
                                                <span className="field-modifier">
                                                  {fm.modifier}
                                                </span>
                                              )}
                                            {fm.selection
                                              .toLowerCase()
                                              .startsWith("filter") && (
                                              <span className="field-not-label">
                                                NOT
                                              </span>
                                            )}
                                            <span className="field-selection-wrapper">
                                              <span className="field-selection">
                                                {fm.selection}
                                              </span>
                                              {fm.selectionDef && (
                                                <span className="field-selection-tooltip">
                                                  <pre>
                                                    {formatSelectionForTooltip(
                                                      fm.selectionDef,
                                                      fm.selection,
                                                      fm.field,
                                                      fm.matchedPattern,
                                                    )}
                                                  </pre>
                                                </span>
                                              )}
                                            </span>
                                          </div>
                                          <div className="field-value">
                                            {fm.value === undefined ||
                                            fm.value === null ? (
                                              <span
                                                style={{
                                                  fontStyle: "italic",
                                                  color: "var(--text-dim)",
                                                }}
                                              >
                                                {fm.value === null
                                                  ? "(null)"
                                                  : "(not found in event)"}
                                              </span>
                                            ) : fm.value === "" ? (
                                              <span
                                                style={{
                                                  fontStyle: "italic",
                                                  color: "var(--text-dim)",
                                                }}
                                              >
                                                (empty)
                                              </span>
                                            ) : (
                                              <span
                                                style={{
                                                  wordBreak: "break-all",
                                                }}
                                              >
                                                {String(fm.value)}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                    </details>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        {ruleMatches.length >
                          (matchesVisiblePerRule[ruleId] ||
                            MATCHES_PAGE_SIZE) && (
                          <div
                            className="more-events"
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              gap: "0.5rem",
                              padding: "0.75rem",
                            }}
                          >
                            <span>
                              Showing{" "}
                              {matchesVisiblePerRule[ruleId] ||
                                MATCHES_PAGE_SIZE}{" "}
                              of {ruleMatches.length} events
                            </span>
                            <div style={{ display: "flex", gap: "0.5rem" }}>
                              <button
                                className="expand-btn"
                                style={{
                                  fontSize: "0.8rem",
                                  padding: "0.3rem 0.8rem",
                                  cursor: "pointer",
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setMatchesVisiblePerRule((prev) => ({
                                    ...prev,
                                    [ruleId]:
                                      (prev[ruleId] || MATCHES_PAGE_SIZE) +
                                      MATCHES_PAGE_SIZE,
                                  }));
                                }}
                              >
                                Load{" "}
                                {Math.min(
                                  MATCHES_PAGE_SIZE,
                                  ruleMatches.length -
                                    (matchesVisiblePerRule[ruleId] ||
                                      MATCHES_PAGE_SIZE),
                                )}{" "}
                                More
                              </button>
                              <button
                                className="expand-btn"
                                style={{
                                  fontSize: "0.8rem",
                                  padding: "0.3rem 0.8rem",
                                  cursor: "pointer",
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setMatchesVisiblePerRule((prev) => ({
                                    ...prev,
                                    [ruleId]: Infinity,
                                  }));
                                }}
                              >
                                Show All ({ruleMatches.length})
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {rule.references && rule.references.length > 0 && (
                        <div className="references">
                          <h5>References:</h5>
                          {rule.references.map((ref, idx) => (
                            <a
                              key={idx}
                              href={ref}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {ref}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

          {/* Sentinel for Intersection Observer - triggers load more */}
          {visibleCount < sortedMatches.length && (
            <>
              <div ref={sentinelRef} className="scroll-sentinel" />
              <div className="load-more-indicator">
                <span>
                  Showing {Math.min(visibleCount, sortedMatches.length)} of{" "}
                  {sortedMatches.length} detection rules
                </span>
                <button
                  className="load-more-btn"
                  onClick={() =>
                    setVisibleCount((prev) =>
                      Math.min(prev + LOAD_MORE_COUNT, sortedMatches.length),
                    )
                  }
                >
                  Load More
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Event Details Modal */}
      <EventDetailsModal
        event={selectedEvent}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={modalTitle}
      />
    </div>
  );
}
