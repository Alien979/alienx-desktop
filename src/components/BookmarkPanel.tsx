import { useState, useMemo } from "react";
import { LogEntry } from "../types";
import {
  getBookmarks,
  removeBookmark,
  clearBookmarks,
  EventBookmark,
  BookmarkTag,
  BOOKMARK_TAGS,
  BOOKMARK_COLORS,
  addBookmark,
} from "../lib/eventBookmarks";

interface BookmarkPanelProps {
  entries: LogEntry[];
  onClose: () => void;
  onPivotToEvent?: (entry: LogEntry) => void;
}

type SortKey = "time" | "tag" | "added";

export default function BookmarkPanel({
  entries,
  onClose,
  onPivotToEvent,
}: BookmarkPanelProps) {
  const [filterTag, setFilterTag] = useState<BookmarkTag | "all">("all");
  const [sortBy, setSortBy] = useState<SortKey>("added");
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editNote, setEditNote] = useState("");
  const [bookmarkVersion, setBookmarkVersion] = useState(0);

  // Re-read bookmarks when version bumps (after add/remove/edit)
  const bookmarks = useMemo(() => getBookmarks(), [bookmarkVersion]);

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

  const filtered = useMemo(() => {
    let list = [...bookmarks];
    if (filterTag !== "all") {
      list = list.filter((b) => b.tag === filterTag);
    }
    if (sortBy === "time") {
      list.sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );
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
  }, [bookmarks, filterTag, sortBy]);

  const handleRemove = (eventIndex: number) => {
    removeBookmark(eventIndex);
    setBookmarkVersion((v) => v + 1);
  };

  const handleClearAll = () => {
    if (
      bookmarks.length > 0 &&
      confirm(`Remove all ${bookmarks.length} bookmarks?`)
    ) {
      clearBookmarks();
      setBookmarkVersion((v) => v + 1);
    }
  };

  const handleSaveNote = (bk: EventBookmark) => {
    addBookmark({ ...bk, note: editNote });
    setEditingIdx(null);
    setBookmarkVersion((v) => v + 1);
  };

  const handleCopyAll = async () => {
    const text = filtered
      .map((bk) => {
        const entry = findEntry(bk);
        const time = bk.timestamp || "?";
        const eid = bk.eventId || "?";
        const tag = bk.tag.toUpperCase();
        const note = bk.note ? ` — ${bk.note}` : "";
        const source = entry?.sourceFile || "";
        return `[${tag}] EID ${eid} @ ${time}${source ? ` (${source})` : ""}${note}`;
      })
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      alert("Could not copy to clipboard. Please grant clipboard permission.");
    }
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
          <h3 style={{ margin: 0 }}>
            🔖 Bookmarked Events ({bookmarks.length})
          </h3>
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
            <option value="time">Sort: Event Time</option>
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
            onClick={handleClearAll}
            disabled={bookmarks.length === 0}
            style={{
              padding: "4px 10px",
              borderRadius: 4,
              background: "rgba(255,68,68,0.1)",
              color: "#ff6666",
              border: "1px solid rgba(255,68,68,0.25)",
              cursor: bookmarks.length ? "pointer" : "default",
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
              {bookmarks.length === 0
                ? "No bookmarks yet. Open an event and click the bookmark icon to save it here."
                : "No bookmarks match the selected filter."}
            </p>
          ) : (
            filtered.map((bk) => {
              const entry = findEntry(bk);
              const isEditing = editingIdx === bk.eventIndex;

              return (
                <div
                  key={bk.eventIndex}
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
                      EID {bk.eventId}
                    </span>
                  </div>

                  {/* Timestamp + source */}
                  <div
                    style={{
                      fontSize: "0.8rem",
                      color: "#ccc",
                      marginBottom: 4,
                    }}
                  >
                    {formatTimestamp(bk.timestamp)}
                    {entry?.sourceFile && (
                      <span style={{ color: "#666", marginLeft: 8 }}>
                        {entry.sourceFile}
                      </span>
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
                        setEditingIdx(bk.eventIndex);
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
                    {!isEditing && (
                      <button
                        onClick={() => {
                          setEditingIdx(bk.eventIndex);
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
                      onClick={() => handleRemove(bk.eventIndex)}
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
    </div>
  );
}
