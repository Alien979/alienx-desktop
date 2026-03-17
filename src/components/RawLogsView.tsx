import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { ParsedData, LogEntry } from "../types";
import { SigmaRuleMatch } from "../lib/sigma/types";
import FileFilter from "./FileFilter";
import FileBreakdownStats from "./FileBreakdownStats";
import { getFileColor } from "../lib/fileColors";
import { EventDetailsModal } from "./EventDetailsModal";
import { EventCompare } from "./EventCompare";
import "./Dashboard.css";

const ROW_HEIGHT = 36; // Fixed height per log row for virtual scrolling
const OVERSCAN = 15; // Extra rows rendered above/below viewport for smooth scrolling

interface RawLogsViewProps {
  data: ParsedData;
  filename: string;
  onBack: () => void;
  sigmaMatches?: Map<string, SigmaRuleMatch[]>;
}

type FilterOperator = "equals" | "contains" | "not_equals" | "not_contains";

interface ColumnFilter {
  field: string;
  operator: FilterOperator;
  value: string;
}

// Helper function to get field value
function getFieldValue(entry: LogEntry, field: string): string {
  switch (field) {
    case "timestamp": {
      const d = entry.timestamp;
      return d instanceof Date && !isNaN(d.getTime()) ? d.toISOString() : "";
    }
    case "computer":
      return entry.computer || "";
    case "eventId":
      return String(entry.eventId || "");
    case "source":
      return entry.source || "";
    case "message":
      return entry.message || "";
    case "ip":
      return entry.ip || "";
    case "statusCode":
      return String(entry.statusCode || "");
    case "method":
      return entry.method || "";
    case "path":
      return entry.path || "";
    case "sourceFile":
      return entry.sourceFile || "";
    default:
      return "";
  }
}

// Filter matching function
function matchesFilter(entry: LogEntry, filter: ColumnFilter): boolean {
  const fieldValue = getFieldValue(entry, filter.field).toLowerCase();
  const filterVal = filter.value.toLowerCase();

  switch (filter.operator) {
    case "equals":
      return fieldValue === filterVal;
    case "contains":
      return fieldValue.includes(filterVal);
    case "not_equals":
      return fieldValue !== filterVal;
    case "not_contains":
      return !fieldValue.includes(filterVal);
    default:
      return true;
  }
}

export default function RawLogsView({
  data,
  filename,
  onBack,
  sigmaMatches = new Map(),
}: RawLogsViewProps) {
  const [filters, setFilters] = useState<ColumnFilter[]>([]);
  const [activeFilterColumn, setActiveFilterColumn] = useState<string | null>(
    null,
  );
  const [filterValue, setFilterValue] = useState("");
  const [filterOperator, setFilterOperator] =
    useState<FilterOperator>("contains");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [scrollTop, setScrollTop] = useState(0);

  // Ref for the scrollable log container
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Modal state for viewing raw event
  const [selectedEvent, setSelectedEvent] = useState<LogEntry | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Side-by-side comparison state
  const [compareA, setCompareA] = useState<LogEntry | null>(null);
  const [compareB, setCompareB] = useState<LogEntry | null>(null);
  const [showCompare, setShowCompare] = useState(false);

  const handleToggleCompare = useCallback(
    (entry: LogEntry) => {
      if (compareA && compareA === entry) {
        setCompareA(null);
        return;
      }
      if (compareB && compareB === entry) {
        setCompareB(null);
        return;
      }
      if (!compareA) {
        setCompareA(entry);
        return;
      }
      if (!compareB) {
        setCompareB(entry);
        setShowCompare(true);
        return;
      }
      // Both slots full — replace B
      setCompareB(entry);
      setShowCompare(true);
    },
    [compareA, compareB],
  );

  // Build a severity lookup: entry rawLine hash → highest severity from SIGMA matches
  const severityByEntry = useMemo(() => {
    const severityOrder: Record<string, number> = {
      critical: 4,
      high: 3,
      medium: 2,
      low: 1,
      informational: 0,
    };
    const lookup = new Map<LogEntry, string>();
    for (const matches of sigmaMatches.values()) {
      for (const m of matches) {
        if (!m.event) continue;
        const current = lookup.get(m.event);
        const level = m.rule.level || "informational";
        if (
          !current ||
          (severityOrder[level] ?? 0) > (severityOrder[current] ?? 0)
        ) {
          lookup.set(m.event, level);
        }
      }
    }
    return lookup;
  }, [sigmaMatches]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  // Filtered entries
  const filteredEntries = useMemo(() => {
    let entries = data.entries;

    // Filter by selected file first
    if (selectedFile) {
      entries = entries.filter((entry) => entry.sourceFile === selectedFile);
    }

    // Then apply column filters
    const activeFilters = filters.filter((f) => f.value);

    if (activeFilters.length === 0) {
      return entries;
    }

    return entries.filter((entry) => {
      for (const filter of activeFilters) {
        if (!matchesFilter(entry, filter)) {
          return false;
        }
      }
      return true;
    });
  }, [data.entries, filters, selectedFile]);

  // Virtual scrolling: compute visible window
  const containerHeight = 600; // matches CSS max-height
  const totalHeight = filteredEntries.length * ROW_HEIGHT;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const endIndex = Math.min(
    filteredEntries.length,
    Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + OVERSCAN,
  );
  const visibleEntries = filteredEntries.slice(startIndex, endIndex);
  const offsetY = startIndex * ROW_HEIGHT;

  // Reset scroll when filters change (in effect to avoid side-effect during render)
  const filterKey = `${selectedFile || ""}|${filters.map((f) => `${f.field}:${f.value}`).join(",")}`;
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [filterKey]);

  // Add a filter
  const addFilter = (field: string) => {
    if (!filterValue.trim()) {
      setActiveFilterColumn(null);
      return;
    }

    const newFilters = filters.filter((f) => f.field !== field);
    newFilters.push({ field, operator: filterOperator, value: filterValue });
    setFilters(newFilters);
    setActiveFilterColumn(null);
    setFilterValue("");
    setFilterOperator("contains");
  };

  // Remove a filter
  const removeFilter = (field: string) => {
    setFilters(filters.filter((f) => f.field !== field));
  };

  // Get filter for a field
  const getFilterForField = (field: string) =>
    filters.find((f) => f.field === field);

  // Handle opening event details modal
  const handleViewEvent = (entry: LogEntry) => {
    setSelectedEvent(entry);
    setIsModalOpen(true);
  };

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
              : "Your Linux log companion"}
          </p>
          <p className="filename">
            {filename} • {data.parsedLines} / {data.totalLines} lines parsed •
            Format: {data.format}
          </p>
        </div>
        <div className="header-buttons">
          <button className="timeline-button" onClick={onBack}>
            ← Back to Selection
          </button>
        </div>
      </header>

      {/* Raw Logs Section */}
      <div className="raw-logs-section">
        <div className="chart-card log-viewer">
          <h3>
            Raw Logs — {filteredEntries.length.toLocaleString()} entries
            {filters.length > 0 || selectedFile
              ? ` (filtered from ${data.entries.length.toLocaleString()} total)`
              : ""}
          </h3>

          {/* File Breakdown Stats */}
          <FileBreakdownStats
            entries={data.entries}
            sourceFiles={data.sourceFiles}
          />

          {/* File Filter */}
          <FileFilter
            sourceFiles={data.sourceFiles}
            selectedFile={selectedFile}
            onFileSelect={setSelectedFile}
          />

          {/* Active Filters Display */}
          {filters.length > 0 && (
            <div className="active-filters">
              {filters.map((f) => (
                <span key={f.field} className="filter-tag">
                  {f.field} {f.operator.replace("_", " ")} "{f.value}"
                  <button onClick={() => removeFilter(f.field)}>×</button>
                </span>
              ))}
              <button
                className="clear-all-filters"
                onClick={() => setFilters([])}
              >
                Clear All
              </button>
            </div>
          )}

          <div className="log-table-container">
            {/* Column Headers */}
            <div
              className={`log-header ${data.format === "evtx" ? "evtx-header" : ""}`}
            >
              {data.format === "evtx" ? (
                <>
                  <div
                    className={`header-cell ${getFilterForField("timestamp") ? "has-filter" : ""}`}
                    onClick={() =>
                      setActiveFilterColumn(
                        activeFilterColumn === "timestamp" ? null : "timestamp",
                      )
                    }
                  >
                    <span>Timestamp</span>
                    <svg
                      className="filter-icon"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M3 4h18v2H3V4zm3 7h12v2H6v-2zm3 7h6v2H9v-2z" />
                    </svg>
                  </div>
                  <div
                    className={`header-cell ${getFilterForField("computer") ? "has-filter" : ""}`}
                    onClick={() =>
                      setActiveFilterColumn(
                        activeFilterColumn === "computer" ? null : "computer",
                      )
                    }
                  >
                    <span>Computer</span>
                    <svg
                      className="filter-icon"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M3 4h18v2H3V4zm3 7h12v2H6v-2zm3 7h6v2H9v-2z" />
                    </svg>
                  </div>
                  <div
                    className={`header-cell ${getFilterForField("eventId") ? "has-filter" : ""}`}
                    onClick={() =>
                      setActiveFilterColumn(
                        activeFilterColumn === "eventId" ? null : "eventId",
                      )
                    }
                  >
                    <span>Event ID</span>
                    <svg
                      className="filter-icon"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M3 4h18v2H3V4zm3 7h12v2H6v-2zm3 7h6v2H9v-2z" />
                    </svg>
                  </div>
                  <div
                    className={`header-cell ${getFilterForField("source") ? "has-filter" : ""}`}
                    onClick={() =>
                      setActiveFilterColumn(
                        activeFilterColumn === "source" ? null : "source",
                      )
                    }
                  >
                    <span>Source</span>
                    <svg
                      className="filter-icon"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M3 4h18v2H3V4zm3 7h12v2H6v-2zm3 7h6v2H9v-2z" />
                    </svg>
                  </div>
                  <div
                    className={`header-cell ${getFilterForField("message") ? "has-filter" : ""}`}
                    onClick={() =>
                      setActiveFilterColumn(
                        activeFilterColumn === "message" ? null : "message",
                      )
                    }
                  >
                    <span>Message</span>
                    <svg
                      className="filter-icon"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M3 4h18v2H3V4zm3 7h12v2H6v-2zm3 7h6v2H9v-2z" />
                    </svg>
                  </div>
                  <div className="header-cell action-header">
                    <span>Actions</span>
                  </div>
                </>
              ) : (
                <>
                  <div
                    className={`header-cell ${getFilterForField("timestamp") ? "has-filter" : ""}`}
                    onClick={() =>
                      setActiveFilterColumn(
                        activeFilterColumn === "timestamp" ? null : "timestamp",
                      )
                    }
                  >
                    <span>Timestamp</span>
                    <svg
                      className="filter-icon"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M3 4h18v2H3V4zm3 7h12v2H6v-2zm3 7h6v2H9v-2z" />
                    </svg>
                  </div>
                  <div
                    className={`header-cell ${getFilterForField("ip") ? "has-filter" : ""}`}
                    onClick={() =>
                      setActiveFilterColumn(
                        activeFilterColumn === "ip" ? null : "ip",
                      )
                    }
                  >
                    <span>IP Address</span>
                    <svg
                      className="filter-icon"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M3 4h18v2H3V4zm3 7h12v2H6v-2zm3 7h6v2H9v-2z" />
                    </svg>
                  </div>
                  <div
                    className={`header-cell ${getFilterForField("statusCode") ? "has-filter" : ""}`}
                    onClick={() =>
                      setActiveFilterColumn(
                        activeFilterColumn === "statusCode"
                          ? null
                          : "statusCode",
                      )
                    }
                  >
                    <span>Status</span>
                    <svg
                      className="filter-icon"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M3 4h18v2H3V4zm3 7h12v2H6v-2zm3 7h6v2H9v-2z" />
                    </svg>
                  </div>
                  <div
                    className={`header-cell ${getFilterForField("method") ? "has-filter" : ""}`}
                    onClick={() =>
                      setActiveFilterColumn(
                        activeFilterColumn === "method" ? null : "method",
                      )
                    }
                  >
                    <span>Method</span>
                    <svg
                      className="filter-icon"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M3 4h18v2H3V4zm3 7h12v2H6v-2zm3 7h6v2H9v-2z" />
                    </svg>
                  </div>
                  <div
                    className={`header-cell ${getFilterForField("path") ? "has-filter" : ""}`}
                    onClick={() =>
                      setActiveFilterColumn(
                        activeFilterColumn === "path" ? null : "path",
                      )
                    }
                  >
                    <span>Path</span>
                    <svg
                      className="filter-icon"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M3 4h18v2H3V4zm3 7h12v2H6v-2zm3 7h6v2H9v-2z" />
                    </svg>
                  </div>
                  <div className="header-cell action-header">
                    <span>Actions</span>
                  </div>
                </>
              )}
            </div>

            {/* Filter Popup */}
            {activeFilterColumn && (
              <div className="filter-popup">
                <div className="filter-popup-header">
                  Filter: {activeFilterColumn}
                  <button
                    className="filter-close"
                    onClick={() => setActiveFilterColumn(null)}
                  >
                    ×
                  </button>
                </div>
                <select
                  value={filterOperator}
                  onChange={(e) =>
                    setFilterOperator(e.target.value as FilterOperator)
                  }
                >
                  <option value="contains">Contains</option>
                  <option value="equals">Equals</option>
                  <option value="not_contains">Does not contain</option>
                  <option value="not_equals">Does not equal</option>
                </select>
                <input
                  type="text"
                  placeholder="Filter value..."
                  value={filterValue}
                  onChange={(e) => setFilterValue(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Enter" && addFilter(activeFilterColumn)
                  }
                  autoFocus
                />
                <div className="filter-actions">
                  <button onClick={() => addFilter(activeFilterColumn)}>
                    Apply
                  </button>
                  {getFilterForField(activeFilterColumn) && (
                    <button
                      className="remove-filter"
                      onClick={() => {
                        removeFilter(activeFilterColumn);
                        setActiveFilterColumn(null);
                      }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Log Entries - Virtual Scrolling */}
            <div
              className="log-entries"
              ref={scrollContainerRef}
              onScroll={handleScroll}
            >
              {filteredEntries.length === 0 ? (
                <div className="log-entry-more">
                  No entries match the current filters
                </div>
              ) : (
                <div style={{ height: totalHeight, position: "relative" }}>
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      transform: `translateY(${offsetY}px)`,
                    }}
                  >
                    {visibleEntries.map((entry, idx) => {
                      const severity = severityByEntry.get(entry);
                      const severityColors: Record<string, string> = {
                        critical: "rgba(239,68,68,0.12)",
                        high: "rgba(249,115,22,0.10)",
                        medium: "rgba(234,179,8,0.08)",
                        low: "rgba(34,197,94,0.06)",
                      };
                      const severityBorder: Record<string, string> = {
                        critical: "#ef4444",
                        high: "#f97316",
                        medium: "#eab308",
                        low: "#22c55e",
                      };
                      return (
                        <div
                          key={startIndex + idx}
                          className={`log-entry ${data.format === "evtx" ? "evtx-entry" : ""}`}
                          style={{
                            height: ROW_HEIGHT,
                            boxSizing: "border-box",
                            ...(severity
                              ? {
                                  background:
                                    severityColors[severity] || undefined,
                                  borderRight: `3px solid ${severityBorder[severity] || "transparent"}`,
                                }
                              : {}),
                            ...(entry.sourceFile &&
                            data.sourceFiles &&
                            data.sourceFiles.length > 1
                              ? {
                                  borderLeft: `3px solid ${getFileColor(entry.sourceFile)}`,
                                }
                              : {}),
                          }}
                          title={
                            severity ? `SIGMA: ${severity} severity` : undefined
                          }
                        >
                          <span className="log-time">
                            {entry.timestamp instanceof Date &&
                            !isNaN(entry.timestamp.getTime())
                              ? entry.timestamp.toLocaleString()
                              : "—"}
                          </span>
                          {data.format === "evtx" ? (
                            <>
                              <span className="log-computer">
                                {entry.computer || "N/A"}
                              </span>
                              <span className="log-event-id">
                                {entry.eventId}
                              </span>
                              <span className="log-source">{entry.source}</span>
                              <span
                                className="log-message"
                                title={entry.message}
                              >
                                {entry.message || "No message"}
                              </span>
                              <span className="log-action">
                                <button
                                  className="view-details-btn"
                                  onClick={() => handleViewEvent(entry)}
                                  title="View complete event details"
                                >
                                  👁️
                                </button>
                                <button
                                  className="view-details-btn"
                                  onClick={() => handleToggleCompare(entry)}
                                  title={
                                    compareA === entry || compareB === entry
                                      ? "Remove from comparison"
                                      : "Add to comparison"
                                  }
                                  style={{
                                    marginLeft: 2,
                                    opacity:
                                      compareA === entry || compareB === entry
                                        ? 1
                                        : 0.5,
                                    color:
                                      compareA === entry || compareB === entry
                                        ? "#a855f7"
                                        : undefined,
                                  }}
                                >
                                  ⚖️
                                </button>
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="log-ip">{entry.ip}</span>
                              <span
                                className={`log-status status-${Math.floor(entry.statusCode / 100)}xx`}
                              >
                                {entry.statusCode}
                              </span>
                              <span className="log-method">{entry.method}</span>
                              <span className="log-path">{entry.path}</span>
                              <span className="log-action">
                                <button
                                  className="view-details-btn"
                                  onClick={() => handleViewEvent(entry)}
                                  title="View complete event details"
                                >
                                  👁️
                                </button>
                              </span>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Event Details Modal */}
      <EventDetailsModal
        event={selectedEvent}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />

      {/* Comparison floating bar */}
      {(compareA || compareB) && !showCompare && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--bg-secondary, #1a1a2e)",
            border: "1px solid rgba(168,85,247,0.3)",
            borderRadius: 10,
            padding: "8px 16px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
            zIndex: 1000,
            fontSize: "0.82rem",
          }}
        >
          <span style={{ color: "#a855f7" }}>⚖️</span>
          <span style={{ color: "#ccc" }}>
            {compareA ? "1 selected" : "0 selected"}
            {compareB ? " + 1" : ""} —{" "}
            {compareA && compareB
              ? "Ready"
              : "Select 2 events with ⚖️ to compare"}
          </span>
          {compareA && compareB && (
            <button
              onClick={() => setShowCompare(true)}
              style={{
                background: "rgba(168,85,247,0.15)",
                border: "1px solid rgba(168,85,247,0.4)",
                borderRadius: 6,
                padding: "4px 12px",
                cursor: "pointer",
                color: "#a855f7",
                fontSize: "0.8rem",
              }}
            >
              Compare
            </button>
          )}
          <button
            onClick={() => {
              setCompareA(null);
              setCompareB(null);
            }}
            style={{
              background: "none",
              border: "none",
              color: "#888",
              cursor: "pointer",
              fontSize: "0.9rem",
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Side-by-side comparison modal */}
      <EventCompare
        eventA={compareA}
        eventB={compareB}
        isOpen={showCompare}
        onClose={() => setShowCompare(false)}
      />
    </div>
  );
}
