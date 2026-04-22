import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { FixedSizeList as List } from "react-window";
import { ParsedData, LogEntry } from "../types";
import { SigmaRuleMatch } from "../lib/sigma/types";
import FileFilter from "./FileFilter";
import FileBreakdownStats from "./FileBreakdownStats";
import { getFileColor } from "../lib/fileColors";
import { EventDetailsModal } from "./EventDetailsModal";
import { EventCompare } from "./EventCompare";
import { ColumnConfigurator } from "./ColumnConfigurator";
import {
  getSavedSearchQueries,
  saveSearchQuery,
  deleteSearchQuery,
  SavedSearchQuery,
} from "../lib/searchPresets";
import {
  getSavedColumnConfig,
  saveColumnConfig,
  getColumnValue,
  ColumnDef,
} from "../lib/columnConfig";
import { searchInEntry, SearchMatch } from "../lib/searchPreview";
import "./Dashboard.css";
import "./RawLogsView.css";

const ROW_HEIGHT = 36; // Fixed height per log row for virtualization
const OVERSCAN = 15; // Extra rows rendered above/below viewport for smooth scrolling

interface RawLogsViewProps {
  data: ParsedData;
  filename: string;
  onBack: () => void;
  sigmaMatches?: Map<string, SigmaRuleMatch[]>;
  initialSearchQuery?: string;
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
  initialSearchQuery,
}: RawLogsViewProps) {
  const [filters, setFilters] = useState<ColumnFilter[]>([]);
  const [activeFilterColumn, setActiveFilterColumn] = useState<string | null>(
    null,
  );
  const [filterValue, setFilterValue] = useState("");
  const [filterOperator, setFilterOperator] =
    useState<FilterOperator>("contains");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery || "");
  const [searchRegex, setSearchRegex] = useState(false);
  const [searchRegexError, setSearchRegexError] = useState<string | null>(null);
  const [savedSearches, setSavedSearches] = useState<SavedSearchQuery[]>(() =>
    getSavedSearchQueries(),
  );
  const [showFileBreakdown, setShowFileBreakdown] = useState(false);
  const [columns, setColumns] = useState<ColumnDef[]>(() =>
    getSavedColumnConfig(),
  );
  const [showColumnConfigurator, setShowColumnConfigurator] = useState(false);
  const [searchMatches, setSearchMatches] = useState<
    Map<LogEntry, SearchMatch[]>
  >(new Map());

  const listRef = useRef<List>(null);

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

  // Filtered entries
  const filteredEntries = useMemo(() => {
    let entries = data.entries;

    // Filter by selected file first
    if (selectedFile) {
      entries = entries.filter((entry) => entry.sourceFile === selectedFile);
    }

    // Then apply column filters
    const activeFilters = filters.filter((f) => f.value);

    let baseEntries = entries;
    if (activeFilters.length > 0) {
      baseEntries = entries.filter((entry) => {
        for (const filter of activeFilters) {
          if (!matchesFilter(entry, filter)) {
            return false;
          }
        }
        return true;
      });
    }

    const q = searchQuery.trim();
    if (q.length < 2) return baseEntries;

    let regex: RegExp | null = null;
    if (searchRegex) {
      try {
        regex = new RegExp(q, "i");
      } catch {
        return [];
      }
    }

    const matchValue = (value: string): boolean => {
      if (!value) return false;
      if (regex) return regex.test(value);
      return value.toLowerCase().includes(q.toLowerCase());
    };

    return baseEntries.filter((entry) => {
      if (matchValue(entry.rawLine || "")) return true;
      if (matchValue(entry.message || "")) return true;
      if (matchValue(entry.source || "")) return true;
      if (matchValue(entry.computer || "")) return true;
      if (matchValue(String(entry.eventId || ""))) return true;
      if (entry.eventData) {
        return Object.values(entry.eventData).some((v) => matchValue(v || ""));
      }
      return false;
    });
  }, [data.entries, filters, selectedFile, searchQuery, searchRegex]);

  // Build a severity lookup: entry uniqueKey → highest severity from SIGMA matches
  const severityByEntry = useMemo(() => {
    const severityOrder: Record<string, number> = {
      critical: 4,
      high: 3,
      medium: 2,
      low: 1,
      informational: 0,
    };
    const lookup = new Map<string, string>();

    // Create unique keys for entries to handle filtered/recreated objects
    const entryKeyMap = new Map<LogEntry, string>();
    for (const entry of data.entries) {
      const key = `${entry.rawLine || ""}_${entry.timestamp}`;
      entryKeyMap.set(entry, key);
    }

    // Map matches to entry keys
    for (const matches of sigmaMatches.values()) {
      for (const m of matches) {
        if (!m.event) continue;
        const key =
          entryKeyMap.get(m.event) ||
          `${m.event.rawLine || ""}_${m.event.timestamp}`;
        const current = lookup.get(key);
        const level = m.rule.level || "informational";
        if (
          !current ||
          (severityOrder[level] ?? 0) > (severityOrder[current] ?? 0)
        ) {
          lookup.set(key, level);
        }
      }
    }

    // Create lookup by entry reference for current filtered entries
    const refLookup = new Map<LogEntry, string>();
    for (const entry of filteredEntries) {
      const key = `${entry.rawLine || ""}_${entry.timestamp}`;
      const severity = lookup.get(key);
      if (severity) {
        refLookup.set(entry, severity);
      }
    }

    return refLookup;
  }, [sigmaMatches, filteredEntries, data.entries]);

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

  // Calculate search matches with preview context
  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchMatches(new Map());
      return;
    }

    const matches = new Map<LogEntry, SearchMatch[]>();
    for (const entry of filteredEntries) {
      const entryMatches = searchInEntry(entry, searchQuery, searchRegex);
      if (entryMatches.length > 0) {
        matches.set(entry, entryMatches);
      }
    }
    setSearchMatches(matches);
  }, [searchQuery, searchRegex, filteredEntries]);

  // Reset scroll when filters change (in effect to avoid side-effect during render)
  const filterKey = `${selectedFile || ""}|${filters
    .map((f) => `${f.field}:${f.value}`)
    .join(",")}|${searchQuery}|${searchRegex}`;
  useEffect(() => {
    listRef.current?.scrollTo(0);
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

  const handleSaveSearch = () => {
    if (searchRegexError) {
      alert("Fix the regex pattern before saving.");
      return;
    }

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
  };

  const handleColumnsChange = (newColumns: ColumnDef[]) => {
    setColumns(newColumns);
    saveColumnConfig(newColumns);
  };

  const exportFiltered = (format: "csv" | "tsv") => {
    if (filteredEntries.length === 0) {
      alert("No rows to export.");
      return;
    }

    const delimiter = format === "csv" ? "," : "\t";
    const ext = format;
    const headers = [
      "timestamp",
      "sourceFile",
      "eventId",
      "computer",
      "source",
      "message",
      "rawLine",
    ];

    const quote = (v: string) => {
      const value = String(v || "").replace(/\r?\n/g, " ");
      if (format === "tsv") return value;
      return `"${value.replace(/"/g, '""')}"`;
    };

    const rows = [headers.join(delimiter)];
    for (const entry of filteredEntries) {
      rows.push(
        [
          entry.timestamp instanceof Date
            ? entry.timestamp.toISOString()
            : String(entry.timestamp || ""),
          entry.sourceFile || "",
          String(entry.eventId || ""),
          entry.computer || "",
          entry.source || "",
          entry.message || "",
          entry.rawLine || "",
        ]
          .map(quote)
          .join(delimiter),
      );
    }

    const blob = new Blob([rows.join("\n")], {
      type: format === "csv" ? "text/csv" : "text/tab-separated-values",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `raw_logs_filtered.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
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

          <div
            style={{
              display: "flex",
              gap: 8,
              marginBottom: 10,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search current logs view..."
              style={{
                minWidth: 260,
                flex: 1,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.14)",
                borderRadius: 6,
                padding: "6px 10px",
                color: "#e5e7eb",
                fontSize: "0.82rem",
              }}
            />
            <label style={{ fontSize: "0.78rem", color: "#9ca3af" }}>
              <input
                type="checkbox"
                checked={searchRegex}
                onChange={(e) => setSearchRegex(e.target.checked)}
                style={{ marginRight: 4 }}
              />
              Regex
            </label>
            <button
              className="timeline-button"
              onClick={handleSaveSearch}
              disabled={searchQuery.trim().length < 2 || !!searchRegexError}
            >
              Save Search
            </button>
            <button
              className="timeline-button"
              onClick={() => setShowColumnConfigurator(true)}
              title="Configure visible columns"
            >
              ⚙️ Columns
            </button>
            <button
              className="timeline-button"
              onClick={() => exportFiltered("csv")}
            >
              Export CSV
            </button>
            <button
              className="timeline-button"
              onClick={() => exportFiltered("tsv")}
            >
              Export TSV
            </button>
          </div>
          {searchRegexError && (
            <div
              style={{ color: "#f87171", fontSize: "0.75rem", marginBottom: 8 }}
            >
              {searchRegexError}
            </div>
          )}
          {savedSearches.length > 0 && (
            <div
              style={{
                display: "flex",
                gap: 6,
                flexWrap: "wrap",
                marginBottom: 10,
              }}
            >
              {savedSearches.slice(0, 10).map((preset) => (
                <span
                  key={preset.id}
                  style={{
                    border: "1px solid rgba(255,255,255,0.15)",
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
                      marginLeft: 6,
                      cursor: "pointer",
                    }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Search Result Preview */}
          {searchMatches.size > 0 && (
            <div
              style={{
                marginBottom: 12,
                maxHeight: 200,
                overflowY: "auto",
                background: "rgba(59,130,246,0.05)",
                border: "1px solid rgba(59,130,246,0.2)",
                borderRadius: 8,
                padding: "8px",
              }}
            >
              <div
                style={{
                  fontSize: "0.75rem",
                  color: "#9ca3af",
                  marginBottom: 6,
                }}
              >
                🔍 {searchMatches.size} entries with matches
              </div>
              {Array.from(searchMatches.entries())
                .slice(0, 5)
                .map(([_, matches], idx) => (
                  <div
                    key={`search-match-${idx}`}
                    style={{
                      fontSize: "0.75rem",
                      marginBottom: 6,
                      padding: 6,
                      background: "rgba(0,0,0,0.2)",
                      borderRadius: 4,
                      borderLeft: "2px solid #3b82f6",
                    }}
                  >
                    <div
                      style={{
                        color: "#60a5fa",
                        fontWeight: 600,
                        marginBottom: 2,
                      }}
                    >
                      {matches[0].field} • {matches.length} match
                      {matches.length > 1 ? "es" : ""}
                    </div>
                    <div
                      style={{
                        color: "#cbd5e1",
                        fontFamily: "monospace",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                      dangerouslySetInnerHTML={{ __html: matches[0].context }}
                    />
                  </div>
                ))}
              {searchMatches.size > 5 && (
                <div
                  style={{ fontSize: "0.75rem", color: "#9ca3af", padding: 4 }}
                >
                  +{searchMatches.size - 5} more...
                </div>
              )}
            </div>
          )}

          {/* File Breakdown Stats */}
          <div
            onClick={() => setShowFileBreakdown((v) => !v)}
            style={{
              cursor: "pointer",
              fontWeight: 600,
              margin: "1rem 0 0.25rem 0",
              display: "flex",
              alignItems: "center",
              userSelect: "none",
            }}
          >
            <span style={{ marginRight: 8 }}>
              {showFileBreakdown ? "▼" : "▶"}
            </span>
            Events by File
          </div>
          {showFileBreakdown && (
            <FileBreakdownStats
              entries={data.entries}
              sourceFiles={data.sourceFiles}
            />
          )}

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
            <div className="log-header">
              {columns
                .filter((c) => c.visible)
                .map((col) => (
                  <div
                    key={col.id}
                    className={`log-header-cell ${getFilterForField(col.id) ? "has-filter" : ""}`}
                    style={{
                      width: `${col.width}px`,
                      flexShrink: 0,
                    }}
                    onClick={() =>
                      setActiveFilterColumn(
                        activeFilterColumn === col.id ? null : col.id,
                      )
                    }
                  >
                    <span>{col.label}</span>
                    {col.filterable && (
                      <svg
                        className="filter-icon"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path d="M3 4h18v2H3V4zm3 7h12v2H6v-2zm3 7h6v2H9v-2z" />
                      </svg>
                    )}
                  </div>
                ))}
              <div
                className="log-header-cell action-header"
                style={{ minWidth: "80px" }}
              >
                <span>Actions</span>
              </div>
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
            <div className="log-entries">
              {filteredEntries.length === 0 ? (
                <div className="log-entry-more">
                  No entries match the current filters
                </div>
              ) : (
                <List
                  ref={listRef}
                  height={600}
                  itemCount={filteredEntries.length}
                  itemSize={ROW_HEIGHT}
                  width="100%"
                  overscanCount={OVERSCAN}
                  itemKey={(index) => {
                    const e = filteredEntries[index];
                    return `${index}-${String(e.eventId || "")}-${String(e.timestamp || "")}-${e.sourceFile || ""}`;
                  }}
                  itemData={{
                    entries: filteredEntries,
                    data,
                    columns,
                    sigmaMatches,
                    severityByEntry,
                    compareA,
                    compareB,
                    handleViewEvent,
                    handleToggleCompare,
                  }}
                >
                  {({
                    index,
                    style,
                    data: rowData,
                  }: ListChildComponentProps) => {
                    const entry = (rowData as any).entries[index] as LogEntry;
                    const severity = (rowData as any).severityByEntry.get(
                      entry,
                    );
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
                        style={{
                          ...style,
                          height: ROW_HEIGHT,
                          boxSizing: "border-box",
                        }}
                      >
                        <div
                          className={`log-entry ${rowData.data && rowData.data.format === "evtx" ? "evtx-entry" : ""}`}
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
                            rowData.data &&
                            rowData.data.sourceFiles &&
                            rowData.data.sourceFiles.length > 1
                              ? {
                                  borderLeft: `3px solid ${getFileColor(entry.sourceFile)}`,
                                }
                              : {}),
                          }}
                          title={
                            severity ? `SIGMA: ${severity} severity` : undefined
                          }
                        >
                          {rowData.columns
                            .filter((c: ColumnDef) => c.visible)
                            .map((col: ColumnDef) => {
                              const cellValue = getColumnValue(
                                entry,
                                col,
                                rowData.sigmaMatches,
                              );
                              const cellTypeCss = `log-cell type-${col.type}`;
                              return (
                                <div
                                  key={col.id}
                                  className={cellTypeCss}
                                  style={{
                                    width: `${col.width}px`,
                                    flexShrink: 0,
                                  }}
                                  title={
                                    typeof cellValue === "string" &&
                                    cellValue.length > 30
                                      ? cellValue
                                      : undefined
                                  }
                                >
                                  {cellValue}
                                </div>
                              );
                            })}
                          <div
                            className="log-cell"
                            style={{ minWidth: "80px" }}
                          >
                            <button
                              className="view-details-btn"
                              onClick={() => rowData.handleViewEvent(entry)}
                              title="View complete event details"
                            >
                              👁️
                            </button>
                            <button
                              className="view-details-btn"
                              onClick={() => rowData.handleToggleCompare(entry)}
                              title={
                                rowData.compareA === entry ||
                                rowData.compareB === entry
                                  ? "Remove from comparison"
                                  : "Add to comparison"
                              }
                              style={{
                                marginLeft: 2,
                                opacity:
                                  rowData.compareA === entry ||
                                  rowData.compareB === entry
                                    ? 1
                                    : 0.5,
                                color:
                                  rowData.compareA === entry ||
                                  rowData.compareB === entry
                                    ? "#a855f7"
                                    : undefined,
                              }}
                            >
                              ⚖️
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  }}
                </List>
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

      {/* Column Configurator Modal */}
      {showColumnConfigurator && (
        <ColumnConfigurator
          columns={columns}
          onColumnsChange={handleColumnsChange}
          onClose={() => setShowColumnConfigurator(false)}
        />
      )}

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
