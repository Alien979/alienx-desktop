import React, { useMemo, useCallback } from "react";

/** All 14 ATT&CK Enterprise tactics in kill-chain order */
const MITRE_TACTICS: { id: string; name: string }[] = [
  { id: "reconnaissance", name: "Recon" },
  { id: "resource-development", name: "Resource Dev" },
  { id: "initial-access", name: "Initial Access" },
  { id: "execution", name: "Execution" },
  { id: "persistence", name: "Persistence" },
  { id: "privilege-escalation", name: "Priv Esc" },
  { id: "defense-evasion", name: "Def Evasion" },
  { id: "credential-access", name: "Cred Access" },
  { id: "discovery", name: "Discovery" },
  { id: "lateral-movement", name: "Lateral Mvmt" },
  { id: "collection", name: "Collection" },
  { id: "command-and-control", name: "C2" },
  { id: "exfiltration", name: "Exfiltration" },
  { id: "impact", name: "Impact" },
];

interface MitreHeatmapProps {
  /** Array of SIGMA rule tag strings, e.g. ["attack.execution", "attack.t1059.001"] */
  tags: string[];
}

export const MitreHeatmap: React.FC<MitreHeatmapProps> = ({ tags }) => {
  const { tacticCounts, techniques } = useMemo(() => {
    const tCounts: Record<string, number> = {};
    const techCounts: Record<string, number> = {};

    for (const tag of tags) {
      const lower = tag.toLowerCase().replace("attack.", "");

      // Tactic?
      if (MITRE_TACTICS.some((t) => t.id === lower)) {
        tCounts[lower] = (tCounts[lower] || 0) + 1;
      }

      // Technique? (T####, T####.###)
      const m = lower.match(/^t(\d{4})(\.\d{3})?$/);
      if (m) {
        const id = `T${m[1]}${m[2] || ""}`.toUpperCase();
        techCounts[id] = (techCounts[id] || 0) + 1;
      }
    }

    return {
      tacticCounts: tCounts,
      techniques: Object.entries(techCounts).sort((a, b) =>
        a[0].localeCompare(b[0]),
      ),
    };
  }, [tags]);

  const maxCount = Math.max(1, ...Object.values(tacticCounts));

  const getColor = (count: number): string => {
    if (count === 0) return "rgba(255,255,255,0.03)";
    const ratio = count / maxCount;
    if (ratio > 0.7) return "rgba(239,68,68,0.7)";
    if (ratio > 0.4) return "rgba(249,115,22,0.55)";
    if (ratio > 0.15) return "rgba(234,179,8,0.45)";
    return "rgba(74,167,65,0.35)";
  };

  const activeTactics = Object.keys(tacticCounts).length;

  const exportNavigatorLayer = useCallback(() => {
    const layer = {
      name: "ALIENX SIGMA Detections",
      versions: { attack: "14", navigator: "4.9.1", layer: "4.5" },
      domain: "enterprise-attack",
      description: `Auto-generated from ALIENX SIGMA analysis — ${techniques.length} techniques across ${Object.keys(tacticCounts).length} tactics`,
      gradient: {
        colors: ["#ce0f0f80", "#ce840f80", "#cec60f80"],
        minValue: 0,
        maxValue: Math.max(1, ...techniques.map(([, c]) => c)),
      },
      legendItems: [],
      showTacticRowBackground: true,
      tacticRowBackground: "#20262990",
      techniques: techniques.map(([id, score]) => ({
        techniqueID: id,
        score,
        color: "",
        comment: `Matched by ${score} SIGMA rule${score > 1 ? "s" : ""}`,
        enabled: true,
        showSubtechniques: id.includes("."),
      })),
    };
    const blob = new Blob([JSON.stringify(layer, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "alienx-navigator-layer.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 150);
  }, [techniques, tacticCounts]);

  if (tags.length === 0) return null;

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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "0.75rem",
        }}
      >
        <h4
          style={{
            color: "#00f0ff",
            fontSize: "0.95rem",
            fontWeight: 600,
            margin: 0,
          }}
        >
          MITRE ATT&CK Coverage — {techniques.length} Technique
          {techniques.length !== 1 ? "s" : ""} across {activeTactics} Tactic
          {activeTactics !== 1 ? "s" : ""}
        </h4>
        <button
          onClick={exportNavigatorLayer}
          title="Export as ATT&CK Navigator layer JSON"
          style={{
            background: "rgba(0,240,255,0.08)",
            border: "1px solid rgba(0,240,255,0.25)",
            borderRadius: 6,
            color: "#00c8ff",
            cursor: "pointer",
            fontSize: "0.78rem",
            padding: "4px 12px",
            fontFamily: "inherit",
          }}
        >
          📤 Export Navigator Layer
        </button>
      </div>

      {/* Tactic Heatmap Row */}
      <div
        style={{
          display: "flex",
          gap: "3px",
          flexWrap: "wrap",
          marginBottom: "0.75rem",
        }}
      >
        {MITRE_TACTICS.map(({ id, name }) => {
          const count = tacticCounts[id] || 0;
          return (
            <div
              key={id}
              title={`${name}: ${count} rule${count !== 1 ? "s" : ""} matched`}
              style={{
                flex: "1 1 0",
                minWidth: "65px",
                padding: "8px 4px",
                backgroundColor: getColor(count),
                borderRadius: "4px",
                textAlign: "center",
                border:
                  count > 0
                    ? "1px solid rgba(255,255,255,0.15)"
                    : "1px solid rgba(255,255,255,0.04)",
                transition: "transform 0.15s, box-shadow 0.15s",
                cursor: "default",
              }}
            >
              <div
                style={{
                  fontSize: "0.6rem",
                  color: count > 0 ? "#fff" : "#555",
                  fontWeight: count > 0 ? 600 : 400,
                  lineHeight: 1.2,
                }}
              >
                {name}
              </div>
              {count > 0 && (
                <div
                  style={{
                    fontSize: "1rem",
                    fontWeight: 700,
                    color: "#fff",
                    marginTop: "2px",
                  }}
                >
                  {count}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Technique Badges */}
      {techniques.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
          {techniques.map(([id, count]) => (
            <a
              key={id}
              href={`https://attack.mitre.org/techniques/${id.replace(".", "/")}/`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: "2px 8px",
                borderRadius: "3px",
                fontSize: "0.75rem",
                fontFamily: "monospace",
                backgroundColor: "rgba(0,240,255,0.08)",
                color: "#00c8ff",
                border: "1px solid rgba(0,240,255,0.25)",
                textDecoration: "none",
              }}
              title={`${id} — ${count} rule${count > 1 ? "s" : ""}. Click to view on MITRE ATT&CK`}
            >
              {id}
              {count > 1 ? ` ×${count}` : ""}
            </a>
          ))}
        </div>
      )}

      {/* Top Techniques Ranked Table */}
      {techniques.length > 0 && (
        <div
          style={{
            marginTop: "0.75rem",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: "4px",
          }}
        >
          {techniques
            .slice()
            .sort((a, b) => b[1] - a[1])
            .slice(0, 12)
            .map(([id, count]) => {
              const maxTech = techniques.reduce((m, t) => Math.max(m, t[1]), 1);
              const pct = (count / maxTech) * 100;
              return (
                <div
                  key={`rank-${id}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    fontSize: "0.75rem",
                    fontFamily: "monospace",
                    padding: "3px 6px",
                    borderRadius: "4px",
                    background: "rgba(255,255,255,0.02)",
                  }}
                >
                  <a
                    href={`https://attack.mitre.org/techniques/${id.replace(".", "/")}/`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: "#00c8ff",
                      textDecoration: "none",
                      minWidth: "70px",
                    }}
                  >
                    {id}
                  </a>
                  <div
                    style={{
                      flex: 1,
                      height: "6px",
                      borderRadius: "3px",
                      background: "rgba(255,255,255,0.06)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${pct}%`,
                        height: "100%",
                        borderRadius: "3px",
                        background:
                          pct > 70
                            ? "rgba(239,68,68,0.7)"
                            : pct > 40
                              ? "rgba(249,115,22,0.6)"
                              : "rgba(0,200,255,0.5)",
                      }}
                    />
                  </div>
                  <span
                    style={{
                      color: "#aaa",
                      minWidth: "28px",
                      textAlign: "right",
                    }}
                  >
                    {count}
                  </span>
                </div>
              );
            })}
        </div>
      )}

      {/* Legend */}
      <div
        style={{
          display: "flex",
          gap: "12px",
          marginTop: "0.75rem",
          fontSize: "0.68rem",
          color: "#666",
          alignItems: "center",
        }}
      >
        <span>Coverage:</span>
        {[
          { bg: "rgba(255,255,255,0.03)", label: "None" },
          { bg: "rgba(74,167,65,0.35)", label: "Low" },
          { bg: "rgba(234,179,8,0.45)", label: "Medium" },
          { bg: "rgba(249,115,22,0.55)", label: "High" },
          { bg: "rgba(239,68,68,0.7)", label: "Critical" },
        ].map(({ bg, label }) => (
          <span
            key={label}
            style={{ display: "flex", alignItems: "center", gap: "3px" }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                backgroundColor: bg,
                display: "inline-block",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
};

export default MitreHeatmap;
