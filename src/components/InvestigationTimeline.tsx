import { useMemo, useState } from "react";
import type { LogEntry } from "../types";
import type { SigmaRuleMatch } from "../lib/sigma/types";
import { getBookmarks } from "../lib/eventBookmarks";
import { EventDetailsModal } from "./EventDetailsModal";

interface InvestigationTimelineProps {
  entries: LogEntry[];
  sigmaMatches: Map<string, SigmaRuleMatch[]>;
  onBack: () => void;
}

type TimelineItemKind = "sigma" | "bookmark" | "process" | "network" | "auth";

interface TimelineItem {
  timestamp: Date;
  kind: TimelineItemKind;
  label: string;
  detail: string;
  severity?: string;
  entry: LogEntry;
}

const KIND_META: Record<TimelineItemKind, { icon: string; color: string }> = {
  sigma: { icon: "🛡️", color: "#ef4444" },
  bookmark: { icon: "🔖", color: "#a855f7" },
  process: { icon: "⚙️", color: "#3b82f6" },
  network: { icon: "🌐", color: "#06b6d4" },
  auth: { icon: "🔑", color: "#eab308" },
};

const SEVERITY_COLOR: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#22c55e",
};

export default function InvestigationTimeline({
  entries,
  sigmaMatches,
  onBack,
}: InvestigationTimelineProps) {
  const [kindFilter, setKindFilter] = useState<Set<TimelineItemKind>>(
    new Set(["sigma", "bookmark", "process", "network", "auth"]),
  );
  const [selectedEvent, setSelectedEvent] = useState<LogEntry | null>(null);

  const items = useMemo(() => {
    const result: TimelineItem[] = [];

    // 1. SIGMA detections
    for (const matches of sigmaMatches.values()) {
      for (const m of matches) {
        if (!m.event) continue;
        result.push({
          timestamp: m.timestamp,
          kind: "sigma",
          label: m.rule.title,
          detail: m.rule.description || "",
          severity: m.rule.level || "medium",
          entry: m.event as LogEntry,
        });
      }
    }

    // 2. Bookmarks
    const bookmarks = getBookmarks();
    for (const bm of bookmarks) {
      // Find matching entry — bookmark.timestamp is String(date) which may be
      // toString() or toISOString() format, so compare both ways.
      const matched = entries.find(
        (e) =>
          String(e.eventId) === bm.eventId &&
          e.timestamp instanceof Date &&
          (String(e.timestamp) === bm.timestamp ||
            e.timestamp.toISOString() === bm.timestamp),
      );
      if (matched) {
        result.push({
          timestamp: matched.timestamp,
          kind: "bookmark",
          label: `[${bm.tag}] ${bm.note || "Bookmarked event"}`,
          detail: `Event ID ${bm.eventId}`,
          entry: matched,
        });
      }
    }

    // 3. Key process events (EID 1 = Sysmon process creation, 4688 = Windows)
    for (const e of entries) {
      if (e.eventId === 1 || e.eventId === 4688) {
        const img = e.eventData?.Image || e.eventData?.NewProcessName || "";
        const cmd = e.eventData?.CommandLine || "";
        result.push({
          timestamp: e.timestamp,
          kind: "process",
          label: img.split("\\").pop() || "Process",
          detail: cmd.slice(0, 200),
          entry: e,
        });
      }
    }

    // 4. Network connections (EID 3)
    for (const e of entries) {
      if (e.eventId === 3) {
        const dest = e.eventData?.DestinationIp || "";
        const port = e.eventData?.DestinationPort || "";
        const img = e.eventData?.Image || "";
        result.push({
          timestamp: e.timestamp,
          kind: "network",
          label: `${img.split("\\").pop() || "?"} → ${dest}:${port}`,
          detail: `Source: ${e.eventData?.SourceIp || "?"}:${e.eventData?.SourcePort || "?"}`,
          entry: e,
        });
      }
    }

    // 5. Auth events (EID 4624/4625/4634 = logon/logoff/failed)
    for (const e of entries) {
      if (e.eventId === 4624 || e.eventId === 4625 || e.eventId === 4634) {
        const user =
          e.eventData?.TargetUserName || e.eventData?.SubjectUserName || "";
        const logonType = e.eventData?.LogonType || "";
        const label =
          e.eventId === 4625
            ? `Failed logon: ${user}`
            : e.eventId === 4634
              ? `Logoff: ${user}`
              : `Logon: ${user} (type ${logonType})`;
        result.push({
          timestamp: e.timestamp,
          kind: "auth",
          label,
          detail: e.message || "",
          entry: e,
        });
      }
    }

    result.sort((a, b) => {
      const tA = a.timestamp instanceof Date ? a.timestamp.getTime() : 0;
      const tB = b.timestamp instanceof Date ? b.timestamp.getTime() : 0;
      return (isNaN(tA) ? 0 : tA) - (isNaN(tB) ? 0 : tB);
    });
    return result;
  }, [entries, sigmaMatches]);

  const filtered = useMemo(
    () => items.filter((i) => kindFilter.has(i.kind)),
    [items, kindFilter],
  );

  const toggleKind = (k: TimelineItemKind) => {
    setKindFilter((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  };

  const kindCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const i of items) c[i.kind] = (c[i.kind] || 0) + 1;
    return c;
  }, [items]);

  return (
    <div style={{ padding: "1.5rem", maxWidth: 960, margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: "1.25rem",
        }}
      >
        <button
          onClick={onBack}
          style={{
            background: "none",
            border: "none",
            color: "#00c8ff",
            cursor: "pointer",
            fontSize: "0.9rem",
            padding: "4px 8px",
          }}
        >
          ← Back
        </button>
        <h2 style={{ margin: 0, fontSize: "1.3rem", color: "#e4e4e7" }}>
          🕵️ Investigation Timeline
        </h2>
        <span style={{ fontSize: "0.8rem", color: "#888" }}>
          {filtered.length} / {items.length} events
        </span>
      </div>

      {/* Filter toggles */}
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: "1rem",
          flexWrap: "wrap",
        }}
      >
        {(Object.keys(KIND_META) as TimelineItemKind[]).map((k) => {
          const active = kindFilter.has(k);
          const { icon, color } = KIND_META[k];
          return (
            <button
              key={k}
              onClick={() => toggleKind(k)}
              style={{
                background: active ? `${color}22` : "rgba(255,255,255,0.03)",
                border: `1px solid ${active ? color : "rgba(255,255,255,0.1)"}`,
                borderRadius: 6,
                padding: "5px 12px",
                cursor: "pointer",
                color: active ? color : "#666",
                fontSize: "0.8rem",
                fontFamily: "inherit",
                opacity: active ? 1 : 0.6,
              }}
            >
              {icon} {k} ({kindCounts[k] || 0})
            </button>
          );
        })}
      </div>

      {/* Timeline list */}
      <div
        style={{
          borderLeft: "2px solid rgba(255,255,255,0.08)",
          paddingLeft: 20,
          position: "relative",
        }}
      >
        {filtered.length === 0 && (
          <div
            style={{ color: "#666", padding: "2rem 0", textAlign: "center" }}
          >
            No events match the current filters. Run SIGMA detection or bookmark
            events to populate this timeline.
          </div>
        )}
        {filtered.slice(0, 500).map((item, i) => {
          const { icon, color } = KIND_META[item.kind];
          return (
            <div
              key={i}
              onClick={() => setSelectedEvent(item.entry)}
              style={{
                position: "relative",
                marginBottom: 2,
                padding: "8px 12px 8px 16px",
                borderRadius: 6,
                cursor: "pointer",
                background: "rgba(255,255,255,0.02)",
                borderLeft: `3px solid ${item.severity ? SEVERITY_COLOR[item.severity] || color : color}`,
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "rgba(255,255,255,0.06)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "rgba(255,255,255,0.02)")
              }
            >
              {/* Dot on the timeline line */}
              <div
                style={{
                  position: "absolute",
                  left: -28,
                  top: 12,
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: color,
                  border: "2px solid #111",
                }}
              />
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 2,
                }}
              >
                <span style={{ fontSize: "0.85rem" }}>{icon}</span>
                <span
                  style={{
                    fontSize: "0.7rem",
                    color: "#888",
                    fontFamily: "monospace",
                    minWidth: 180,
                  }}
                >
                  {item.timestamp instanceof Date
                    ? item.timestamp.toLocaleString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                        hour12: false,
                      })
                    : String(item.timestamp)}
                </span>
                {item.severity && (
                  <span
                    style={{
                      fontSize: "0.65rem",
                      textTransform: "uppercase",
                      fontWeight: 600,
                      color: SEVERITY_COLOR[item.severity] || "#888",
                    }}
                  >
                    {item.severity}
                  </span>
                )}
                <span
                  style={{
                    flex: 1,
                    fontSize: "0.82rem",
                    color: "#ddd",
                    fontWeight: 500,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {item.label}
                </span>
              </div>
              {item.detail && (
                <div
                  style={{
                    fontSize: "0.72rem",
                    color: "#888",
                    marginLeft: 28,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {item.detail}
                </div>
              )}
            </div>
          );
        })}
        {filtered.length > 500 && (
          <div
            style={{
              color: "#888",
              fontSize: "0.8rem",
              padding: "1rem 0",
              textAlign: "center",
            }}
          >
            Showing first 500 of {filtered.length} events. Use filters to narrow
            results.
          </div>
        )}
      </div>

      {selectedEvent && (
        <EventDetailsModal
          event={selectedEvent}
          isOpen={true}
          onClose={() => setSelectedEvent(null)}
          title="Timeline Event"
        />
      )}
    </div>
  );
}
