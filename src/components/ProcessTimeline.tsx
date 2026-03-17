import { useMemo, useState, useRef, useCallback, useEffect } from "react";
import { LogEntry } from "../types";

/** Colour categories for the swimlane dots */
const LANE_COLORS: Record<string, string> = {
  suspicious: "#f87171", // red
  service: "#60a5fa", // blue
  system: "#a78bfa", // purple
  normal: "#4ade80", // green
};

const DEFAULT_SUSPICIOUS_DIRS = [
  "\\temp\\",
  "\\tmp\\",
  "\\appdata\\local\\temp",
  "\\public\\",
  "\\downloads\\",
  "\\users\\public",
  "\\programdata\\",
  "\\recycler\\",
  "\\perflogs\\",
];

const SUSPICIOUS_DIRS_KEY = "alienx_suspicious_dirs";

const SERVICE_NAMES = [
  "svchost.exe",
  "services.exe",
  "lsass.exe",
  "csrss.exe",
  "wininit.exe",
  "smss.exe",
  "spoolsv.exe",
  "dllhost.exe",
  "taskhost.exe",
  "taskhostw.exe",
];

interface TimelineEvent {
  name: string;
  fullPath: string;
  timestamp: number;
  category: string;
  commandLine: string;
  user: string;
  parent: string;
}

interface ProcessTimelineProps {
  entries: LogEntry[];
}

export function ProcessTimeline({ entries }: ProcessTimelineProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [visibleRange, setVisibleRange] = useState<[number, number] | null>(
    null,
  );

  // Customizable suspicious directories list
  const [suspiciousDirs, setSuspiciousDirs] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(SUSPICIOUS_DIRS_KEY);
      return stored ? JSON.parse(stored) : DEFAULT_SUSPICIOUS_DIRS;
    } catch {
      return DEFAULT_SUSPICIOUS_DIRS;
    }
  });
  const [showDirEditor, setShowDirEditor] = useState(false);
  const [newDir, setNewDir] = useState("");

  useEffect(() => {
    try {
      localStorage.setItem(SUSPICIOUS_DIRS_KEY, JSON.stringify(suspiciousDirs));
    } catch {
      /* ignore */
    }
  }, [suspiciousDirs]);

  const addDir = () => {
    const trimmed = newDir.trim().toLowerCase();
    if (trimmed && !suspiciousDirs.includes(trimmed)) {
      setSuspiciousDirs((prev) => [...prev, trimmed]);
      setNewDir("");
    }
  };
  const removeDir = (dir: string) =>
    setSuspiciousDirs((prev) => prev.filter((d) => d !== dir));
  const resetDirs = () => setSuspiciousDirs(DEFAULT_SUSPICIOUS_DIRS);

  const events = useMemo<TimelineEvent[]>(() => {
    const result: TimelineEvent[] = [];
    for (const entry of entries) {
      if (entry.eventId !== 1 && entry.eventId !== 4688) continue;
      const ts = entry.timestamp ? new Date(entry.timestamp).getTime() : 0;
      if (!ts) continue;

      const image =
        entry.eventData?.Image || entry.eventData?.NewProcessName || "";
      const name = image.split("\\").pop()?.toLowerCase() || "unknown";
      const cmdLine =
        entry.eventData?.CommandLine ||
        entry.eventData?.ProcessCommandLine ||
        "";
      const user = entry.eventData?.User || "";
      const parent =
        entry.eventData?.ParentImage ||
        entry.eventData?.ParentProcessName ||
        "";
      const pathLower = image.toLowerCase();

      let category = "normal";
      if (suspiciousDirs.some((d) => pathLower.includes(d))) {
        category = "suspicious";
      } else if (SERVICE_NAMES.includes(name)) {
        category = "service";
      } else if (
        pathLower.includes("\\windows\\system32\\") ||
        pathLower.includes("\\windows\\syswow64\\")
      ) {
        category = "system";
      }

      result.push({
        name,
        fullPath: image,
        timestamp: ts,
        category,
        commandLine: cmdLine,
        user,
        parent,
      });
    }
    result.sort((a, b) => a.timestamp - b.timestamp);
    return result;
  }, [entries, suspiciousDirs]);

  // Visible events after brush filter
  const visibleEvents = useMemo(() => {
    if (!visibleRange) return events;
    return events.filter(
      (e) => e.timestamp >= visibleRange[0] && e.timestamp <= visibleRange[1],
    );
  }, [events, visibleRange]);

  // Layout constants
  const WIDTH = 960;
  const HEIGHT = Math.min(420, Math.max(200, visibleEvents.length * 0.25 + 80));
  const MARGIN = { top: 24, right: 24, bottom: 50, left: 14 };
  const plotW = WIDTH - MARGIN.left - MARGIN.right;
  const plotH = HEIGHT - MARGIN.top - MARGIN.bottom;

  const { minTs, maxTs, ticks } = useMemo(() => {
    if (visibleEvents.length === 0)
      return { minTs: 0, maxTs: 1, ticks: [] as number[] };
    const mn = visibleEvents[0].timestamp;
    const mx = visibleEvents[visibleEvents.length - 1].timestamp;
    const range = mx - mn || 1;
    const tickCount = Math.min(8, visibleEvents.length);
    const step = range / tickCount;
    const t: number[] = [];
    for (let i = 0; i <= tickCount; i++) t.push(mn + step * i);
    return { minTs: mn, maxTs: mx, ticks: t };
  }, [visibleEvents]);

  const xScale = useCallback(
    (ts: number) => MARGIN.left + ((ts - minTs) / (maxTs - minTs || 1)) * plotW,
    [minTs, maxTs, plotW],
  );

  // Deterministic y lane per process name
  const yLanes = useMemo(() => {
    const unique = [...new Set(visibleEvents.map((e) => e.name))];
    const laneH = plotH / (unique.length || 1);
    const map: Record<string, number> = {};
    unique.forEach((n, i) => {
      map[n] = MARGIN.top + laneH * i + laneH / 2;
    });
    return map;
  }, [visibleEvents, plotH]);

  // Category counts
  const counts = useMemo(() => {
    const c: Record<string, number> = {
      suspicious: 0,
      service: 0,
      system: 0,
      normal: 0,
    };
    for (const e of visibleEvents) c[e.category] = (c[e.category] || 0) + 1;
    return c;
  }, [visibleEvents]);

  // Brush state for overview minimap
  const [brushing, setBrushing] = useState(false);
  const [brushStart, setBrushStart] = useState(0);
  const miniH = 36;
  const miniYScale = useCallback(
    (ts: number) => {
      if (events.length === 0) return MARGIN.left;
      const mn = events[0].timestamp;
      const mx = events[events.length - 1].timestamp;
      return MARGIN.left + ((ts - mn) / (mx - mn || 1)) * plotW;
    },
    [events, plotW],
  );

  const handleMiniMouseDown = useCallback(
    (e: React.MouseEvent<SVGRectElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      setBrushing(true);
      setBrushStart(x);
      setVisibleRange(null);
    },
    [],
  );

  const handleMiniMouseUp = useCallback(
    (e: React.MouseEvent<SVGRectElement>) => {
      if (!brushing) return;
      setBrushing(false);
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      if (events.length === 0) return;
      const mn = events[0].timestamp;
      const mx = events[events.length - 1].timestamp;
      const range = mx - mn || 1;
      const t1 = mn + (Math.min(brushStart, x) / plotW) * range;
      const t2 = mn + (Math.max(brushStart, x) / plotW) * range;
      if (t2 - t1 < range * 0.01) {
        setVisibleRange(null); // too small, reset
      } else {
        setVisibleRange([t1, t2]);
      }
    },
    [brushing, brushStart, events, plotW],
  );

  if (events.length === 0) {
    return (
      <div style={{ color: "#888", fontSize: "0.9rem", padding: "12px 0" }}>
        No process creation events (EID 1 / 4688) found.
      </div>
    );
  }

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
      <h4
        style={{
          color: "#00f0ff",
          marginBottom: "0.5rem",
          fontSize: "0.95rem",
          fontWeight: 600,
        }}
      >
        Process Creation Timeline — {events.length} event
        {events.length !== 1 ? "s" : ""}
      </h4>

      {/* Legend */}
      <div
        style={{
          display: "flex",
          gap: "14px",
          marginBottom: "0.5rem",
          fontSize: "0.72rem",
        }}
      >
        {Object.entries(LANE_COLORS).map(([cat, col]) => (
          <span
            key={cat}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              color: "#aaa",
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: col,
                display: "inline-block",
              }}
            />
            {cat} ({counts[cat] || 0})
          </span>
        ))}
      </div>

      {/* Suspicious Directories Editor */}
      <div style={{ marginBottom: "0.5rem" }}>
        <button
          onClick={() => setShowDirEditor((v) => !v)}
          style={{
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "#888",
            borderRadius: 4,
            padding: "2px 8px",
            cursor: "pointer",
            fontSize: "0.7rem",
          }}
        >
          {showDirEditor ? "▾" : "▸"} Suspicious Paths ({suspiciousDirs.length})
        </button>
        {showDirEditor && (
          <div
            style={{
              marginTop: "6px",
              padding: "8px",
              background: "rgba(0,0,0,0.15)",
              borderRadius: 6,
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "4px",
                marginBottom: "6px",
              }}
            >
              {suspiciousDirs.map((dir) => (
                <span
                  key={dir}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    background: "rgba(248,113,113,0.1)",
                    border: "1px solid rgba(248,113,113,0.25)",
                    borderRadius: 4,
                    padding: "2px 6px",
                    fontSize: "0.7rem",
                    color: "#f87171",
                    fontFamily: "monospace",
                  }}
                >
                  {dir}
                  <span
                    onClick={() => removeDir(dir)}
                    style={{
                      cursor: "pointer",
                      color: "#888",
                      fontWeight: 700,
                    }}
                    title="Remove"
                  >
                    ×
                  </span>
                </span>
              ))}
            </div>
            <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
              <input
                type="text"
                value={newDir}
                onChange={(e) => setNewDir(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addDir()}
                placeholder="e.g. \\staging\\"
                style={{
                  flex: 1,
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 4,
                  padding: "3px 6px",
                  fontSize: "0.72rem",
                  color: "#ccc",
                  fontFamily: "monospace",
                }}
              />
              <button
                onClick={addDir}
                style={{
                  background: "rgba(0,240,255,0.1)",
                  border: "1px solid rgba(0,240,255,0.3)",
                  color: "#00f0ff",
                  borderRadius: 4,
                  padding: "3px 8px",
                  cursor: "pointer",
                  fontSize: "0.7rem",
                }}
              >
                Add
              </button>
              <button
                onClick={resetDirs}
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: "#888",
                  borderRadius: 4,
                  padding: "3px 8px",
                  cursor: "pointer",
                  fontSize: "0.7rem",
                }}
                title="Restore default suspicious paths"
              >
                Reset
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Main chart */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        style={{ width: "100%", maxHeight: "420px", display: "block" }}
      >
        {/* Grid lines */}
        {ticks.map((t, i) => (
          <line
            key={i}
            x1={xScale(t)}
            x2={xScale(t)}
            y1={MARGIN.top}
            y2={MARGIN.top + plotH}
            stroke="rgba(255,255,255,0.06)"
            strokeDasharray="3,4"
          />
        ))}

        {/* Dots */}
        {visibleEvents.map((ev, i) => {
          const cx = xScale(ev.timestamp);
          const cy = yLanes[ev.name] ?? MARGIN.top + plotH / 2;
          const isHov = hoveredIdx === i;
          return (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={isHov ? 5 : 3}
              fill={LANE_COLORS[ev.category] || LANE_COLORS.normal}
              opacity={isHov ? 1 : 0.7}
              stroke={isHov ? "#fff" : "none"}
              strokeWidth={isHov ? 1.5 : 0}
              style={{ cursor: "pointer", transition: "r 0.12s" }}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
            />
          );
        })}

        {/* X-axis tick labels */}
        {ticks.map((t, i) => (
          <text
            key={`t-${i}`}
            x={xScale(t)}
            y={MARGIN.top + plotH + 16}
            textAnchor="middle"
            fill="#777"
            fontSize="9"
            fontFamily="monospace"
          >
            {new Date(t).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              hour12: false,
            })}
          </text>
        ))}

        {/* Tooltip */}
        {hoveredIdx !== null &&
          visibleEvents[hoveredIdx] &&
          (() => {
            const ev = visibleEvents[hoveredIdx];
            const cx = xScale(ev.timestamp);
            const cy = yLanes[ev.name] ?? MARGIN.top + plotH / 2;
            const tipX = cx + 10;
            const tipY = Math.max(MARGIN.top, cy - 40);
            const lines = [
              ev.name,
              new Date(ev.timestamp).toLocaleString(),
              ev.commandLine ? `cmd: ${ev.commandLine.slice(0, 80)}` : "",
              ev.user ? `user: ${ev.user}` : "",
              ev.parent ? `parent: ${ev.parent.split("\\").pop()}` : "",
            ].filter(Boolean);
            const boxW = Math.min(
              280,
              Math.max(...lines.map((l) => l.length * 5.5)) + 16,
            );
            const boxH = lines.length * 14 + 10;
            return (
              <g pointerEvents="none">
                <rect
                  x={tipX > WIDTH - boxW - 20 ? cx - boxW - 10 : tipX}
                  y={tipY}
                  width={boxW}
                  height={boxH}
                  rx={4}
                  fill="rgba(10,10,20,0.94)"
                  stroke="rgba(0,240,255,0.3)"
                />
                {lines.map((line, li) => (
                  <text
                    key={li}
                    x={(tipX > WIDTH - boxW - 20 ? cx - boxW - 10 : tipX) + 8}
                    y={tipY + 14 + li * 14}
                    fill={li === 0 ? "#00f0ff" : "#ccc"}
                    fontSize="10"
                    fontFamily="monospace"
                    fontWeight={li === 0 ? 700 : 400}
                  >
                    {line.length > 52 ? line.slice(0, 52) + "…" : line}
                  </text>
                ))}
              </g>
            );
          })()}
      </svg>

      {/* Overview minimap for brush selection */}
      {events.length > 20 && (
        <div style={{ marginTop: "4px" }}>
          <svg
            viewBox={`0 0 ${WIDTH} ${miniH}`}
            style={{ width: "100%", display: "block", cursor: "crosshair" }}
          >
            <rect
              x={MARGIN.left}
              y={0}
              width={plotW}
              height={miniH}
              fill="rgba(255,255,255,0.02)"
              rx={3}
            />
            {events.map((ev, i) => (
              <line
                key={i}
                x1={miniYScale(ev.timestamp)}
                x2={miniYScale(ev.timestamp)}
                y1={4}
                y2={miniH - 4}
                stroke={LANE_COLORS[ev.category] || LANE_COLORS.normal}
                strokeWidth={1}
                opacity={0.4}
              />
            ))}
            {/* Brush selection overlay */}
            {visibleRange && (
              <rect
                x={miniYScale(visibleRange[0])}
                y={0}
                width={
                  miniYScale(visibleRange[1]) - miniYScale(visibleRange[0])
                }
                height={miniH}
                fill="rgba(0,240,255,0.12)"
                stroke="rgba(0,240,255,0.4)"
                rx={2}
              />
            )}
            {/* Transparent interaction rect */}
            <rect
              x={MARGIN.left}
              y={0}
              width={plotW}
              height={miniH}
              fill="transparent"
              onMouseDown={handleMiniMouseDown}
              onMouseUp={handleMiniMouseUp}
            />
          </svg>
          {visibleRange && (
            <button
              onClick={() => setVisibleRange(null)}
              style={{
                marginTop: 4,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid #444",
                color: "#aaa",
                borderRadius: 4,
                padding: "2px 8px",
                cursor: "pointer",
                fontSize: "0.72rem",
              }}
            >
              Reset zoom
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default ProcessTimeline;
