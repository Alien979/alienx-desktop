import { useMemo } from "react";
import { ParsedData, LogEntry } from "../types";
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

  const renderList = (title: string, items: RarityItem[]) => (
    <div className="chart-card">
      <h3>{title}</h3>
      {items.length === 0 ? (
        <p style={{ color: "#888" }}>No values detected in this dataset.</p>
      ) : (
        <div style={{ maxHeight: 420, overflowY: "auto", fontSize: "0.84rem" }}>
          {items.map((item, idx) => (
            <div
              key={`${title}-${idx}-${item.value}`}
              style={{
                borderBottom: "1px solid rgba(255,255,255,0.06)",
                padding: "8px 0",
                display: "grid",
                gridTemplateColumns: "56px 1fr",
                gap: 10,
              }}
              title={item.value}
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
        {renderList("Rare Event IDs", rareEventIds)}
        {renderList("Rare Process Names", rareProcesses)}
        {renderList("Rare Command Lines", rareCommands)}
      </div>
    </div>
  );
}
