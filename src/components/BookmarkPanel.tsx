import { useState, useMemo } from "react";
import { LogEntry } from "../types";
import {
  getBookmarks,
  getIOCBookmarks,
  removeBookmark,
  removeIOCBookmark,
  clearBookmarks,
  EventBookmark,
  IOCBookmark,
  BookmarkTag,
  BOOKMARK_TAGS,
  BOOKMARK_COLORS,
  addBookmark,
  addIOCBookmark,
} from "../lib/eventBookmarks";
import { EventCompare } from "./EventCompare";

interface BookmarkPanelProps {
  entries: LogEntry[];
  onClose: () => void;
  onPivotToEvent?: (entry: LogEntry) => void;
}

type SortKey = "time" | "tag" | "added";
type BookmarkType = "events" | "iocs" | "all";

export default function BookmarkPanel({
  entries,
  onClose,
  onPivotToEvent,
}: BookmarkPanelProps) {
  const [filterTag, setFilterTag] = useState<BookmarkTag | "all">("all");
  const [sortBy, setSortBy] = useState<SortKey>("added");
  const [bookmarkType, setBookmarkType] = useState<BookmarkType>("all");
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editNote, setEditNote] = useState("");
  const [bookmarkVersion, setBookmarkVersion] = useState(0);
  const [compareA, setCompareA] = useState<LogEntry | null>(null);
  const [compareB, setCompareB] = useState<LogEntry | null>(null);
  const [showCompare, setShowCompare] = useState(false);

  // Re-read bookmarks when version bumps (after add/remove/edit)
  const eventBookmarks = useMemo(() => getBookmarks(), [bookmarkVersion]);
  const iocBookmarks = useMemo(() => getIOCBookmarks(), [bookmarkVersion]);
  const allBookmarks = useMemo(
    () => [...eventBookmarks, ...iocBookmarks],
    [eventBookmarks, iocBookmarks],
  );

  const findEntry = (bk: EventBookmark): LogEntry | null => {
    // eventIndex is a hash code (not an array index), so search by matching
    // the bookmark's stored timestamp and eventId against the entries array
    const bkTime = bk.timestamp;
    const bkEid = bk.eventId;
    return (
      entries.find((e) => {
        const eid = String(e.eventId || "");
        const ts = String(e.timestamp || "");
        return eid === bkEid && ts === bkTime;
      }) ?? null
    );
  };

  const isEventBookmark = (bk: any): bk is EventBookmark =>
    "eventIndex" in bk && "eventId" in bk;
  const isIOCBookmark = (bk: any): bk is IOCBookmark =>
    "ioc" in bk && "iocType" in bk;

  const filtered = useMemo(() => {
    let list = [...allBookmarks];

    // Filter by bookmark type
    if (bookmarkType === "events") {
      list = list.filter(isEventBookmark);
    } else if (bookmarkType === "iocs") {
      list = list.filter(isIOCBookmark);
    }

    if (filterTag !== "all") {
      list = list.filter((b) => b.tag === filterTag);
    }

    if (sortBy === "time") {
      list.sort((a, b) => {
        const timeA = isEventBookmark(a) ? a.timestamp : a.createdAt;
        const timeB = isEventBookmark(b) ? b.timestamp : b.createdAt;
        return new Date(timeA).getTime() - new Date(timeB).getTime();
      });
    } else if (sortBy === "tag") {
      const order: BookmarkTag[] = [
        "malicious",
        "suspicious",
        "investigate",
        "evidence",
        "benign",
      ];
      list.sort((a, b) => order.indexOf(a.tag) - order.indexOf(b.tag));
    }
    // "added" = default insertion order
    return list;
  }, [allBookmarks, filterTag, sortBy, bookmarkType]);

  const handleRemove = (bk: EventBookmark | IOCBookmark) => {
    if (isEventBookmark(bk)) {
      removeBookmark(bk.eventIndex);
    } else {
      removeIOCBookmark(bk.ioc, bk.iocType);
    }
    setBookmarkVersion((v) => v + 1);
  };

  const handleClearAll = () => {
    if (
      allBookmarks.length > 0 &&
      confirm(`Remove all ${allBookmarks.length} bookmarks?`)
    ) {
      clearBookmarks();
      setBookmarkVersion((v) => v + 1);
    }
  };

  const handleSaveNote = (bk: EventBookmark | IOCBookmark) => {
    if (isEventBookmark(bk)) {
      addBookmark({ ...bk, note: editNote });
    } else {
      addIOCBookmark({ ...bk, note: editNote });
    }
    setEditingIdx(null);
    setBookmarkVersion((v) => v + 1);
  };

  const handleCopyAll = async () => {
    const text = filtered
      .map((bk) => {
        const tag = bk.tag.toUpperCase();
        const note = bk.note ? ` — ${bk.note}` : "";

        if (isEventBookmark(bk)) {
          const entry = findEntry(bk);
          const time = bk.timestamp || "?";
          const eid = bk.eventId || "?";
          const source = entry?.sourceFile || "";
          return `[${tag}] EID ${eid} @ ${time}${source ? ` (${source})` : ""}${note}`;
        } else {
          return `[${tag}] IOC ${bk.ioc} (${bk.iocType}, ${bk.eventCount} events)${note}`;
        }
      })
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      alert("Could not copy to clipboard. Please grant clipboard permission.");
    }
  };

  const handleExportBookmarksCSV = () => {
    if (filtered.length === 0) {
      alert("No bookmarks to export.");
      return;
    }
    const quote = (value: string | number) =>
      `"${String(value || "").replace(/"/g, '""')}"`;
    const rows = [
      "type,tag,event_id,timestamp,source_file,ioc,ioc_type,event_count,note",
    ];
    for (const bk of filtered) {
      if (isEventBookmark(bk)) {
        const entry = findEntry(bk);
        rows.push(
          [
            "event",
            bk.tag,
            bk.eventId,
            bk.timestamp,
            entry?.sourceFile || "",
            "",
            "",
            "",
            bk.note || "",
          ]
            .map(quote)
            .join(","),
        );
      } else {
        rows.push(
          [
            "ioc",
            bk.tag,
            "",
            "",
            "",
            bk.ioc,
            bk.iocType,
            bk.eventCount,
            bk.note || "",
          ]
            .map(quote)
            .join(","),
        );
      }
    }
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bookmarks.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportBookmarksSTIX = () => {
    if (filtered.length === 0) {
      alert("No bookmarks to export.");
      return;
    }
    const now = new Date().toISOString();
    const objects = filtered.map((bk) => {
      if (isEventBookmark(bk)) {
        const entry = findEntry(bk);
        return {
          type: "x-oca-event",
          spec_version: "2.1",
          id: `x-oca-event--${crypto.randomUUID()}`,
          created: now,
          modified: now,
          event_id: bk.eventId,
          timestamp: bk.timestamp,
          labels: ["alienx-bookmark", `bookmark:${bk.tag}`],
          note: bk.note || "",
          source_file: entry?.sourceFile || "",
          raw: entry?.rawLine || "",
        };
      } else {
        return {
          type: "x-ioc-indicator",
          spec_version: "2.1",
          id: `x-ioc-indicator--${crypto.randomUUID()}`,
          created: now,
          modified: now,
          value: bk.ioc,
          indicator_type: bk.iocType,
          labels: ["alienx-bookmark", `bookmark:${bk.tag}`],
          note: bk.note || "",
          event_count: bk.eventCount,
        };
      }
    });
    const json = JSON.stringify(
      {
        type: "bundle",
        id: `bundle--${crypto.randomUUID()}`,
        objects,
      },
      null,
      2,
    );
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bookmarks.stix.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleCompare = (entry: LogEntry | null) => {
    if (!entry) return;
    if (compareA === entry) {
      setCompareA(null);
      return;
    }
    if (compareB === entry) {
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
    setCompareB(entry);
    setShowCompare(true);
  };

  const formatTimestamp = (ts: string) => {
    try {
      const d = new Date(ts);
      return d.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
    } catch {
      return ts;
    }
  };

  return (
    <div
      className="feedback-modal-backdrop"
      onClick={onClose}
      style={{ zIndex: 2000 }}
    >
      <div
        className="feedback-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 560,
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <h3 style={{ margin: 0 }}>🔖 Bookmarks ({allBookmarks.length})</h3>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "#aaa",
              fontSize: "1.2rem",
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>

        {/* Controls */}
        <div
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 10,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <select
            value={bookmarkType}
            onChange={(e) => setBookmarkType(e.target.value as BookmarkType)}
            style={{
              padding: "4px 8px",
              borderRadius: 4,
              background: "#1e1e2e",
              color: "#eee",
              border: "1px solid #444",
              fontSize: "0.8rem",
            }}
          >
            <option value="all">All Bookmarks</option>
            <option value="events">
              Events Only ({eventBookmarks.length})
            </option>
            <option value="iocs">IOCs Only ({iocBookmarks.length})</option>
          </select>
          <select
            value={filterTag}
            onChange={(e) =>
              setFilterTag(e.target.value as BookmarkTag | "all")
            }
            style={{
              padding: "4px 8px",
              borderRadius: 4,
              background: "#1e1e2e",
              color: "#eee",
              border: "1px solid #444",
              fontSize: "0.8rem",
            }}
          >
            <option value="all">All Tags</option>
            {BOOKMARK_TAGS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.icon} {t.label}
              </option>
            ))}
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            style={{
              padding: "4px 8px",
              borderRadius: 4,
              background: "#1e1e2e",
              color: "#eee",
              border: "1px solid #444",
              fontSize: "0.8rem",
            }}
          >
            <option value="added">Sort: Added</option>
            <option value="time">Sort: Time</option>
            <option value="tag">Sort: Tag</option>
          </select>
          <button
            onClick={handleCopyAll}
            disabled={filtered.length === 0}
            style={{
              padding: "4px 10px",
              borderRadius: 4,
              background: "rgba(96,165,250,0.15)",
              color: "#60a5fa",
              border: "1px solid rgba(96,165,250,0.3)",
              cursor: filtered.length ? "pointer" : "default",
              fontSize: "0.8rem",
            }}
          >
            Copy All
          </button>
          <button
            onClick={handleExportBookmarksCSV}
            disabled={filtered.length === 0}
            style={{
              padding: "4px 10px",
              borderRadius: 4,
              background: "rgba(45,212,191,0.15)",
              color: "#2dd4bf",
              border: "1px solid rgba(45,212,191,0.3)",
              cursor: filtered.length ? "pointer" : "default",
              fontSize: "0.8rem",
            }}
          >
            Export CSV
          </button>
          <button
            onClick={handleExportBookmarksSTIX}
            disabled={filtered.length === 0}
            style={{
              padding: "4px 10px",
              borderRadius: 4,
              background: "rgba(167,139,250,0.15)",
              color: "#a78bfa",
              border: "1px solid rgba(167,139,250,0.3)",
              cursor: filtered.length ? "pointer" : "default",
              fontSize: "0.8rem",
            }}
          >
            Export STIX
          </button>
          <button
            onClick={handleClearAll}
            disabled={allBookmarks.length === 0}
            style={{
              padding: "4px 10px",
              borderRadius: 4,
              background: "rgba(255,68,68,0.1)",
              color: "#ff6666",
              border: "1px solid rgba(255,68,68,0.25)",
              cursor: allBookmarks.length ? "pointer" : "default",
              fontSize: "0.8rem",
              marginLeft: "auto",
            }}
          >
            Clear All
          </button>
        </div>

        {/* List */}
        <div style={{ overflowY: "auto", flex: 1 }}>
          {filtered.length === 0 ? (
            <p
              style={{
                textAlign: "center",
                color: "#888",
                marginTop: 24,
                fontSize: "0.9rem",
              }}
            >
              {allBookmarks.length === 0
                ? "No bookmarks yet. Bookmark events or IOCs to save them here."
                : "No bookmarks match the selected filter."}
            </p>
          ) : (
            filtered.map((bk, idx) => {
              const isEventBk = isEventBookmark(bk);
              const entry = isEventBk ? findEntry(bk) : null;
              const isEditing = editingIdx === idx;
              const key = isEventBk
                ? `evt-${bk.eventIndex}`
                : `ioc-${bk.ioc}-${bk.iocType}`;

              return (
                <div
                  key={key}
                  style={{
                    padding: "10px 12px",
                    marginBottom: 8,
                    borderRadius: 6,
                    border: `1px solid ${BOOKMARK_COLORS[bk.tag]}33`,
                    background: `${BOOKMARK_COLORS[bk.tag]}0a`,
                  }}
                >
                  {/* Header row */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 4,
                    }}
                  >
                    <span
                      style={{
                        fontSize: "0.75rem",
                        padding: "2px 8px",
                        borderRadius: 3,
                        background: `${BOOKMARK_COLORS[bk.tag]}22`,
                        color: BOOKMARK_COLORS[bk.tag],
                        fontWeight: 600,
                      }}
                    >
                      {BOOKMARK_TAGS.find((t) => t.value === bk.tag)?.icon}{" "}
                      {bk.tag.toUpperCase()}
                    </span>
                    <span style={{ fontSize: "0.75rem", color: "#888" }}>
                      {isEventBk ? `EID ${bk.eventId}` : `IOC: ${bk.ioc}`}
                    </span>
                  </div>

                  {/* Content based on type */}
                  <div
                    style={{
                      fontSize: "0.8rem",
                      color: "#ccc",
                      marginBottom: 4,
                    }}
                  >
                    {isEventBk ? (
                      <>
                        {formatTimestamp(bk.timestamp)}
                        {entry?.sourceFile && (
                          <span style={{ color: "#666", marginLeft: 8 }}>
                            {entry.sourceFile}
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        <span>{bk.iocType}</span>
                        <span style={{ color: "#666", marginLeft: 8 }}>
                          {bk.eventCount} events
                        </span>
                      </>
                    )}
                  </div>

                  {/* Note */}
                  {isEditing ? (
                    <div
                      style={{
                        display: "flex",
                        gap: 6,
                        marginBottom: 6,
                      }}
                    >
                      <input
                        autoFocus
                        value={editNote}
                        onChange={(e) => setEditNote(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveNote(bk);
                          if (e.key === "Escape") setEditingIdx(null);
                        }}
                        style={{
                          flex: 1,
                          padding: "4px 8px",
                          borderRadius: 4,
                          border: "1px solid #555",
                          background: "#1a1a2e",
                          color: "#eee",
                          fontSize: "0.8rem",
                        }}
                        placeholder="Add a note..."
                      />
                      <button
                        onClick={() => handleSaveNote(bk)}
                        style={{
                          padding: "4px 10px",
                          borderRadius: 4,
                          background: "rgba(68,187,68,0.15)",
                          color: "#44bb44",
                          border: "1px solid rgba(68,187,68,0.3)",
                          cursor: "pointer",
                          fontSize: "0.8rem",
                        }}
                      >
                        Save
                      </button>
                    </div>
                  ) : bk.note ? (
                    <p
                      style={{
                        fontSize: "0.8rem",
                        color: "#bbb",
                        margin: "4px 0",
                        fontStyle: "italic",
                        cursor: "pointer",
                      }}
                      onClick={() => {
                        setEditingIdx(idx);
                        setEditNote(bk.note);
                      }}
                      title="Click to edit note"
                    >
                      "{bk.note}"
                    </p>
                  ) : null}

                  {/* Action buttons */}
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      marginTop: 6,
                    }}
                  >
                    {onPivotToEvent && entry && (
                      <button
                        onClick={() => onPivotToEvent(entry)}
                        style={{
                          padding: "3px 10px",
                          borderRadius: 4,
                          background: "rgba(96,165,250,0.15)",
                          color: "#60a5fa",
                          border: "1px solid rgba(96,165,250,0.3)",
                          cursor: "pointer",
                          fontSize: "0.75rem",
                        }}
                      >
                        View Event
                      </button>
                    )}
                    {entry && (
                      <button
                        onClick={() => toggleCompare(entry)}
                        style={{
                          padding: "3px 10px",
                          borderRadius: 4,
                          background:
                            compareA === entry || compareB === entry
                              ? "rgba(168,85,247,0.18)"
                              : "rgba(168,85,247,0.08)",
                          color: "#a78bfa",
                          border: "1px solid rgba(168,85,247,0.35)",
                          cursor: "pointer",
                          fontSize: "0.75rem",
                        }}
                      >
                        {compareA === entry || compareB === entry
                          ? "Selected"
                          : "Compare"}
                      </button>
                    )}
                    {!isEditing && (
                      <button
                        onClick={() => {
                          setEditingIdx(idx);
                          setEditNote(bk.note);
                        }}
                        style={{
                          padding: "3px 10px",
                          borderRadius: 4,
                          background: "rgba(255,255,255,0.05)",
                          color: "#aaa",
                          border: "1px solid rgba(255,255,255,0.1)",
                          cursor: "pointer",
                          fontSize: "0.75rem",
                        }}
                      >
                        Edit Note
                      </button>
                    )}
                    <button
                      onClick={() => handleRemove(bk)}
                      style={{
                        padding: "3px 10px",
                        borderRadius: 4,
                        background: "rgba(255,68,68,0.1)",
                        color: "#ff6666",
                        border: "1px solid rgba(255,68,68,0.2)",
                        cursor: "pointer",
                        fontSize: "0.75rem",
                        marginLeft: "auto",
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <EventCompare
        eventA={compareA}
        eventB={compareB}
        isOpen={showCompare}
        onClose={() => setShowCompare(false)}
      />
    </div>
  );
}
