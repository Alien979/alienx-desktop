import { useMemo, useState } from "react";
import { ParsedData, LogEntry } from "../types";
import { EventDetailsModal } from "./EventDetailsModal";
import "./Dashboard.css";

interface RarityAnalysisProps {
  data: ParsedData;
  onBack: () => void;
}

interface RarityItem {
  value: string;
  count: number;
  sample: LogEntry;
}

type RarityField = "eventId" | "processName" | "commandLine";

function getRarityValue(entry: LogEntry, field: RarityField): string {
  switch (field) {
    case "eventId":
      return entry.eventId ? String(entry.eventId).trim() : "";
    case "processName":
      return (entry.processName || entry.eventData?.Image || "").trim();
    case "commandLine":
      return (
        entry.processCmd ||
        entry.eventData?.CommandLine ||
        entry.eventData?.ProcessCommandLine ||
        ""
      ).trim();
    default:
      return "";
  }
}

function countField(
  entries: LogEntry[],
  getValue: (entry: LogEntry) => string,
): RarityItem[] {
  const map = new Map<string, { count: number; sample: LogEntry }>();
  for (const entry of entries) {
    const value = getValue(entry).trim();
    if (!value) continue;
    const current = map.get(value);
    if (current) current.count += 1;
    else map.set(value, { count: 1, sample: entry });
  }

  return Array.from(map.entries())
    .map(([value, item]) => ({ value, count: item.count, sample: item.sample }))
    .sort((a, b) => a.count - b.count || a.value.localeCompare(b.value))
    .slice(0, 50);
}

export default function RarityAnalysis({ data, onBack }: RarityAnalysisProps) {
  const [raritySelection, setRaritySelection] = useState<{
    field: RarityField;
    value: string;
  } | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsEvent, setDetailsEvent] = useState<LogEntry | null>(null);

  const rareEventIds = useMemo(
    () =>
      countField(data.entries, (entry) =>
        entry.eventId ? String(entry.eventId) : "",
      ),
    [data.entries],
  );

  const rareProcesses = useMemo(
    () =>
      countField(
        data.entries,
        (entry) => entry.processName || entry.eventData?.Image || "",
      ),
    [data.entries],
  );

  const rareCommands = useMemo(
    () =>
      countField(
        data.entries,
        (entry) =>
          entry.processCmd ||
          entry.eventData?.CommandLine ||
          entry.eventData?.ProcessCommandLine ||
          "",
      ),
    [data.entries],
  );

  const selectedEvents = useMemo(() => {
    if (!raritySelection) return [];
    const { field, value } = raritySelection;
    if (!value) return [];
    // Exact string matching on the extracted value definition.
    return data.entries.filter((e) => getRarityValue(e, field) === value);
  }, [data.entries, raritySelection]);

  const renderList = (
    title: string,
    items: RarityItem[],
    field: RarityField,
  ) => (
    <div className="chart-card">
      <h3>{title}</h3>
      {items.length === 0 ? (
        <p style={{ color: "#888" }}>No values detected in this dataset.</p>
      ) : (
        <div style={{ maxHeight: 420, overflowY: "auto", fontSize: "0.84rem" }}>
          {items.map((item, idx) => (
            <button
              key={`${title}-${idx}-${item.value}`}
              type="button"
              onClick={() => setRaritySelection({ field, value: item.value })}
              style={{
                width: "100%",
                textAlign: "left",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                padding: "0",
              }}
              title={`Show ${item.count} matching event(s)`}
            >
              <div
                style={{
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                  padding: "8px 0",
                  display: "grid",
                  gridTemplateColumns: "56px 1fr",
                  gap: 10,
                }}
              >
                <span
                  style={{
                    color: item.count <= 2 ? "#f59e0b" : "#93c5fd",
                    fontWeight: 700,
                    fontFamily: "monospace",
                  }}
                >
                  x{item.count}
                </span>
                <span
                  style={{
                    color: "#d4d4d8",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {item.value}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div>
          <h1>Rarity Analysis</h1>
          <p className="tagline">
            Least frequent values first - useful for anomaly-first
            investigations
          </p>
        </div>
        <button className="timeline-button" onClick={onBack}>
          ← Back to Selection
        </button>
      </header>

      <div
        style={{
          marginBottom: 14,
          padding: "12px 14px",
          borderRadius: 8,
          background: "rgba(251,191,36,0.08)",
          border: "1px solid rgba(251,191,36,0.2)",
          color: "#f4f4f5",
          fontSize: "0.84rem",
        }}
      >
        Values with very low frequency often expose attacker-specific behavior
        that signature rules miss.
      </div>

      <div className="process-grid">
        {renderList("Rare Event IDs", rareEventIds, "eventId")}
        {renderList("Rare Process Names", rareProcesses, "processName")}
        {renderList("Rare Command Lines", rareCommands, "commandLine")}
      </div>

      {/* Rarity click-through modal */}
      {raritySelection && (
        <div
          className="rarity-modal-overlay"
          onClick={() => setRaritySelection(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            zIndex: 2000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            className="rarity-modal"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(980px, 100%)",
              maxHeight: "80vh",
              overflow: "hidden",
              borderRadius: 12,
              background: "var(--bg-secondary, #1a1a2e)",
              border: "1px solid rgba(168,85,247,0.35)",
              boxShadow: "0 10px 40px rgba(0,0,0,0.5)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                padding: "12px 16px",
                borderBottom: "1px solid rgba(255,255,255,0.08)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div>
                <div style={{ fontWeight: 800, fontSize: "1rem" }}>
                  Investigate:{" "}
                  <span style={{ color: "#a78bfa" }}>
                    {raritySelection.field}
                  </span>
                </div>
                <div style={{ color: "#d4d4d8", fontSize: "0.9rem" }}>
                  Value:{" "}
                  <span style={{ fontFamily: "monospace" }}>
                    {raritySelection.value}
                  </span>{" "}
                  • {selectedEvents.length} matching event(s)
                </div>
              </div>
              <button
                className="timeline-button"
                onClick={() => setRaritySelection(null)}
              >
                Close
              </button>
            </div>

            <div
              style={{
                padding: 16,
                overflowY: "auto",
              }}
            >
              {selectedEvents.length === 0 ? (
                <p style={{ color: "#aaa" }}>No matching events found.</p>
              ) : (
                selectedEvents.slice(0, 200).map((event) => (
                  <div
                    key={`${String(event.eventId || "na")}-${String(event.timestamp)}`}
                    style={{
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 10,
                      padding: 12,
                      marginBottom: 10,
                      background: "rgba(0,0,0,0.12)",
                      cursor: "pointer",
                    }}
                    onClick={() => {
                      setDetailsEvent(event);
                      setDetailsOpen(true);
                      setRaritySelection(null);
                    }}
                    title="Click to view full event details"
                  >
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <span style={{ color: "#93c5fd", fontWeight: 700 }}>
                        {event.timestamp instanceof Date &&
                        !isNaN(event.timestamp.getTime())
                          ? event.timestamp.toLocaleString()
                          : "Unknown time"}
                      </span>
                      {event.computer && (
                        <span style={{ color: "#d4d4d8" }}>
                          Computer:{" "}
                          <span style={{ fontFamily: "monospace" }}>
                            {event.computer}
                          </span>
                        </span>
                      )}
                      {event.eventId && (
                        <span style={{ color: "#fbbf24" }}>
                          EventID: {event.eventId}
                        </span>
                      )}
                    </div>
                    <div style={{ marginTop: 8, color: "#d4d4d8" }}>
                      {raritySelection.field === "commandLine" ? (
                        <span style={{ fontFamily: "monospace" }}>
                          {getRarityValue(event, "commandLine").slice(0, 220) ||
                            "(empty)"}
                        </span>
                      ) : raritySelection.field === "processName" ? (
                        <span style={{ fontFamily: "monospace" }}>
                          {getRarityValue(event, "processName") || "(empty)"}
                        </span>
                      ) : (
                        <span style={{ fontFamily: "monospace" }}>
                          {getRarityValue(event, "eventId") || "(empty)"}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}

              {selectedEvents.length > 200 && (
                <p style={{ color: "#aaa", marginTop: 10 }}>
                  Showing first 200 event(s). Remaining matches not listed.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <EventDetailsModal
        event={detailsEvent as any}
        isOpen={detailsOpen}
        onClose={() => {
          setDetailsOpen(false);
          setDetailsEvent(null);
        }}
        title={
          detailsEvent ? `Rarity match - Event ${detailsEvent.eventId || "?"}` : undefined
        }
      />
    </div>
  );
}
