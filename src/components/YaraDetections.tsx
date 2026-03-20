import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LogEntry, LogPlatform } from "../types";
import {
  BundledYaraRule,
  loadBundledYaraRules,
  scanEventsWithYara,
  YaraRuleMatch,
  YaraScanStats,
} from "../lib/yara";
import {
  getCustomYaraRules,
  isCustomRuleEnabled,
  getStoredYaraStrictness,
  setStoredYaraStrictness,
  YaraStrictness,
} from "../lib/customYaraRules";
import { runYaraScanInWorker } from "../lib/yaraWorkerClient";
import { EventDetailsModal } from "./EventDetailsModal";
import FileFilter from "./FileFilter";
import FileBreakdownStats from "./FileBreakdownStats";
import "./SigmaDetections.css";

// ============================================================================
// VIRTUAL SCROLLING CONSTANTS
// ============================================================================
const INITIAL_VISIBLE_COUNT = 10;
const LOAD_MORE_COUNT = 10;
const EVENTS_PAGE_SIZE = 10;

interface YaraDetectionsProps {
  events: LogEntry[];
  platform: LogPlatform;
  onOpenRawLogs?: () => void;
  onOpenRuleLab?: () => void;
  cachedMatches?: YaraRuleMatch[];
  cachedStats?: YaraScanStats;
  onMatchesUpdate?: (
    matches: YaraRuleMatch[],
    stats: YaraScanStats | null,
  ) => void;
}

export default function YaraDetections({
  events,
  platform,
  onOpenRawLogs,
  onOpenRuleLab,
  cachedMatches,
  cachedStats,
  onMatchesUpdate,
}: YaraDetectionsProps) {
  const [matches, setMatches] = useState<YaraRuleMatch[]>(cachedMatches ?? []);
  const [isLoading, setIsLoading] = useState(cachedMatches === undefined);
  const [scanStats, setScanStats] = useState<YaraScanStats | null>(
    cachedStats ?? null,
  );
  const [progress, setProgress] = useState({
    processed: 0,
    total: 0,
    matchesFound: 0,
  });
  const lastProgressUpdateRef = useRef(0);
  const onMatchesUpdateRef = useRef(onMatchesUpdate);
  onMatchesUpdateRef.current = onMatchesUpdate;

  const [strictness, setStrictness] = useState<YaraStrictness>(() =>
    getStoredYaraStrictness(),
  );
  const [customRules, setCustomRules] = useState<BundledYaraRule[]>(() =>
    getCustomYaraRules(),
  );

  // Card expand/collapse
  const [expandedRule, setExpandedRule] = useState<string | null>(null);

  // Virtual scrolling
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COUNT);
  const [eventsVisiblePerRule, setEventsVisiblePerRule] = useState<
    Record<string, number>
  >({});
  const containerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const lastScrollY = useRef(0);
  const hasScrolledOnce = useRef(false);

  // File filter
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  // Copy-to-clipboard feedback
  const [copiedItem, setCopiedItem] = useState<string | null>(null);

  // Event details modal
  const [selectedEvent, setSelectedEvent] = useState<LogEntry | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("YARA Matched Event");

  const platformCustomRules = useMemo(
    () =>
      customRules.filter(
        (rule) => rule.platform === "all" || rule.platform === platform,
      ),
    [customRules, platform],
  );

  const handleStrictnessChange = (value: YaraStrictness) => {
    setStrictness(value);
    setStoredYaraStrictness(value);
  };

  useEffect(() => {
    const refresh = () => setCustomRules(getCustomYaraRules());
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  // Auto-clear copy tooltip
  useEffect(() => {
    if (copiedItem) {
      const timer = setTimeout(() => setCopiedItem(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [copiedItem]);

  const handleViewEvent = (event: LogEntry, ruleTitle: string) => {
    const eventId = (event as any).EventID || event.eventId || "N/A";
    const computer =
      (event as any).Computer ||
      event.computer ||
      event.host ||
      event.source ||
      "unknown";
    setModalTitle(`${ruleTitle} — Event ${eventId} — ${computer}`);
    setSelectedEvent(event);
    setIsModalOpen(true);
  };

  const toggleExpand = (ruleId: string) => {
    setExpandedRule(expandedRule === ruleId ? null : ruleId);
  };

  // Reset visible count when matches change
  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_COUNT);
    setEventsVisiblePerRule({});
  }, [matches]);

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    if (scrollHeight - scrollTop - clientHeight < 200) {
      setVisibleCount((prev) => prev + LOAD_MORE_COUNT);
    }
  }, []);

  useEffect(() => {
    const canUseCachedResults =
      cachedMatches !== undefined &&
      strictness === "balanced" &&
      platformCustomRules.length === 0;

    // Skip scan only for baseline mode with no custom rules
    if (canUseCachedResults) {
      setMatches(cachedMatches);
      setScanStats(cachedStats ?? null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    if (events.length === 0) {
      setMatches([]);
      setScanStats(null);
      setIsLoading(false);
      onMatchesUpdateRef.current?.([], null);
      return;
    }

    setIsLoading(true);
    setMatches([]);
    setScanStats(null);
    setProgress({ processed: 0, total: 0, matchesFound: 0 });

    const performScan = async () => {
      const enabledCustomRules = customRules.filter((rule) =>
        isCustomRuleEnabled(rule.id),
      );
      const activeCustomRules = enabledCustomRules.filter(
        (rule) => rule.platform === "all" || rule.platform === platform,
      );

      const progressHandler = (
        processed: number,
        total: number,
        matchesFound: number,
      ) => {
        if (cancelled) return;
        const now = performance.now();
        if (now - lastProgressUpdateRef.current < 120 && processed < total)
          return;
        lastProgressUpdateRef.current = now;
        setProgress({ processed, total, matchesFound });
      };

      try {
        const bundledRules = await loadBundledYaraRules(platform);
        if (cancelled) return;

        const result = await runYaraScanInWorker(
          events,
          [...activeCustomRules, ...bundledRules],
          strictness,
          progressHandler,
          50,
        );

        if (cancelled) return;
        setMatches(result.matches);
        setScanStats(result.stats);
        setIsLoading(false);
        onMatchesUpdateRef.current?.(result.matches, result.stats);
      } catch {
        const result = await scanEventsWithYara(
          events,
          platform,
          progressHandler,
          50,
          {
            strictness,
            customRules: enabledCustomRules,
          },
        );

        if (cancelled) return;
        setMatches(result.matches);
        setScanStats(result.stats);
        setIsLoading(false);
        onMatchesUpdateRef.current?.(result.matches, result.stats);
      }
    };

    performScan().catch((error) => {
      console.error("[YARA] Detection failed:", error);
      if (cancelled) return;
      setMatches([]);
      setScanStats(null);
      setIsLoading(false);
      onMatchesUpdateRef.current?.([], null);
    });

    return () => {
      cancelled = true;
    };
  }, [
    events,
    platform,
    cachedMatches,
    cachedStats,
    strictness,
    customRules,
    // Use a content-aware key instead of .length so that replacing one rule
    // with another of the same array length still triggers a re-scan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    platformCustomRules.map((r) => r.id).join(","),
  ]);

  // Sort by total matched events descending
  const sortedMatches = useMemo(() => {
    return [...matches].sort((a, b) => {
      const totalA = a.matchedFiles.reduce(
        (s, f) => s + f.matchedEvents.length,
        0,
      );
      const totalB = b.matchedFiles.reduce(
        (s, f) => s + f.matchedEvents.length,
        0,
      );
      return totalB - totalA;
    });
  }, [matches]);

  // All unique source files across all events
  const allSourceFiles = useMemo(() => {
    const files = new Set<string>();
    for (const ev of events) {
      if (ev.sourceFile) files.add(ev.sourceFile);
    }
    return Array.from(files);
  }, [events]);

  // Filter matches by selected file
  const filteredMatches = useMemo(() => {
    if (!selectedFile) return sortedMatches;
    return sortedMatches
      .map((match) => ({
        ...match,
        matchedFiles: match.matchedFiles.filter(
          (f) => f.sourceFile === selectedFile,
        ),
      }))
      .filter((match) => match.matchedFiles.length > 0);
  }, [sortedMatches, selectedFile]);

  // Summary stats
  const totalMatchedEvents = useMemo(
    () =>
      matches.reduce(
        (sum, m) =>
          sum + m.matchedFiles.reduce((s, f) => s + f.matchedEvents.length, 0),
        0,
      ),
    [matches],
  );

  const totalMatchedFiles = useMemo(
    () => matches.reduce((sum, match) => sum + match.matchedFiles.length, 0),
    [matches],
  );

  // Window scroll for infinite loading
  useEffect(() => {
    if (sortedMatches.length === 0) return;
    lastScrollY.current = window.scrollY;
    hasScrolledOnce.current = false;

    const handleWindowScroll = () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY <= lastScrollY.current && hasScrolledOnce.current) {
        lastScrollY.current = currentScrollY;
        return;
      }
      hasScrolledOnce.current = true;
      lastScrollY.current = currentScrollY;

      const sentinel = sentinelRef.current;
      if (!sentinel) return;
      const rect = sentinel.getBoundingClientRect();
      if (rect.top < window.innerHeight + 150) {
        setVisibleCount((prev) =>
          Math.min(prev + LOAD_MORE_COUNT, sortedMatches.length),
        );
      }
    };

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
    return () => window.removeEventListener("scroll", throttledScroll);
  }, [sortedMatches.length]);

  return (
    <div className="sigma-detections">
      <div className="sigma-header">
        <h2>YARA Content Detections</h2>
        <p className="sigma-subtitle">
          Community YARA rules scanned across uploaded {platform} evidence
        </p>
      </div>

      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border-secondary)",
          borderRadius: 12,
          padding: "1rem",
          marginBottom: "1rem",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: "0.75rem",
            alignItems: "center",
            flexWrap: "wrap",
            marginBottom: "0.5rem",
          }}
        >
          <strong>False Positive Tuning</strong>
          <select
            value={strictness}
            onChange={(e) =>
              handleStrictnessChange(e.target.value as YaraStrictness)
            }
            style={{
              background: "var(--bg-hover)",
              border: "1px solid var(--border-primary)",
              color: "var(--text-primary)",
              borderRadius: 8,
              padding: "0.4rem 0.6rem",
            }}
          >
            <option value="strict">Strict (least false positives)</option>
            <option value="balanced">Balanced (recommended)</option>
            <option value="permissive">Permissive (max detection)</option>
          </select>
          <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
            Strictness is applied to bundled and custom rules.
          </span>
          {onOpenRuleLab && (
            <button className="action-button" onClick={onOpenRuleLab}>
              Manage Rules
            </button>
          )}
        </div>
        {platformCustomRules.length > 0 && (
          <div style={{ marginTop: "0.75rem" }}>
            <strong style={{ fontSize: "0.9rem" }}>
              Custom Rules for {platform}
            </strong>
            <span style={{ color: "var(--text-muted)", marginLeft: "0.45rem" }}>
              {platformCustomRules.length}
            </span>
          </div>
        )}
      </div>

      <div className="sigma-summary">
        {isLoading ? (
          <div className="loading-state">
            <div className="sigma-loading-spinner"></div>
            <h3>Scanning With YARA</h3>
            <p>
              Running {platform} YARA rules against{" "}
              {events.length.toLocaleString()} events...
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
                ` • ${progress.matchesFound} rule hits`}
            </div>
          </div>
        ) : matches.length === 0 ? (
          <div className="no-threats">
            <span className="success-icon">OK</span>
            <h3>No YARA Hits</h3>
            <p>No bundled YARA rule signatures matched the uploaded evidence</p>
          </div>
        ) : (
          <div className="threat-stats">
            <div className="stat-item">
              <span className="stat-number">{matches.length}</span>
              <span className="stat-label">Rules Triggered</span>
            </div>
            <div className="stat-item high">
              <span className="stat-icon">🟠</span>
              <span className="stat-number">{totalMatchedEvents}</span>
              <span className="stat-label">Event Matches</span>
            </div>
            <div className="stat-item medium">
              <span className="stat-icon">🟡</span>
              <span className="stat-number">{totalMatchedFiles}</span>
              <span className="stat-label">File Hits</span>
            </div>
          </div>
        )}
        {!isLoading && scanStats && (
          <p className="optimization-info">
            Scanned {scanStats.totalRules.toLocaleString()} rules across{" "}
            {scanStats.totalFiles.toLocaleString()} file group
            {scanStats.totalFiles === 1 ? "" : "s"} in{" "}
            {(scanStats.processingTimeMs / 1000).toFixed(1)}s
          </p>
        )}
        {!isLoading && matches.length > 0 && onOpenRawLogs && (
          <div style={{ marginTop: "0.75rem" }}>
            <button className="action-button" onClick={onOpenRawLogs}>
              Go To Raw Logs View
            </button>
          </div>
        )}
      </div>

      {/* File Breakdown Stats */}
      <FileBreakdownStats entries={events} sourceFiles={allSourceFiles} />

      {/* File Filter */}
      <FileFilter
        sourceFiles={allSourceFiles}
        selectedFile={selectedFile}
        onFileSelect={setSelectedFile}
      />

      {/* Detection Cards — Virtual Scrolling */}
      {!isLoading && filteredMatches.length > 0 && (
        <div
          className="sigma-matches"
          ref={containerRef}
          onScroll={handleScroll}
        >
          {filteredMatches.slice(0, visibleCount).map((match) => {
            const isExpanded = expandedRule === match.rule.id;

            // Flatten all matched events, optionally filtered by selected file
            const allEvents = match.matchedFiles.flatMap((f) =>
              f.matchedEvents.map((e) => ({
                ...e,
                sourceFile: f.sourceFile,
                fileMatchedLiterals: f.matchedLiterals,
              })),
            );
            const visibleEvents =
              eventsVisiblePerRule[match.rule.id] || EVENTS_PAGE_SIZE;

            return (
              <div
                key={match.rule.id}
                className="sigma-match high"
                style={{ borderLeftColor: "#f59e0b" }}
              >
                {/* Clickable header row */}
                <div
                  onClick={() => toggleExpand(match.rule.id)}
                  style={{ cursor: "pointer" }}
                >
                  <div className="match-header">
                    <div className="match-title">
                      <span className="severity-icon">🎯</span>
                      <div style={{ position: "relative" }}>
                        <h3
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(match.rule.title);
                            setCopiedItem(`title-${match.rule.id}`);
                          }}
                          style={{
                            cursor: "pointer",
                            userSelect: "none",
                            margin: 0,
                          }}
                          title="Click to copy title"
                        >
                          {match.rule.title}
                        </h3>
                        {copiedItem === `title-${match.rule.id}` && (
                          <span
                            style={{
                              position: "absolute",
                              top: 0,
                              left: "100%",
                              marginLeft: "0.75rem",
                              backgroundColor: "#10b981",
                              color: "white",
                              padding: "0.25rem 0.5rem",
                              borderRadius: "4px",
                              fontSize: "0.75rem",
                              fontWeight: 600,
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
                          <span style={{ fontWeight: 600, color: "#e5e7eb" }}>
                            Rule:{" "}
                          </span>
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(match.rule.name);
                              setCopiedItem(`id-${match.rule.id}`);
                            }}
                            style={{ cursor: "pointer", userSelect: "none" }}
                            title="Click to copy rule name"
                          >
                            {match.rule.name}
                          </span>
                          {copiedItem === `id-${match.rule.id}` && (
                            <span
                              style={{
                                position: "absolute",
                                top: 0,
                                left: "100%",
                                marginLeft: "0.5rem",
                                backgroundColor: "#10b981",
                                color: "white",
                                padding: "0.25rem 0.5rem",
                                borderRadius: "4px",
                                fontSize: "0.75rem",
                                fontWeight: 600,
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
                        {allEvents.length}{" "}
                        {allEvents.length === 1 ? "event" : "events"}
                      </span>
                      <button
                        className="expand-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleExpand(match.rule.id);
                        }}
                      >
                        {isExpanded ? "▼" : "▶"}
                      </button>
                    </div>
                  </div>

                  <p className="match-description">{match.rule.description}</p>
                  {match.rule.author && (
                    <div className="rule-author">
                      <span className="author-label">Rule Author:</span>{" "}
                      {match.rule.author}
                    </div>
                  )}

                  <div className="match-info">
                    <span
                      className="severity-badge"
                      style={{ backgroundColor: "#f59e0b" }}
                    >
                      YARA
                    </span>
                    <span
                      className="severity-badge"
                      style={{
                        backgroundColor: "#6366f1",
                        marginLeft: "0.4rem",
                      }}
                    >
                      {match.rule.platform.toUpperCase()}
                    </span>
                    {match.rule.tags && match.rule.tags.length > 0 && (
                      <span className="tags">
                        {match.rule.tags.slice(0, 5).map((tag) => (
                          <span key={tag} className="tag">
                            {tag}
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                </div>

                {/* Expandable Events Section */}
                {isExpanded && (
                  <div className="match-details">
                    <h4>Matched Events ({allEvents.length})</h4>

                    {/* Source breakdown */}
                    {match.matchedFiles.length > 1 && (
                      <div
                        style={{
                          marginBottom: "0.75rem",
                          fontSize: "0.85rem",
                          color: "var(--text-muted)",
                        }}
                      >
                        {match.matchedFiles.map((f) => (
                          <span
                            key={f.sourceFile}
                            style={{
                              marginRight: "1rem",
                              display: "inline-block",
                            }}
                          >
                            📁 {f.sourceFile} — {f.matchedEvents.length} hit
                            {f.matchedEvents.length === 1 ? "" : "s"}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="matched-events">
                      {allEvents.slice(0, visibleEvents).map((hit, idx) => {
                        const ev = hit.event as any;
                        const timestamp =
                          ev.timestamp || ev.TimeGenerated || null;
                        const computer =
                          ev.Computer ||
                          ev.computer ||
                          ev.host ||
                          ev.source ||
                          "N/A";
                        const eventId = ev.EventID || ev.eventId || "N/A";
                        const provider =
                          ev.Provider || ev.source || ev.sourceType || "N/A";

                        return (
                          <div key={idx} className="matched-event">
                            <div className="event-header-row">
                              <div className="event-time">
                                {timestamp
                                  ? timestamp instanceof Date
                                    ? timestamp.toLocaleString()
                                    : new Date(timestamp).toLocaleString()
                                  : hit.sourceFile}
                              </div>
                              <button
                                className="view-event-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleViewEvent(hit.event, match.rule.title);
                                }}
                                title="View complete event details"
                              >
                                📄 View Raw Event
                              </button>
                            </div>

                            <div className="event-info">
                              <span>Computer: {computer}</span>
                              <span>Event ID: {eventId}</span>
                              <span>Source: {provider}</span>
                            </div>

                            {/* Why matched panel */}
                            <div className="matched-fields">
                              <div className="why-matched-panel">
                                <div className="why-matched-header">
                                  <span className="why-matched-icon">🎯</span>
                                  <span className="why-matched-title">
                                    Matched YARA Signatures
                                  </span>
                                </div>
                                <div className="why-matched-body">
                                  <div
                                    className="why-matched-group why-group-matched"
                                    style={{ borderLeft: "2px solid #f59e0b" }}
                                  >
                                    <div className="why-matched-sel-label">
                                      <span className="why-sel-status">✅</span>
                                      <span
                                        className="why-sel-badge why-sel-select"
                                        style={{
                                          backgroundColor: "#f59e0b22",
                                          color: "#f59e0b",
                                        }}
                                      >
                                        strings
                                      </span>
                                      <span className="why-sel-summary">
                                        {hit.matchedLiterals.length} literal
                                        {hit.matchedLiterals.length === 1
                                          ? ""
                                          : "s"}{" "}
                                        found in event
                                      </span>
                                    </div>
                                    {hit.matchedLiterals.map((lit, li) => (
                                      <div
                                        key={li}
                                        className="why-matched-row why-row-hit"
                                      >
                                        <span className="why-row-indicator">
                                          ●
                                        </span>
                                        <span className="why-field-name">
                                          string
                                        </span>
                                        <span className="why-arrow">=</span>
                                        <span
                                          className="why-actual-value"
                                          title={lit}
                                        >
                                          {lit.length > 120
                                            ? lit.slice(0, 120) + "…"
                                            : lit}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>

                              {/* All rule literals for reference */}
                              <details className="raw-fields-details">
                                <summary className="raw-fields-summary">
                                  All Rule Literals (
                                  {match.rule.literals.length} defined)
                                  <span className="raw-fields-hint">
                                    Signatures from this YARA rule
                                  </span>
                                </summary>
                                {match.rule.literals.map((lit, li) => (
                                  <div key={li} className="field-match">
                                    <div className="field-match-header">
                                      <span className="field-name">
                                        string_{li + 1}
                                      </span>
                                    </div>
                                    <div
                                      className="field-value"
                                      style={{ wordBreak: "break-all" }}
                                    >
                                      {lit}
                                    </div>
                                  </div>
                                ))}
                              </details>
                            </div>
                          </div>
                        );
                      })}

                      {/* Load More / Show All */}
                      {allEvents.length > visibleEvents && (
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
                            Showing {visibleEvents} of {allEvents.length} events
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
                                setEventsVisiblePerRule((prev) => ({
                                  ...prev,
                                  [match.rule.id]:
                                    visibleEvents + EVENTS_PAGE_SIZE,
                                }));
                              }}
                            >
                              Load{" "}
                              {Math.min(
                                EVENTS_PAGE_SIZE,
                                allEvents.length - visibleEvents,
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
                                setEventsVisiblePerRule((prev) => ({
                                  ...prev,
                                  [match.rule.id]: Infinity,
                                }));
                              }}
                            >
                              Show All ({allEvents.length})
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Rule source reference */}
                    {match.rule.path && (
                      <div className="references">
                        <h5>Rule Source:</h5>
                        <span
                          style={{
                            fontFamily: "monospace",
                            fontSize: "0.85rem",
                            color: "var(--text-muted)",
                          }}
                        >
                          {match.rule.sourceName} › {match.rule.path}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Sentinel for infinite scroll */}
          {visibleCount < filteredMatches.length && (
            <>
              <div ref={sentinelRef} className="scroll-sentinel" />
              <div className="load-more-indicator">
                <span>
                  Showing {Math.min(visibleCount, filteredMatches.length)} of{" "}
                  {filteredMatches.length} rule hits
                </span>
                <button
                  className="load-more-btn"
                  onClick={() =>
                    setVisibleCount((prev) =>
                      Math.min(prev + LOAD_MORE_COUNT, filteredMatches.length),
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

      <EventDetailsModal
        event={selectedEvent}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={modalTitle}
      />
    </div>
  );
}
