import { useMemo } from "react";

interface EventCompareProps {
  eventA: any;
  eventB: any;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Flatten an event object into key–value pairs for comparison.
 */
function flatten(obj: any, prefix = ""): Record<string, string> {
  const result: Record<string, string> = {};
  if (!obj || typeof obj !== "object") return result;
  const visited = new WeakSet();
  const walk = (o: any, pfx: string, depth = 0) => {
    if (!o || typeof o !== "object" || depth > 10) return;
    if (visited.has(o)) return;
    visited.add(o);
    for (const [k, v] of Object.entries(o)) {
      const key = pfx ? `${pfx}.${k}` : k;
      if (v != null && typeof v === "object" && !Array.isArray(v)) {
        walk(v, key, depth + 1);
      } else {
        result[key] = Array.isArray(v) ? v.join(", ") : String(v ?? "");
      }
    }
  };
  walk(obj, prefix);
  return result;
}

export function EventCompare({ eventA, eventB, isOpen, onClose }: EventCompareProps) {
  const diff = useMemo(() => {
    if (!eventA || !eventB) return [];
    const a = flatten(eventA);
    const b = flatten(eventB);
    const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...allKeys]
      .sort()
      .map((k) => ({
        key: k,
        valA: a[k] ?? "",
        valB: b[k] ?? "",
        same: (a[k] ?? "") === (b[k] ?? ""),
      }));
  }, [eventA, eventB]);

  if (!isOpen || !eventA || !eventB) return null;

  const diffs = diff.filter((d) => !d.same).length;

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 10000,
        background: "rgba(0,0,0,0.7)", display: "flex",
        alignItems: "center", justifyContent: "center",
      }}
    >
      <div style={{
        background: "var(--bg-secondary, #1a1a2e)", borderRadius: 12,
        border: "1px solid rgba(0,240,255,0.2)", width: "90vw", maxWidth: 1100,
        maxHeight: "85vh", display: "flex", flexDirection: "column",
        boxShadow: "0 16px 64px rgba(0,0,0,0.6)",
      }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "1rem 1.25rem", borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}>
          <h2 style={{ margin: 0, fontSize: "1.1rem", color: "#e4e4e7" }}>
            ⚖️ Side-by-Side Comparison
            <span style={{ fontSize: "0.78rem", color: "#888", marginLeft: 12 }}>
              {diffs} difference{diffs !== 1 ? "s" : ""} / {diff.length} fields
            </span>
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "none", color: "#888",
              fontSize: "1.2rem", cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ overflow: "auto", flex: 1, padding: "0.75rem 1.25rem" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem", fontFamily: "monospace" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                <th style={{ textAlign: "left", padding: "6px 8px", color: "#888", width: "22%" }}>Field</th>
                <th style={{ textAlign: "left", padding: "6px 8px", color: "#00c8ff", width: "39%" }}>
                  Event A {eventA.eventId ? `(ID: ${eventA.eventId})` : ""}
                </th>
                <th style={{ textAlign: "left", padding: "6px 8px", color: "#a855f7", width: "39%" }}>
                  Event B {eventB.eventId ? `(ID: ${eventB.eventId})` : ""}
                </th>
              </tr>
            </thead>
            <tbody>
              {diff.map((row) => (
                <tr
                  key={row.key}
                  style={{
                    borderBottom: "1px solid rgba(255,255,255,0.03)",
                    background: row.same ? "transparent" : "rgba(239,68,68,0.05)",
                  }}
                >
                  <td style={{ padding: "5px 8px", color: "#888", wordBreak: "break-all" }}>{row.key}</td>
                  <td style={{
                    padding: "5px 8px", color: row.same ? "#aaa" : "#00c8ff",
                    wordBreak: "break-all", maxWidth: 0,
                  }}>
                    {row.valA || <span style={{ color: "#555", fontStyle: "italic" }}>—</span>}
                  </td>
                  <td style={{
                    padding: "5px 8px", color: row.same ? "#aaa" : "#a855f7",
                    wordBreak: "break-all", maxWidth: 0,
                  }}>
                    {row.valB || <span style={{ color: "#555", fontStyle: "italic" }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{
          padding: "0.75rem 1.25rem", borderTop: "1px solid rgba(255,255,255,0.08)",
          display: "flex", justifyContent: "flex-end",
        }}>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,0.05)", border: "1px solid #444",
              borderRadius: 6, padding: "6px 18px", cursor: "pointer",
              color: "#ccc", fontSize: "0.85rem", fontFamily: "inherit",
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
