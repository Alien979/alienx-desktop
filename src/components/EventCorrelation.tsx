import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { LogEntry, ParsedData } from "../types";
import { SigmaRuleMatch } from "../lib/sigma/types";
import { EVENT_TYPE_DESCRIPTIONS } from "../lib/correlationEngine";
import {
  correlateEventsNative,
  CorrelatedChainNative,
  CorrelationResultNative,
} from "../lib/correlationNativeClient";
import { CorrelatedChain } from "../lib/correlationEngine";
import ExportReport from "./ExportReport";
import "./EventCorrelation.css";

/** Shared helper: read a named field from a log entry's eventData or fall back to raw XML regex. */
function getEventField(event: LogEntry, fieldName: string): string | null {
  if (event.eventData && event.eventData[fieldName]) {
    return event.eventData[fieldName];
  }
  if (!event.rawLine) return null;
  const match = event.rawLine.match(
    new RegExp(`<Data Name="${fieldName}">([^<]*)</Data>`, "i"),
  );
  return match ? match[1] : null;
}

interface EventCorrelationProps {
  entries: LogEntry[];
  sigmaMatches: Map<string, SigmaRuleMatch[]>;
  onBack: () => void;
  data: ParsedData;
  filename: string;
  platform: string | null;
  onPivotToEvent?: (entry: LogEntry) => void;
}

export default function EventCorrelation({
  entries,
  sigmaMatches,
  onBack,
  data,
  filename,
  platform,
  onPivotToEvent,
}: EventCorrelationProps) {
  const [minEvents, setMinEvents] = useState(3);
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [showExportReport, setShowExportReport] = useState(false);
  const [viewMode, setViewMode] = useState<"chains" | "story" | "graph">(
    "chains",
  );
  const [isCorrelating, setIsCorrelating] = useState(true);
  const [chains, setChains] = useState<CorrelatedChainNative[]>([]);
  const [analytics, setAnalytics] = useState<
    null | CorrelationResultNative["analytics"]
  >(null);
  const [temporalWindow, setTemporalWindow] = useState(30); // seconds
  const [correlationProgress, setCorrelationProgress] = useState({
    current: 0,
    total: 1,
  });

  // Run correlation engine asynchronously to avoid blocking UI
  // Rust-native correlation with progress and analytics
  useEffect(() => {
    let cancelled = false;

    // Listen for progress events from Rust
    const handler = (event: any) => {
      if (typeof event?.payload === "number") {
        setCorrelationProgress((prev) => ({ ...prev, current: event.payload }));
      }
    };
    // @ts-ignore
    window.__TAURI__?.event?.listen?.("correlation_progress", handler);

    const runCorrelation = async () => {
      setIsCorrelating(true);
      setCorrelationProgress({ current: 0, total: 1 });

      // Convert sigmaMatches Map to array
      const sigmaMatchesArr = Array.from(sigmaMatches.values()).flat();
      try {
        const result = await correlateEventsNative(entries, sigmaMatchesArr);
        if (!cancelled) {
          setChains(result.chains);
          setAnalytics(result.analytics);
          setCorrelationProgress((prev) => ({ ...prev, current: prev.total }));
          setIsCorrelating(false);
        }
      } catch (err) {
        setIsCorrelating(false);
      }
    };
    runCorrelation();
    return () => {
      cancelled = true;
      // @ts-ignore
      window.__TAURI__?.event?.unlisten?.("correlation_progress", handler);
    };
  }, [entries, sigmaMatches]);
  // Convert CorrelatedChainNative to CorrelatedChain for UI components
  const allowedSeverities = [
    "critical",
    "high",
    "medium",
    "low",
    "info",
  ] as const;
  const chainsConverted: CorrelatedChain[] = useMemo(
    () =>
      chains.map((c) => ({
        ...c,
        events: [], // Native doesn't provide events, so leave empty
        eventIndices: c.event_indices,
        relationships: [],
        startTime: new Date(),
        endTime: new Date(),
        duration: 0,
        involvedProcesses: new Set<string>(),
        involvedHosts: new Set<string>(),
        sigmaMatches: [],
        severity: allowedSeverities.includes(c.severity as any)
          ? (c.severity as CorrelatedChain["severity"])
          : "info",
      })),
    [chains],
  );

  // Filtering logic (minEvents, severity)
  const filteredChains = useMemo(
    () =>
      chainsConverted.filter(
        (c) =>
          (c.eventIndices?.length ?? 0) >= minEvents &&
          (severityFilter === "all" || c.severity === severityFilter),
      ),
    [chainsConverted, minEvents, severityFilter],
  );

  // Format duration helper
  const formatDuration = (ms: number) => {
    if (!ms || isNaN(ms)) return "-";
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ${s % 60}s`;
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  };

  const stats = useMemo(() => {
    const totalEvents = chainsConverted.reduce(
      (sum, c) => sum + (c.events?.length ?? 0),
      0,
    );
    const withMatches = chainsConverted.filter(
      (c) => c.sigmaMatches?.length > 0,
    ).length;
    const bySeverity = {
      critical: chainsConverted.filter((c) => c.severity === "critical").length,
      high: chainsConverted.filter((c) => c.severity === "high").length,
      medium: chainsConverted.filter((c) => c.severity === "medium").length,
      low: chainsConverted.filter((c) => c.severity === "low").length,
      info: chainsConverted.filter((c) => c.severity === "info").length,
    };
    return {
      total: chainsConverted.length,
      totalEvents,
      withMatches,
      bySeverity,
    };
  }, [chainsConverted]);

  // Show progress bar if correlating
  if (isCorrelating) {
    return (
      <div className="correlation-progress modern-progress">
        <div className="progress-header">
          <span
            role="img"
            aria-label="processing"
            style={{ fontSize: "2rem", marginRight: 8 }}
          >
            🔄
          </span>
          <h3 style={{ margin: 0 }}>Correlating Events...</h3>
        </div>
        <div className="progress-bar-outer">
          <div
            className="progress-bar-inner"
            style={{
              width: `${Math.min(100, (correlationProgress.current / correlationProgress.total) * 100)}%`,
            }}
          />
        </div>
        <div className="progress-label">
          Progress: <b>{correlationProgress.current}</b> /{" "}
          {correlationProgress.total}
        </div>
        <div className="progress-tip">
          This may take a moment for large datasets.
        </div>
      </div>
    );
  }

  // Show analytics summary if available
  const analyticsSummary = analytics && (
    <div className="correlation-analytics modern-analytics">
      <h4 style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span role="img" aria-label="analytics">
          📊
        </span>{" "}
        Correlation Analytics
      </h4>
      <div className="analytics-cards">
        <div className="analytics-card" title="Total event chains detected">
          <span className="analytics-label">Chains</span>
          <span className="analytics-value chains">
            {analytics.total_chains}
          </span>
        </div>
        <div
          className="analytics-card"
          title="Average number of events per chain"
        >
          <span className="analytics-label">Avg. Chain Length</span>
          <span className="analytics-value avg">
            {analytics.avg_chain_length.toFixed(2)}
          </span>
        </div>
        <div
          className="analytics-card"
          title="Top 5 most frequent process images"
        >
          <span className="analytics-label">Top Processes</span>
          <span className="analytics-value procs">
            {analytics.top_processes.length ? (
              analytics.top_processes.join(", ")
            ) : (
              <span style={{ color: "#aaa" }}>N/A</span>
            )}
          </span>
        </div>
        <div
          className="analytics-card"
          title="Highest threat score among all chains"
        >
          <span className="analytics-label">Max Threat Score</span>
          <span className="analytics-value score">{analytics.max_score}</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="event-correlation">
      {analyticsSummary}
      <div className="correlation-header">
        <div className="header-left">
          <button className="back-button" onClick={onBack}>
            ← Back
          </button>
          <div className="header-title">
            <h1>Event Correlation</h1>
            <p className="tagline">
              Analyze related event chains and attack patterns
            </p>
          </div>
        </div>
        <div className="header-actions">
          <div className="view-toggle">
            <button
              className={viewMode === "story" ? "active" : ""}
              onClick={() => setViewMode("story")}
              title="Narrative summary of chains"
            >
              Storyline
            </button>
            <button
              className={viewMode === "chains" ? "active" : ""}
              onClick={() => setViewMode("chains")}
              title="Detailed chain timeline and tree"
            >
              Chains
            </button>
            <button
              className={viewMode === "graph" ? "active" : ""}
              onClick={() => setViewMode("graph")}
              title="Force-directed relationship graph"
            >
              Graph
            </button>
          </div>
          <button
            className="export-report-btn"
            onClick={() => setShowExportReport(true)}
          >
            Export Report
          </button>
        </div>
      </div>

      {/* Onboarding */}
      <div
        style={{
          padding: "12px 16px",
          marginBottom: 12,
          borderRadius: 8,
          background: "rgba(96,165,250,0.06)",
          border: "1px solid rgba(96,165,250,0.15)",
          fontSize: "0.85rem",
          color: "#aaa",
          lineHeight: 1.6,
        }}
      >
        <strong style={{ color: "#60a5fa" }}>
          How Event Correlation Works:
        </strong>{" "}
        This engine links related security events into attack chains by
        analysing process parent–child relationships, network connections,
        credential access, and temporal proximity (configurable window). Chains
        are scored and ranked by severity based on SIGMA rule matches found
        within each chain.
      </div>

      {/* SIGMA Note */}
      {sigmaMatches.size === 0 && (
        <div className="sigma-note">
          <span className="note-icon">i</span>
          <span>
            Run SIGMA Detection first to see matched rules correlated with event
            chains.
          </span>
        </div>
      )}

      {/* Statistics Bar */}
      <div className="stats-bar">
        <div className="stat">
          <span className="stat-value">{stats.total}</span>
          <span className="stat-label">Chains</span>
        </div>
        <div className="stat">
          <span className="stat-value">{stats.totalEvents}</span>
          <span className="stat-label">Correlated Events</span>
        </div>
        <div className="stat">
          <span className="stat-value">{stats.withMatches}</span>
          <span className="stat-label">With SIGMA Matches</span>
        </div>
        <div className="stat severity-critical">
          <span className="stat-value">{stats.bySeverity.critical}</span>
          <span className="stat-label">Critical</span>
        </div>
        <div className="stat severity-high">
          <span className="stat-value">{stats.bySeverity.high}</span>
          <span className="stat-label">High</span>
        </div>
        <div className="stat severity-medium">
          <span className="stat-value">{stats.bySeverity.medium}</span>
          <span className="stat-label">Medium</span>
        </div>
      </div>

      {/* Filters */}
      <div className="filters-bar">
        <div className="filter-group">
          <label>Min Events:</label>
          <input
            type="number"
            min={2}
            max={50}
            value={minEvents}
            onChange={(e) => setMinEvents(parseInt(e.target.value) || 3)}
          />
        </div>
        <div className="filter-group">
          <label>Severity:</label>
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
          >
            <option value="all">All</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
            <option value="info">Info</option>
          </select>
        </div>
        <div className="filter-group">
          <label>Temporal Window:</label>
          <input
            type="range"
            min={0}
            max={120}
            step={5}
            value={temporalWindow}
            onChange={(e) => setTemporalWindow(parseInt(e.target.value) || 0)}
            style={{ width: 100 }}
          />
          <span style={{ fontSize: "0.8rem", color: "#aaa", marginLeft: 4 }}>
            {temporalWindow === 0 ? "Off" : `${temporalWindow}s`}
          </span>
        </div>
        <div className="filter-result">
          Showing {filteredChains.length} of {chainsConverted.length} chains
        </div>
      </div>

      {/* Main Content */}
      <div className="correlation-content">
        {viewMode === "story" ? (
          <StorylineSummary
            chains={filteredChains}
            formatDuration={formatDuration}
          />
        ) : viewMode === "graph" ? (
          <CorrelationGraph
            chains={filteredChains}
            onPivotToEvent={onPivotToEvent}
          />
        ) : (
          <ChainTimeline
            chains={filteredChains}
            formatDuration={formatDuration}
            onPivotToEvent={onPivotToEvent}
          />
        )}
      </div>

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

// ============================================================================
// CORRELATION GRAPH — Clean hierarchical visualization
// ============================================================================

const EDGE_COLORS: Record<string, string> = {
  process_spawn: "#60a5fa",
  same_process: "#a78bfa",
  network_connection: "#06b6d4",
  file_operation: "#4ade80",
  registry_operation: "#fbbf24",
  temporal: "#555",
};

const SEVERITY_NODE_COLORS: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#22c55e",
  info: "#94a3b8",
};

interface GraphNode {
  id: number;
  x: number;
  y: number;
  label: string;
  hasSigma: boolean;
  sigmaRules: string[]; // rule titles
  sigmaDetails: Array<{
    rule: string;
    fields: Array<{ field: string; value: string; modifier?: string }>;
  }>;
  chainIdx: number;
  entry: LogEntry;
  depth: number;
}

interface GraphEdge {
  source: number;
  target: number;
  type: string;
}

interface CorrelationGraphProps {
  chains: CorrelatedChain[];
  onPivotToEvent?: (entry: LogEntry) => void;
}

function CorrelationGraph({ chains, onPivotToEvent }: CorrelationGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [selectedChain, setSelectedChain] = useState<number>(0); // Default to first chain
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0, px: 0, py: 0 });

  // Build graph data from selected chain
  const { nodes, edges } = useMemo(() => {
    if (chains.length === 0) return { nodes: [], edges: [] };

    const chain = chains[selectedChain] || chains[0];
    const ns: GraphNode[] = [];
    const es: GraphEdge[] = [];

    // Build adjacency list for tree layout
    const children = new Map<number, number[]>();
    const hasParent = new Set<number>();
    for (const rel of chain.relationships) {
      if (
        rel.type === "process_spawn" ||
        rel.type === "same_process" ||
        rel.type === "file_operation"
      ) {
        const c = children.get(rel.sourceIndex) || [];
        c.push(rel.targetIndex);
        children.set(rel.sourceIndex, c);
        hasParent.add(rel.targetIndex);
      }
    }

    // Find roots (nodes with no parent)
    const roots: number[] = [];
    for (let i = 0; i < chain.events.length; i++) {
      if (!hasParent.has(i)) roots.push(i);
    }
    if (roots.length === 0 && chain.events.length > 0) roots.push(0);

    // Assign depths via BFS
    const depthMap = new Map<number, number>();
    const queue: Array<{ idx: number; depth: number }> = roots.map((r) => ({
      idx: r,
      depth: 0,
    }));
    const visited = new Set<number>();
    while (queue.length > 0) {
      const { idx, depth } = queue.shift()!;
      if (visited.has(idx)) continue;
      visited.add(idx);
      depthMap.set(idx, depth);
      for (const child of children.get(idx) || []) {
        if (!visited.has(child)) queue.push({ idx: child, depth: depth + 1 });
      }
    }
    // Add unvisited nodes
    for (let i = 0; i < chain.events.length; i++) {
      if (!depthMap.has(i))
        depthMap.set(
          i,
          depthMap.size > 0 ? Math.max(...depthMap.values()) + 1 : 0,
        );
    }

    // Group nodes by depth for horizontal positioning
    const depthGroups = new Map<number, number[]>();
    for (const [idx, depth] of depthMap.entries()) {
      const arr = depthGroups.get(depth) || [];
      arr.push(idx);
      depthGroups.set(depth, arr);
    }

    // Limit displayed nodes for very large chains
    const MAX_NODES = 50;
    const allIndices = Array.from(depthMap.keys()).sort(
      (a, b) => (depthMap.get(a) || 0) - (depthMap.get(b) || 0),
    );
    const displayIndices = new Set(allIndices.slice(0, MAX_NODES));

    // Compute positions — tree layout: depth downward, siblings side-by-side
    const NODE_H_SPACING = 140;
    const NODE_V_SPACING = 100;
    const globalIdxMap = new Map<number, number>(); // chain localIdx → graph node idx

    const sortedDepths = Array.from(depthGroups.keys()).sort((a, b) => a - b);
    const maxWidth = Math.max(
      ...Array.from(depthGroups.values()).map(
        (g) => g.filter((i) => displayIndices.has(i)).length,
      ),
      1,
    );
    const canvasW = Math.max(900, maxWidth * NODE_H_SPACING + 100);

    for (const depth of sortedDepths) {
      const group = (depthGroups.get(depth) || []).filter((i) =>
        displayIndices.has(i),
      );
      const totalW = (group.length - 1) * NODE_H_SPACING;
      const startX = canvasW / 2 - totalW / 2;
      const y = 60 + depth * NODE_V_SPACING;

      group.forEach((eventIdx, posIdx) => {
        const event = chain.events[eventIdx];
        if (!event) return;

        const procName =
          event.eventData?.Image?.split(/[\\\/]/).pop() ||
          event.eventData?.TargetFilename?.split(/[\\\/]/).pop() ||
          `Event ${event.eventId || "?"}`;

        // Check SIGMA matches for this event
        const sigmaRules: string[] = [];
        const sigmaDetails: GraphNode["sigmaDetails"] = [];
        for (const sm of chain.sigmaMatches) {
          const evtMatch =
            sm.event === event ||
            (sm.event?.rawLine &&
              event.rawLine &&
              sm.event.rawLine === event.rawLine);
          if (evtMatch) {
            sigmaRules.push(sm.rule.title);
            const fields: Array<{
              field: string;
              value: string;
              modifier?: string;
            }> = [];
            if (sm.selectionMatches) {
              for (const selM of sm.selectionMatches) {
                if (!selM.matched) continue;
                for (const fm of selM.fieldMatches) {
                  if (fm.matched) {
                    fields.push({
                      field: fm.field,
                      value:
                        fm.value !== undefined && fm.value !== null
                          ? String(fm.value)
                          : "N/A",
                      modifier: fm.modifier ? fm.modifier : undefined,
                    });
                  }
                }
              }
            }
            sigmaDetails.push({ rule: sm.rule.title, fields });
          }
        }

        const gIdx = ns.length;
        globalIdxMap.set(eventIdx, gIdx);
        ns.push({
          id: gIdx,
          x: startX + posIdx * NODE_H_SPACING,
          y,
          label: procName,
          hasSigma: sigmaRules.length > 0,
          sigmaRules,
          sigmaDetails,
          chainIdx: selectedChain,
          entry: event,
          depth,
        });
      });
    }

    // Add edges
    for (const rel of chain.relationships) {
      const src = globalIdxMap.get(rel.sourceIndex);
      const tgt = globalIdxMap.get(rel.targetIndex);
      if (src !== undefined && tgt !== undefined) {
        es.push({ source: src, target: tgt, type: rel.type });
      }
    }

    return { nodes: ns, edges: es };
  }, [chains, selectedChain]);

  // Compute SVG dimensions
  const svgWidth = useMemo(() => {
    if (nodes.length === 0) return 900;
    return Math.max(900, Math.max(...nodes.map((n) => n.x)) + 100);
  }, [nodes]);
  const svgHeight = useMemo(() => {
    if (nodes.length === 0) return 500;
    return Math.max(500, Math.max(...nodes.map((n) => n.y)) + 120);
  }, [nodes]);

  // Reset zoom/pan when chain changes
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setSelectedNode(null);
    setHoveredNode(null);
  }, [selectedChain]);

  // Pan handlers
  const handleSvgMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as Element).closest("g[data-node]")) return;
      isPanning.current = true;
      panStart.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
    },
    [pan],
  );

  const handleSvgMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning.current) return;
    setPan({
      x: panStart.current.px + (e.clientX - panStart.current.x),
      y: panStart.current.py + (e.clientY - panStart.current.y),
    });
  }, []);

  const handleSvgMouseUp = useCallback(() => {
    isPanning.current = false;
  }, []);

  // Zoom handler
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => Math.max(0.3, Math.min(3, z - e.deltaY * 0.001)));
  }, []);

  if (chains.length === 0) {
    return (
      <div className="story-empty">No chains match the current filters.</div>
    );
  }

  const currentChain = chains[selectedChain] || chains[0];

  return (
    <div className="correlation-graph-container">
      {/* Chain selector */}
      <div className="graph-chain-selector">
        {chains.map((chain, i) => (
          <button
            key={chain.id}
            className={selectedChain === i ? "active" : ""}
            onClick={() => setSelectedChain(i)}
            style={{
              borderLeftColor: SEVERITY_NODE_COLORS[chain.severity] || "#888",
            }}
          >
            Chain {i + 1}{" "}
            <span
              style={{
                fontSize: "0.7rem",
                color: SEVERITY_NODE_COLORS[chain.severity] || "#888",
              }}
            >
              {chain.severity}
            </span>
            {chain.sigmaMatches.length > 0 && (
              <span
                style={{ color: "#ef4444", marginLeft: 4, fontSize: "0.65rem" }}
              >
                ⚠ {chain.sigmaMatches.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Chain info bar */}
      <div className="graph-info-bar">
        <span>{currentChain.events.length} events</span>
        <span>{currentChain.relationships.length} relationships</span>
        <span>{currentChain.sigmaMatches.length} SIGMA detections</span>
        <span className="graph-zoom-controls">
          <button
            onClick={() => setZoom((z) => Math.min(3, z + 0.2))}
            title="Zoom in"
          >
            +
          </button>
          <span
            style={{ fontSize: "0.7rem", minWidth: 40, textAlign: "center" }}
          >
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom((z) => Math.max(0.3, z - 0.2))}
            title="Zoom out"
          >
            −
          </button>
          <button
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
            title="Reset view"
            style={{ marginLeft: 4 }}
          >
            ⟲
          </button>
        </span>
      </div>

      {/* Legend */}
      <div className="graph-legend">
        {Object.entries(EDGE_COLORS).map(([type, color]) => (
          <span key={type} className="legend-item">
            <span className="legend-line" style={{ background: color }} />
            {type.replace(/_/g, " ")}
          </span>
        ))}
        <span className="legend-item">
          <span
            className="legend-dot"
            style={{ background: "#ef4444", boxShadow: "0 0 6px #ef4444" }}
          />
          SIGMA match
        </span>
      </div>

      {/* SVG canvas */}
      <div
        ref={containerRef}
        className="graph-canvas-wrapper"
        onWheel={handleWheel}
      >
        <svg
          ref={svgRef}
          width={svgWidth}
          height={svgHeight}
          className="correlation-graph-svg"
          style={{
            transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
            transformOrigin: "0 0",
          }}
          onMouseDown={handleSvgMouseDown}
          onMouseMove={handleSvgMouseMove}
          onMouseUp={handleSvgMouseUp}
          onMouseLeave={handleSvgMouseUp}
        >
          {/* Edge arrows definition */}
          <defs>
            {Object.entries(EDGE_COLORS).map(([type, color]) => (
              <marker
                key={type}
                id={`arrow-${type}`}
                viewBox="0 0 10 6"
                refX="10"
                refY="3"
                markerWidth="8"
                markerHeight="6"
                orient="auto"
              >
                <path d="M0,0 L10,3 L0,6 Z" fill={color} />
              </marker>
            ))}
          </defs>

          {/* Edges */}
          {edges.map((edge, i) => {
            const src = nodes[edge.source];
            const tgt = nodes[edge.target];
            if (!src || !tgt) return null;
            // Shorten line to not overlap node circles
            const dx = tgt.x - src.x;
            const dy = tgt.y - src.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const srcR = src.hasSigma ? 14 : 10;
            const tgtR = tgt.hasSigma ? 14 : 10;
            return (
              <line
                key={`e-${i}`}
                x1={src.x + (dx / dist) * srcR}
                y1={src.y + (dy / dist) * srcR}
                x2={tgt.x - (dx / dist) * (tgtR + 8)}
                y2={tgt.y - (dy / dist) * (tgtR + 8)}
                stroke={EDGE_COLORS[edge.type] || "#555"}
                strokeWidth={2}
                strokeOpacity={0.7}
                markerEnd={`url(#arrow-${edge.type})`}
              />
            );
          })}

          {/* Nodes */}
          {nodes.map((node) => {
            const isHovered = hoveredNode?.id === node.id;
            const isSelected = selectedNode?.id === node.id;
            const r = node.hasSigma ? 14 : 10;
            const fillColor = node.hasSigma
              ? "#ef4444"
              : SEVERITY_NODE_COLORS[currentChain.severity] || "#60a5fa";

            return (
              <g
                key={`n-${node.id}`}
                data-node={node.id}
                transform={`translate(${node.x}, ${node.y})`}
                style={{ cursor: "pointer" }}
                onMouseEnter={() => setHoveredNode(node)}
                onMouseLeave={() => setHoveredNode(null)}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedNode((prev) =>
                    prev?.id === node.id ? null : node,
                  );
                }}
              >
                {/* Glow ring for SIGMA nodes */}
                {node.hasSigma && (
                  <circle
                    r={r + 6}
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth={2}
                    strokeOpacity={0.3}
                  >
                    <animate
                      attributeName="r"
                      values={`${r + 4};${r + 8};${r + 4}`}
                      dur="2s"
                      repeatCount="indefinite"
                    />
                    <animate
                      attributeName="stroke-opacity"
                      values="0.4;0.1;0.4"
                      dur="2s"
                      repeatCount="indefinite"
                    />
                  </circle>
                )}
                <circle
                  r={r}
                  fill={fillColor}
                  stroke={isHovered || isSelected ? "#fff" : "rgba(0,0,0,0.4)"}
                  strokeWidth={isHovered || isSelected ? 2.5 : 1}
                />
                {/* Node label */}
                <text
                  y={-r - 6}
                  textAnchor="middle"
                  fill="#ddd"
                  fontSize="0.65rem"
                  fontFamily="monospace"
                  style={{ pointerEvents: "none" }}
                >
                  {node.label.length > 20
                    ? node.label.slice(0, 18) + "…"
                    : node.label}
                </text>
                {/* SIGMA badge */}
                {node.hasSigma && (
                  <text
                    y={r + 14}
                    textAnchor="middle"
                    fill="#ef4444"
                    fontSize="0.6rem"
                    fontWeight="bold"
                    style={{ pointerEvents: "none" }}
                  >
                    ⚠ {node.sigmaRules.length} rule
                    {node.sigmaRules.length !== 1 ? "s" : ""}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Hover tooltip */}
      {hoveredNode && !selectedNode && (
        <div className="graph-tooltip">
          <strong>{hoveredNode.label}</strong>
          <div style={{ fontSize: "0.75rem", color: "#aaa", marginTop: 4 }}>
            Event ID: {hoveredNode.entry.eventId || "?"}
            <br />
            {hoveredNode.entry.timestamp instanceof Date
              ? hoveredNode.entry.timestamp.toLocaleString()
              : ""}
          </div>
          {hoveredNode.hasSigma && (
            <div
              style={{
                marginTop: 6,
                borderTop: "1px solid #333",
                paddingTop: 6,
              }}
            >
              <div
                style={{
                  color: "#ef4444",
                  fontWeight: "bold",
                  fontSize: "0.75rem",
                }}
              >
                ⚠ SIGMA Detections:
              </div>
              {hoveredNode.sigmaRules.map((r, i) => (
                <div
                  key={i}
                  style={{ fontSize: "0.7rem", color: "#fca5a5", marginTop: 2 }}
                >
                  • {r}
                </div>
              ))}
            </div>
          )}
          <div style={{ fontSize: "0.6rem", color: "#666", marginTop: 4 }}>
            Click for details
          </div>
        </div>
      )}

      {/* Selected node detail panel — shows full SIGMA detection info */}
      {selectedNode && (
        <div className="graph-detail-panel">
          <div className="graph-detail-header">
            <strong>{selectedNode.label}</strong>
            <button
              className="graph-detail-close"
              onClick={() => setSelectedNode(null)}
            >
              ✕
            </button>
          </div>
          <div className="graph-detail-meta">
            <span>Event ID: {selectedNode.entry.eventId || "?"}</span>
            <span>
              {selectedNode.entry.timestamp instanceof Date
                ? selectedNode.entry.timestamp.toLocaleString(undefined, {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                    hour12: false,
                  })
                : ""}
            </span>
            {selectedNode.entry.computer && (
              <span>Host: {selectedNode.entry.computer}</span>
            )}
          </div>

          {selectedNode.sigmaDetails.length > 0 ? (
            <div className="graph-detail-sigma">
              <div className="graph-detail-sigma-title">
                🔍 SIGMA Detections — What matched:
              </div>
              {selectedNode.sigmaDetails.map((det, di) => (
                <div key={di} className="graph-detail-rule">
                  <div className="graph-detail-rule-name">⚠ {det.rule}</div>
                  {det.fields.length > 0 && (
                    <div className="graph-detail-fields">
                      {det.fields.map((f, fi) => (
                        <div key={fi} className="graph-detail-field-row">
                          <span className="graph-detail-field-name">
                            {f.field}
                          </span>
                          <span className="graph-detail-field-arrow">→</span>
                          <span
                            className="graph-detail-field-value"
                            title={f.value}
                          >
                            {f.value.length > 60
                              ? f.value.slice(0, 58) + "…"
                              : f.value}
                          </span>
                          {f.modifier && (
                            <span className="graph-detail-modifier">
                              {f.modifier}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: "0.8rem", color: "#888", marginTop: 8 }}>
              No SIGMA detections for this event.
            </div>
          )}

          <button
            className="graph-detail-pivot-btn"
            onClick={() => onPivotToEvent?.(selectedNode.entry)}
          >
            📄 View Full Event
          </button>
        </div>
      )}
    </div>
  );
}

// Timeline visualization component
interface ChainTimelineProps {
  chains: CorrelatedChain[];
  formatDuration: (ms: number) => string;
  onPivotToEvent?: (entry: LogEntry) => void;
}

interface StorylineSummaryProps {
  chains: CorrelatedChain[];
  formatDuration: (ms: number) => string;
}

function buildStorySteps(chain: CorrelatedChain) {
  // Get SIGMA-focused events (matched events + context) instead of just first events
  let eventsToShow: LogEntry[];

  if (chain.sigmaMatches.length === 0) {
    // No SIGMA matches - show all events
    eventsToShow = chain.events;
  } else {
    // Find all matched event indices
    const matchedIndices = new Set<number>();
    chain.sigmaMatches.forEach((match) => {
      const matchEvent = match.event;
      const idx = chain.events.findIndex((e) => {
        if (!matchEvent) return false;
        if (e === matchEvent) return true;
        if (e.rawLine && matchEvent.rawLine && e.rawLine === matchEvent.rawLine)
          return true;
        return false;
      });
      if (idx >= 0) {
        // Add matched event + 2 events before and after for context
        const neighborSpan = 2;
        for (
          let i = Math.max(0, idx - neighborSpan);
          i <= Math.min(chain.events.length - 1, idx + neighborSpan);
          i++
        ) {
          matchedIndices.add(i);
        }
      }
    });

    if (matchedIndices.size === 0) {
      // Fallback if no matches found
      eventsToShow = chain.events;
    } else {
      // Sort indices and show all matched events with context
      const sortedIndices = Array.from(matchedIndices).sort((a, b) => a - b);
      eventsToShow = sortedIndices.map((i) => chain.events[i]);
    }
  }

  return eventsToShow.map((event) => {
    const hasMatch = chain.sigmaMatches.some((m) => {
      if (m.event === event) return true;
      if (
        m.event?.rawLine &&
        event.rawLine &&
        m.event.rawLine === event.rawLine
      )
        return true;
      return false;
    });

    // Extract fields via shared utility
    const getField = (name: string) => getEventField(event, name);

    const image = getField("Image");
    const proc = image?.split(/[\\\/]/).pop() || null;
    const commandLine = getField("CommandLine");
    const destIp = getField("DestinationIp");
    const destPort = getField("DestinationPort");
    const targetObject = getField("TargetObject");
    const targetFilename = getField("TargetFilename");
    const imageLoaded = getField("ImageLoaded");
    const parentImage = getField("ParentImage");
    const user = getField("User");

    let summary = "";
    let detail = "";

    // Additional fields for richer story
    const sourceImage = getField("SourceImage");
    const targetImage = getField("TargetImage");
    const grantedAccess = getField("GrantedAccess");
    const pipeName = getField("PipeName");
    const protocol = getField("Protocol");
    const queryResults = getField("QueryResults");

    // Build narrative based on event type
    switch (event.eventId) {
      case 1: // Process Create
        summary = proc ? `${proc} executed` : "Process created";
        if (parentImage) {
          const parent = parentImage.split(/[\\\/]/).pop();
          summary += ` by ${parent}`;
        }
        if (commandLine && commandLine !== image) {
          detail = commandLine;
        }
        break;
      case 3: // Network Connection
        summary = proc ? `${proc} connected to network` : "Network connection";
        if (destIp) {
          detail = destPort ? `${destIp}:${destPort}` : destIp;
          if (protocol) detail += ` [${protocol}]`;
        }
        break;
      case 5: // Process Terminate
        summary = proc ? `${proc} terminated` : "Process terminated";
        break;
      case 6: // Driver Load
        summary = proc ? `Driver loaded: ${proc}` : "Driver loaded";
        if (imageLoaded) {
          const driver = imageLoaded.split(/[\\\/]/).pop();
          summary = `Driver loaded: ${driver}`;
        }
        break;
      case 7: // Image Loaded
        if (imageLoaded) {
          const dll = imageLoaded.split(/[\\\/]/).pop();
          summary = proc ? `${proc} loaded ${dll}` : `Loaded ${dll}`;
        } else {
          summary = "DLL/module loaded";
        }
        break;
      case 8: {
        // CreateRemoteThread
        const srcProc = sourceImage?.split(/[\\\/]/).pop() || proc || "Unknown";
        const tgtProc = targetImage?.split(/[\\\/]/).pop() || "unknown process";
        summary = `${srcProc} injected thread into ${tgtProc}`;
        break;
      }
      case 10: {
        // Process Access
        const srcProc10 =
          sourceImage?.split(/[\\\/]/).pop() || proc || "Unknown";
        const tgtProc10 =
          targetImage?.split(/[\\\/]/).pop() || "unknown process";
        summary = `${srcProc10} accessed ${tgtProc10}`;
        if (grantedAccess) detail = `Access rights: ${grantedAccess}`;
        break;
      }
      case 11: // File Create
        if (targetFilename) {
          const file = targetFilename.split(/[\\\/]/).pop();
          summary = proc ? `${proc} created ${file}` : `Created ${file}`;
          detail = targetFilename;
        } else {
          summary = "File created";
        }
        break;
      case 12:
      case 13:
      case 14: // Registry events
        if (targetObject) {
          const action =
            event.eventId === 12
              ? "added/deleted"
              : event.eventId === 13
                ? "set value in"
                : "renamed";
          summary = proc ? `${proc} ${action} registry` : `Registry ${action}`;
          detail = targetObject;
        } else {
          summary = "Registry activity";
        }
        break;
      case 15: // File Stream Created
        summary = proc
          ? `${proc} created alternate data stream`
          : "ADS created";
        if (targetFilename) detail = targetFilename;
        break;
      case 17: // Pipe Created
        summary = proc ? `${proc} created named pipe` : "Named pipe created";
        if (pipeName) detail = pipeName;
        break;
      case 18: // Pipe Connected
        summary = proc ? `${proc} connected to pipe` : "Pipe connected";
        if (pipeName) detail = pipeName;
        break;
      case 22: // DNS Query
        summary = proc ? `${proc} performed DNS query` : "DNS query";
        const queryName = getField("QueryName");
        if (queryName) {
          detail = queryName;
          if (queryResults) detail += ` → ${queryResults}`;
        }
        break;
      case 23:
      case 26: // File Delete
        if (targetFilename) {
          const file = targetFilename.split(/[\\\/]/).pop();
          summary = proc ? `${proc} deleted ${file}` : `Deleted ${file}`;
        } else {
          summary = "File deleted";
        }
        break;
      case 25: // Process Tampering
        summary = proc
          ? `${proc} — process tampering detected`
          : "Process tampering";
        break;
      default: {
        // Use the event type description map for all other events
        const typeDesc = EVENT_TYPE_DESCRIPTIONS[event.eventId || 0];
        if (typeDesc) {
          summary = proc ? `${proc} — ${typeDesc}` : typeDesc;
        } else {
          summary = proc
            ? `${proc} (Event ${event.eventId})`
            : `Event ${event.eventId}`;
        }
      }
    }

    // Add user context if available
    if (user && user !== "N/A" && !user.includes("SYSTEM")) {
      summary += ` [${user.split("\\").pop()}]`;
    }

    return {
      time: event.timestamp,
      summary,
      detail,
      hasMatch,
      matchedRules: hasMatch
        ? chain.sigmaMatches
            .filter(
              (m) =>
                m.event === event ||
                (m.event?.rawLine &&
                  event.rawLine &&
                  m.event.rawLine === event.rawLine),
            )
            .map((m) => m.rule.title)
        : [],
    };
  });
}

function StorylineSummary({ chains }: StorylineSummaryProps) {
  const formatRange = (chain: CorrelatedChain) => {
    const opts: Intl.DateTimeFormatOptions = {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    };
    if (!chain.startTime || !chain.endTime) return "Unknown time range";
    try {
      return `${chain.startTime.toLocaleDateString("en-GB", opts)} → ${chain.endTime.toLocaleDateString("en-GB", opts)}`;
    } catch {
      return "Invalid time range";
    }
  };

  const getTopRule = (chain: CorrelatedChain) => {
    const match = chain.sigmaMatches[0];
    return match?.rule?.title || match?.rule?.id || null;
  };

  return (
    <div className="story-cards">
      {chains.map((chain) => {
        const steps = buildStorySteps(chain);
        const topRule = getTopRule(chain);
        const actors = Array.from(chain.involvedProcesses).slice(0, 3);
        const hosts = Array.from(chain.involvedHosts).slice(0, 2);

        return (
          <div key={chain.id} className="story-card">
            <div className="story-card-header">
              <div className="left">
                <span className={`severity-badge severity-${chain.severity}`}>
                  {chain.severity.toUpperCase()}
                </span>
                <h3>{chain.summary}</h3>
              </div>
              <div className="right">
                <span className="range">{formatRange(chain)}</span>
                <span className="count">{chain.events.length} events</span>
                {chain.sigmaMatches.length > 0 && (
                  <span className="sigma-chip">
                    {chain.sigmaMatches.length} detections
                  </span>
                )}
              </div>
            </div>

            <div className="story-meta">
              <div className="meta-row">
                <span className="meta-label">Key actors</span>
                <span className="meta-value">
                  {actors.length ? actors.join(", ") : "Unknown"}
                </span>
              </div>
              <div className="meta-row">
                <span className="meta-label">Hosts</span>
                <span className="meta-value">
                  {hosts.length ? hosts.join(", ") : "Unknown"}
                </span>
              </div>
              <div className="meta-row">
                <span className="meta-label">Top detection</span>
                <span className="meta-value">{topRule || "None"}</span>
              </div>
            </div>

            <div className="story-steps">
              {steps.map((step, idx) => (
                <div
                  key={idx}
                  className={`story-step ${step.hasMatch ? "has-detection" : ""}`}
                >
                  <div className="step-marker">
                    <span
                      className={`marker-dot ${step.hasMatch ? "detected" : ""}`}
                    />
                    <span className="step-time">
                      {step.time
                        ? (() => {
                            try {
                              return step.time.toLocaleDateString("en-GB", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                                second: "2-digit",
                                hour12: false,
                              });
                            } catch {
                              return "Invalid time";
                            }
                          })()
                        : "Unknown"}
                    </span>
                  </div>
                  <div className="step-body">
                    <p className="step-summary">{step.summary}</p>
                    {step.detail && (
                      <p className="step-detail">{step.detail}</p>
                    )}
                    {step.hasMatch && step.matchedRules.length > 0 && (
                      <div className="step-detections">
                        {step.matchedRules.map((rule, rIdx) => (
                          <span key={rIdx} className="detection-badge">
                            {rule}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {chain.events.length > steps.length && (
                <div className="story-more">
                  + {chain.events.length - steps.length} more events
                </div>
              )}
            </div>
          </div>
        );
      })}

      {chains.length === 0 && (
        <div className="story-empty">No chains match the current filters.</div>
      )}
    </div>
  );
}

function ChainTimeline({
  chains,
  formatDuration,
  onPivotToEvent,
}: ChainTimelineProps) {
  const [expandedChains, setExpandedChains] = useState<Set<string>>(new Set());
  const [showFullChains, setShowFullChains] = useState<Set<string>>(new Set());

  const matchesEvent = (match: SigmaRuleMatch, event: LogEntry): boolean => {
    const matchEvent = match.event;
    if (!matchEvent) return false;

    // Exact object reference match (most reliable)
    if (matchEvent === event) return true;

    // Exact rawLine match (second most reliable)
    if (
      matchEvent.rawLine &&
      event.rawLine &&
      matchEvent.rawLine === event.rawLine
    )
      return true;

    // No other matching - timestamp+eventId matching is too unreliable
    // because different events can have the same eventId (e.g., multiple process creates)
    return false;
  };

  // Derive a SIGMA-focused subset: only matched events plus +/- neighborSpan context
  const getSigmaFocusedEvents = (
    chain: CorrelatedChain,
    neighborSpan: number = 2,
  ): { events: LogEntry[]; overflow: number } => {
    // If no matches, show all events
    if (chain.sigmaMatches.length === 0) {
      return { events: chain.events, overflow: 0 };
    }

    const indices = new Set<number>();
    chain.sigmaMatches.forEach((match) => {
      const matchEvent = match.event;
      const idx = chain.events.findIndex((e) => {
        if (!matchEvent) return false;

        // Exact object reference match
        if (e === matchEvent) return true;

        // Exact rawLine match
        if (e.rawLine && matchEvent.rawLine && e.rawLine === matchEvent.rawLine)
          return true;

        // No other matching - keep it strict
        return false;
      });
      if (idx >= 0) {
        for (
          let i = Math.max(0, idx - neighborSpan);
          i <= Math.min(chain.events.length - 1, idx + neighborSpan);
          i++
        ) {
          indices.add(i);
        }
      }
    });

    // If somehow no indices were found, show all events
    if (indices.size === 0) {
      return { events: chain.events, overflow: 0 };
    }

    const sorted = Array.from(indices).sort((a, b) => a - b);
    const events = sorted.map((i) => chain.events[i]);
    return { events, overflow: chain.events.length - events.length };
  };

  const toggleExpand = (chainId: string) => {
    setExpandedChains((prev) => {
      const next = new Set(prev);
      if (next.has(chainId)) {
        next.delete(chainId);
      } else {
        next.add(chainId);
      }
      return next;
    });
  };

  const getProcessName = (event: LogEntry): string | null => {
    const image =
      (event.eventData && event.eventData.Image) ||
      (() => {
        if (!event.rawLine) return null;
        const match = event.rawLine.match(
          /<Data Name="Image">([^<]+)<\/Data>/i,
        );
        return match ? match[1] : null;
      })();

    if (!image) return null;
    const parts = image.split(/[\\\/]/);
    return parts[parts.length - 1];
  };

  const formatTime = (date: Date | null | undefined) => {
    if (!date) return "Unknown";
    try {
      return date.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
    } catch {
      return "Invalid time";
    }
  };

  return (
    <div className="chain-timeline-container">
      {chains.length === 0 ? (
        <div className="no-chains">
          No event chains found matching the current filters.
        </div>
      ) : (
        <div className="timeline-list">
          {chains.map((chain) => {
            const isExpanded = expandedChains.has(chain.id);
            const useFull = showFullChains.has(chain.id);
            const sigmaFocus = useFull
              ? { events: chain.events, overflow: 0 }
              : getSigmaFocusedEvents(chain);
            const displayEvents = sigmaFocus.events;
            const overflowCount = sigmaFocus.overflow;

            return (
              <div
                key={chain.id}
                className={`timeline-chain ${isExpanded ? "expanded" : ""}`}
              >
                {/* Chain Header */}
                <div
                  className="timeline-chain-header"
                  onClick={() => toggleExpand(chain.id)}
                >
                  <div className="chain-info">
                    <span
                      className={`severity-badge severity-${chain.severity}`}
                    >
                      {chain.severity.toUpperCase()}
                    </span>
                    <span className="chain-events-count">
                      {chain.events.length} events
                    </span>
                    <span className="chain-duration">
                      {formatDuration(chain.duration)}
                    </span>
                    {chain.sigmaMatches.length > 0 && (
                      <span className="chain-sigma-count">
                        {chain.sigmaMatches.length} SIGMA
                      </span>
                    )}
                  </div>
                  <div className="chain-summary">{chain.summary}</div>
                  <span className="expand-indicator">
                    {isExpanded ? "−" : "+"}
                  </span>
                </div>

                {/* Timeline markers */}
                <div className="timeline-bar-container">
                  <div className="timeline-times">
                    <span>{formatTime(chain.startTime)}</span>
                    <span>{formatTime(chain.endTime)}</span>
                  </div>
                </div>

                {/* Expanded Events - Process Tree */}
                {isExpanded && (
                  <div className="timeline-events-expanded">
                    <div className="view-mode-toggle">
                      <button
                        onClick={() => {
                          setShowFullChains((prev) => {
                            const next = new Set(prev);
                            if (next.has(chain.id)) {
                              next.delete(chain.id);
                            } else {
                              next.add(chain.id);
                            }
                            return next;
                          });
                        }}
                      >
                        {useFull
                          ? "Show SIGMA context only"
                          : "Show full chain"}
                      </button>
                      {!useFull && overflowCount > 0 && (
                        <span className="overflow-note">
                          Showing {displayEvents.length} of{" "}
                          {chain.events.length} (SIGMA matches ± neighbors).{" "}
                          {overflowCount} hidden.
                        </span>
                      )}
                    </div>
                    <ProcessTree
                      chain={chain}
                      displayEvents={displayEvents}
                      overflowCount={overflowCount}
                      getProcessName={getProcessName}
                      formatTime={formatTime}
                      matchesEvent={matchesEvent}
                      onPivotToEvent={onPivotToEvent}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Process Tree Component
interface ProcessTreeProps {
  chain: CorrelatedChain;
  displayEvents: LogEntry[]; // capped list
  overflowCount: number;
  getProcessName: (event: LogEntry) => string | null;
  formatTime: (date: Date | null | undefined) => string;
  matchesEvent: (match: SigmaRuleMatch, event: LogEntry) => boolean;
  onPivotToEvent?: (entry: LogEntry) => void;
}

interface ProcessNode {
  process: string;
  events: LogEntry[];
  hasMatch: boolean;
  children: ProcessNode[];
  depth: number;
}

function ProcessTree({
  chain,
  displayEvents,
  overflowCount,
  getProcessName,
  formatTime,
  matchesEvent,
  onPivotToEvent,
}: ProcessTreeProps) {
  // Use the shared getEventField utility
  const getField = (event: LogEntry, fieldName: string): string | null =>
    getEventField(event, fieldName);

  /** Human-readable event type label */
  const getEventTypeLabel = (eventId: number | undefined): string => {
    if (!eventId) return "Unknown Event";
    return EVENT_TYPE_DESCRIPTIONS[eventId] || `Event ${eventId}`;
  };

  /** Extract MITRE ATT&CK technique IDs from SIGMA rule tags */
  const getMitreTags = (rules: SigmaRuleMatch[]): string[] => {
    const tags = new Set<string>();
    for (const rule of rules) {
      if (rule.rule.tags) {
        for (const tag of rule.rule.tags) {
          if (tag.startsWith("attack.t")) {
            tags.add(tag.replace("attack.", "").toUpperCase());
          }
        }
      }
    }
    return Array.from(tags);
  };

  // Build hierarchical process tree using ProcessGuid for accurate parent-child relationships
  const processTree = useMemo(() => {
    // First, collect all process instances with their GUIDs
    const processInstances = new Map<
      string,
      {
        processGuid: string;
        processName: string;
        parentProcessGuid: string | null;
        events: LogEntry[];
        hasMatch: boolean;
        firstTimestamp: number;
      }
    >();

    // Also track by process name for fallback grouping (non-process events)
    const nonGuidEvents = new Map<
      string,
      {
        processName: string;
        events: LogEntry[];
        hasMatch: boolean;
        firstTimestamp: number;
      }
    >();

    displayEvents.forEach((event) => {
      const processGuid = getField(event, "ProcessGuid");
      const parentProcessGuid = getField(event, "ParentProcessGuid");
      const processName = getProcessName(event) || `Event ${event.eventId}`;
      const hasMatch = chain.sigmaMatches.some((m) => {
        if (m.event === event) return true;
        if (
          m.event?.rawLine &&
          event.rawLine &&
          m.event.rawLine === event.rawLine
        )
          return true;
        // Safely handle timestamps with validation
        if (m.timestamp && event.timestamp) {
          try {
            const matchTime =
              m.timestamp instanceof Date
                ? m.timestamp.getTime()
                : new Date(m.timestamp).getTime();
            const eventTime =
              event.timestamp instanceof Date
                ? event.timestamp.getTime()
                : new Date(event.timestamp).getTime();
            return matchTime === eventTime;
          } catch {
            return false;
          }
        }
        return false;
      });

      if (processGuid) {
        // Use ProcessGuid as unique identifier
        const existing = processInstances.get(processGuid);
        if (existing) {
          existing.events.push(event);
          if (hasMatch) existing.hasMatch = true;
        } else {
          processInstances.set(processGuid, {
            processGuid,
            processName,
            parentProcessGuid,
            events: [event],
            hasMatch,
            firstTimestamp: event.timestamp
              ? event.timestamp instanceof Date
                ? event.timestamp.getTime()
                : new Date(event.timestamp).getTime()
              : 0,
          });
        }
      } else {
        // Fallback: group by process name for events without ProcessGuid
        const existing = nonGuidEvents.get(processName);
        if (existing) {
          existing.events.push(event);
          if (hasMatch) existing.hasMatch = true;
        } else {
          nonGuidEvents.set(processName, {
            processName,
            events: [event],
            hasMatch,
            firstTimestamp: event.timestamp
              ? event.timestamp instanceof Date
                ? event.timestamp.getTime()
                : new Date(event.timestamp).getTime()
              : 0,
          });
        }
      }
    });

    // Build tree structure
    const buildTree = (): ProcessNode[] => {
      const nodes = new Map<string, ProcessNode>();
      const rootNodes: ProcessNode[] = [];

      // Create nodes for all process instances (by GUID)
      processInstances.forEach((data, guid) => {
        nodes.set(guid, {
          process: data.processName,
          events: data.events,
          hasMatch: data.hasMatch,
          children: [],
          depth: 0,
        });
      });

      // Create nodes for non-GUID events (use process name as key with prefix)
      nonGuidEvents.forEach((data, name) => {
        const key = `_name_${name}`;
        nodes.set(key, {
          process: data.processName,
          events: data.events,
          hasMatch: data.hasMatch,
          children: [],
          depth: 0,
        });
      });

      // Establish parent-child relationships using ParentProcessGuid
      processInstances.forEach((data, guid) => {
        const node = nodes.get(guid);
        if (!node) return; // Skip if node not found

        const parentGuid = data.parentProcessGuid;

        if (parentGuid && nodes.has(parentGuid)) {
          const parentNode = nodes.get(parentGuid);
          if (parentNode) {
            parentNode.children.push(node);
          } else {
            rootNodes.push(node);
          }
        } else {
          rootNodes.push(node);
        }
      });

      // Add non-GUID events as root nodes
      nonGuidEvents.forEach((_, name) => {
        const key = `_name_${name}`;
        const node = nodes.get(key);
        if (node) {
          rootNodes.push(node);
        }
      });

      // Calculate depths and sort children by timestamp
      const setDepths = (
        node: ProcessNode,
        depth: number,
        maxDepth: number = 100,
      ) => {
        // Prevent infinite recursion
        if (depth > maxDepth) {
          console.warn(`Maximum process tree depth (${maxDepth}) exceeded`);
          return;
        }
        node.depth = depth;
        // Sort children by timestamp, with null safety
        node.children.sort((a, b) => {
          const aTime = a.events[0]?.timestamp;
          const bTime = b.events[0]?.timestamp;
          if (!aTime || !bTime) return 0;
          try {
            const aMs =
              aTime instanceof Date
                ? aTime.getTime()
                : new Date(aTime).getTime();
            const bMs =
              bTime instanceof Date
                ? bTime.getTime()
                : new Date(bTime).getTime();
            return aMs - bMs;
          } catch {
            return 0;
          }
        });
        node.children.forEach((child) => setDepths(child, depth + 1, maxDepth));
      };

      // Sort root nodes by timestamp with null safety
      rootNodes.sort((a, b) => {
        const aTime = a.events[0]?.timestamp;
        const bTime = b.events[0]?.timestamp;
        if (!aTime || !bTime) return 0;
        try {
          const aMs =
            aTime instanceof Date ? aTime.getTime() : new Date(aTime).getTime();
          const bMs =
            bTime instanceof Date ? bTime.getTime() : new Date(bTime).getTime();
          return aMs - bMs;
        } catch {
          return 0;
        }
      });
      rootNodes.forEach((root) => setDepths(root, 0));

      return rootNodes;
    };

    return buildTree();
  }, [chain, getProcessName]);

  // Flatten tree for rendering with depth info
  const flattenTree = (nodes: ProcessNode[]): ProcessNode[] => {
    const result: ProcessNode[] = [];
    const traverse = (node: ProcessNode) => {
      result.push(node);
      node.children.forEach(traverse);
    };
    nodes.forEach(traverse);
    return result;
  };

  const flatNodes = flattenTree(processTree);

  return (
    <div className="process-tree">
      {flatNodes.map((node, nodeIdx) => (
        <div
          key={nodeIdx}
          className={`process-group ${node.hasMatch ? "has-match" : ""}`}
          style={{ marginLeft: `${node.depth * 20}px` }}
        >
          <div className="process-content">
            <div className="process-header">
              <span className="process-icon">{node.hasMatch ? "!" : ">"}</span>
              <span className="process-name">{node.process}</span>
              <span className="process-event-count">
                {node.events.length} event{node.events.length > 1 ? "s" : ""}
              </span>
            </div>
            <div className="process-events">
              {node.events.map((event, eventIdx) => {
                const commandLine = getField(event, "CommandLine");
                const user = getField(event, "User");

                // Find all matching SIGMA rules for this event
                const matchingRules = chain.sigmaMatches.filter((m) =>
                  matchesEvent(m, event),
                );
                // Deduplicate by rule ID to avoid showing the same rule multiple times
                const uniqueMatchingRules = Array.from(
                  new Map(matchingRules.map((m) => [m.rule.id, m])).values(),
                );
                const hasMatch = uniqueMatchingRules.length > 0;

                // MITRE ATT&CK tags
                const mitreTags = hasMatch
                  ? getMitreTags(uniqueMatchingRules)
                  : [];

                // Core fields
                const image = getField(event, "Image");
                const parentImage = getField(event, "ParentImage");
                const parentCommandLine = getField(event, "ParentCommandLine");
                const hashes = getField(event, "Hashes");
                const integrityLevel = getField(event, "IntegrityLevel");
                const logonId = getField(event, "LogonId");
                const ruleName = getField(event, "RuleName");

                // Event-specific fields
                const targetObject = getField(event, "TargetObject");
                const details = getField(event, "Details");
                const destIp = getField(event, "DestinationIp");
                const destPort = getField(event, "DestinationPort");
                const destHostname = getField(event, "DestinationHostname");
                const sourceIp = getField(event, "SourceIp");
                const sourcePort = getField(event, "SourcePort");
                const protocol = getField(event, "Protocol");
                const initiated = getField(event, "Initiated");
                const targetFilename = getField(event, "TargetFilename");
                const imageLoaded = getField(event, "ImageLoaded");
                const signature = getField(event, "Signature");
                const signed = getField(event, "Signed");
                const sourceImage = getField(event, "SourceImage");
                const targetImage = getField(event, "TargetImage");
                const grantedAccess = getField(event, "GrantedAccess");
                const callTrace = getField(event, "CallTrace");
                const queryName = getField(event, "QueryName");
                const queryResults = getField(event, "QueryResults");
                const pipeName = getField(event, "PipeName");
                const startFunction = getField(event, "StartFunction");
                const startModule = getField(event, "StartModule");
                const newThreadId = getField(event, "NewThreadId");

                // Event type label
                const eventTypeLabel = getEventTypeLabel(event.eventId);

                return (
                  <div
                    key={eventIdx}
                    className={`process-event ${hasMatch ? "has-match" : ""}`}
                    onClick={() => onPivotToEvent?.(event)}
                    style={{ cursor: onPivotToEvent ? "pointer" : undefined }}
                    title={
                      onPivotToEvent
                        ? "Click to view full event details"
                        : undefined
                    }
                  >
                    <div className="event-header">
                      <div className="event-meta">
                        <span className="event-type-label">
                          {eventTypeLabel}
                        </span>
                        <span className="event-id">EID {event.eventId}</span>
                        <span className="event-time">
                          {formatTime(event.timestamp)}
                        </span>
                      </div>
                      {hasMatch && (
                        <span className="sigma-badge-wrapper">
                          <span className="sigma-badge">SIGMA</span>
                          <span className="sigma-tooltip">
                            {uniqueMatchingRules.map((m, idx) => (
                              <span key={idx} className="rule-line">
                                <strong>{m.rule.title}</strong>
                                {m.rule.level && (
                                  <span className="rule-level">
                                    {" "}
                                    [{m.rule.level}]
                                  </span>
                                )}
                                {m.rule.description && (
                                  <span className="rule-desc">
                                    {m.rule.description}
                                  </span>
                                )}
                              </span>
                            ))}
                          </span>
                        </span>
                      )}
                      {mitreTags.length > 0 && (
                        <span className="mitre-tags">
                          {mitreTags.map((tag, i) => (
                            <span key={i} className="mitre-tag">
                              {tag}
                            </span>
                          ))}
                        </span>
                      )}
                    </div>
                    {/* Process info */}
                    {image && (
                      <div
                        className="event-detail"
                        title={image}
                        style={{ wordBreak: "break-all" }}
                      >
                        <span className="detail-label">Image:</span> {image}
                      </div>
                    )}
                    {commandLine && (
                      <div
                        className="event-detail event-detail-cmd"
                        title={commandLine}
                        style={{ wordBreak: "break-all" }}
                      >
                        <span className="detail-label">CMD:</span> {commandLine}
                      </div>
                    )}
                    {parentImage && (
                      <div
                        className="event-detail"
                        title={parentImage}
                        style={{ wordBreak: "break-all" }}
                      >
                        <span className="detail-label">Parent:</span>{" "}
                        {parentImage}
                      </div>
                    )}
                    {parentCommandLine && parentCommandLine !== commandLine && (
                      <div
                        className="event-detail"
                        title={parentCommandLine}
                        style={{ wordBreak: "break-all" }}
                      >
                        <span className="detail-label">Parent CMD:</span>{" "}
                        {parentCommandLine}
                      </div>
                    )}
                    {/* Process access specifics */}
                    {sourceImage && event.eventId === 10 && (
                      <div
                        className="event-detail"
                        title={sourceImage}
                        style={{ wordBreak: "break-all" }}
                      >
                        <span className="detail-label">Source:</span>{" "}
                        {sourceImage}
                      </div>
                    )}
                    {targetImage && (
                      <div
                        className="event-detail"
                        title={targetImage}
                        style={{ wordBreak: "break-all" }}
                      >
                        <span className="detail-label">Target:</span>{" "}
                        {targetImage}
                      </div>
                    )}
                    {grantedAccess && (
                      <div className="event-detail">
                        <span className="detail-label">Access:</span>{" "}
                        {grantedAccess}
                      </div>
                    )}
                    {callTrace && (
                      <div
                        className="event-detail"
                        title={callTrace}
                        style={{ wordBreak: "break-all" }}
                      >
                        <span className="detail-label">CallTrace:</span>{" "}
                        {callTrace.length > 120
                          ? callTrace.slice(0, 120) + "..."
                          : callTrace}
                      </div>
                    )}
                    {/* Remote thread specifics */}
                    {startModule && (
                      <div
                        className="event-detail"
                        title={startModule}
                        style={{ wordBreak: "break-all" }}
                      >
                        <span className="detail-label">StartModule:</span>{" "}
                        {startModule}
                      </div>
                    )}
                    {startFunction && (
                      <div className="event-detail">
                        <span className="detail-label">StartFunction:</span>{" "}
                        {startFunction}
                      </div>
                    )}
                    {newThreadId && (
                      <div className="event-detail">
                        <span className="detail-label">ThreadId:</span>{" "}
                        {newThreadId}
                      </div>
                    )}
                    {/* Network specifics */}
                    {destIp && (
                      <div className="event-detail">
                        <span className="detail-label">Dest:</span> {destIp}
                        {destPort ? `:${destPort}` : ""}
                        {destHostname ? ` (${destHostname})` : ""}
                        {protocol ? ` [${protocol}]` : ""}
                      </div>
                    )}
                    {sourceIp && (
                      <div className="event-detail">
                        <span className="detail-label">Source:</span> {sourceIp}
                        {sourcePort ? `:${sourcePort}` : ""}
                      </div>
                    )}
                    {initiated && (
                      <div className="event-detail">
                        <span className="detail-label">Initiated:</span>{" "}
                        {initiated}
                      </div>
                    )}
                    {/* DNS specifics */}
                    {queryName && (
                      <div className="event-detail">
                        <span className="detail-label">DNS Query:</span>{" "}
                        {queryName}
                      </div>
                    )}
                    {queryResults && (
                      <div
                        className="event-detail"
                        title={queryResults}
                        style={{ wordBreak: "break-all" }}
                      >
                        <span className="detail-label">DNS Result:</span>{" "}
                        {queryResults}
                      </div>
                    )}
                    {/* Registry specifics */}
                    {targetObject && (
                      <div
                        className="event-detail"
                        title={targetObject}
                        style={{ wordBreak: "break-all" }}
                      >
                        <span className="detail-label">Registry:</span>{" "}
                        {targetObject}
                      </div>
                    )}
                    {details && (
                      <div
                        className="event-detail"
                        title={details}
                        style={{ wordBreak: "break-all" }}
                      >
                        <span className="detail-label">Value:</span> {details}
                      </div>
                    )}
                    {/* File specifics */}
                    {targetFilename && (
                      <div
                        className="event-detail"
                        title={targetFilename}
                        style={{ wordBreak: "break-all" }}
                      >
                        <span className="detail-label">File:</span>{" "}
                        {targetFilename}
                      </div>
                    )}
                    {/* Image/DLL loaded */}
                    {imageLoaded && (
                      <div
                        className="event-detail"
                        title={imageLoaded}
                        style={{ wordBreak: "break-all" }}
                      >
                        <span className="detail-label">Loaded:</span>{" "}
                        {imageLoaded}
                        {signed
                          ? ` [${signed === "true" ? "Signed" : "Unsigned"}]`
                          : ""}
                      </div>
                    )}
                    {signature && signed !== "true" && (
                      <div className="event-detail">
                        <span className="detail-label">Signature:</span>{" "}
                        {signature}
                      </div>
                    )}
                    {/* Pipe */}
                    {pipeName && (
                      <div className="event-detail">
                        <span className="detail-label">Pipe:</span> {pipeName}
                      </div>
                    )}
                    {/* Hashes, integrity, etc. */}
                    {hashes && (
                      <div
                        className="event-detail"
                        title={hashes}
                        style={{ wordBreak: "break-all" }}
                      >
                        <span className="detail-label">Hashes:</span> {hashes}
                      </div>
                    )}
                    {/* Context bar: integrity + user + logonId + rule */}
                    {(user || integrityLevel || logonId || ruleName) && (
                      <div className="event-context-bar">
                        {user && (
                          <span className="context-item">
                            <span className="detail-label">User:</span> {user}
                          </span>
                        )}
                        {integrityLevel && (
                          <span className="context-item">
                            <span className="detail-label">Integrity:</span>{" "}
                            {integrityLevel}
                          </span>
                        )}
                        {logonId && (
                          <span className="context-item">
                            <span className="detail-label">LogonId:</span>{" "}
                            {logonId}
                          </span>
                        )}
                        {ruleName && (
                          <span className="context-item">
                            <span className="detail-label">Rule:</span>{" "}
                            {ruleName}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ))}
      {overflowCount > 0 && (
        <div className="process-event overflow-note">
          + {overflowCount} more event{overflowCount > 1 ? "s" : ""} not shown
          in this chain
        </div>
      )}
    </div>
  );
}
