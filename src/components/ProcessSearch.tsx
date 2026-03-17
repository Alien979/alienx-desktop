import React, { useState, useMemo } from "react";

interface ProcessSearchProps {
  /** All process events (Sysmon EID 1 / Security EID 4688) already extracted. */
  processNames: string[];
  /** Callback when user selects a process name in the search results */
  onSelectProcess: (name: string) => void;
}

/**
 * Searchable filter bar for the Process Execution Dashboard.
 * Lets analysts find specific processes by name or partial match.
 */
export const ProcessSearch: React.FC<ProcessSearchProps> = ({
  processNames,
  onSelectProcess,
}) => {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const results = useMemo(() => {
    if (!query.trim() || query.length < 2) return [];
    const q = query.toLowerCase();
    // Deduplicate and filter
    const seen = new Set<string>();
    const matches: { name: string; count: number }[] = [];
    const countMap = new Map<string, number>();

    for (const p of processNames) {
      const lower = p.toLowerCase();
      countMap.set(lower, (countMap.get(lower) || 0) + 1);
    }

    for (const [lower, count] of countMap) {
      if (lower.includes(q) && !seen.has(lower)) {
        seen.add(lower);
        // Get original casing
        const original =
          processNames.find((n) => n.toLowerCase() === lower) ?? lower;
        matches.push({ name: original, count });
      }
    }

    return matches.sort((a, b) => b.count - a.count).slice(0, 25);
  }, [processNames, query]);

  return (
    <div
      style={{
        padding: "8px 12px",
        backgroundColor: "rgba(96,165,250,0.06)",
        borderRadius: "6px",
        marginBottom: "12px",
        border: "1px solid rgba(96,165,250,0.15)",
        position: "relative",
      }}
    >
      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        <span style={{ color: "#888", fontSize: "0.9rem" }}>🔎</span>
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder="Search processes by name (e.g. powershell, cmd, mimikatz)..."
          style={{
            flex: 1,
            padding: "7px 12px",
            backgroundColor: "#12121f",
            border: "1px solid #333",
            borderRadius: "5px",
            color: "#e0e0e0",
            fontSize: "0.85rem",
            outline: "none",
          }}
        />
        {query && (
          <button
            onClick={() => {
              setQuery("");
              setIsOpen(false);
            }}
            style={{
              background: "none",
              border: "none",
              color: "#888",
              cursor: "pointer",
              fontSize: "0.9rem",
              padding: "4px 8px",
            }}
          >
            ✕
          </button>
        )}
      </div>

      {isOpen && results.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            zIndex: 50,
            marginTop: "4px",
            maxHeight: "260px",
            overflowY: "auto",
            backgroundColor: "#16162a",
            border: "1px solid #333",
            borderRadius: "6px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          }}
        >
          <div
            style={{
              padding: "6px 12px",
              color: "#777",
              fontSize: "0.75rem",
              borderBottom: "1px solid #222",
            }}
          >
            {results.length} match{results.length !== 1 ? "es" : ""}
          </div>
          {results.map(({ name, count }) => {
            const display = name.split("\\").pop() || name;
            return (
              <div
                key={name}
                onClick={() => {
                  onSelectProcess(display);
                  setIsOpen(false);
                  setQuery("");
                }}
                style={{
                  padding: "6px 12px",
                  cursor: "pointer",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLElement).style.backgroundColor =
                    "rgba(96,165,250,0.1)")
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLElement).style.backgroundColor =
                    "transparent")
                }
              >
                <span style={{ color: "#60a5fa", fontWeight: 600 }}>
                  {display}
                </span>
                <span style={{ color: "#666", fontSize: "0.8rem" }}>
                  {count}×
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Backdrop to close dropdown */}
      {isOpen && results.length > 0 && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 49,
          }}
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
};

export default ProcessSearch;
