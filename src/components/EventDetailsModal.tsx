import { useEffect, useRef, useState, useCallback } from "react";
import {
  addBookmark,
  removeBookmark,
  getBookmark,
  BOOKMARK_TAGS,
  BOOKMARK_COLORS,
} from "../lib/eventBookmarks";
import "./EventDetailsModal.css";

/** Simple string → stable integer hash (djb2). */
function hashCode(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

interface EventDetailsModalProps {
  event: any;
  isOpen: boolean;
  onClose: () => void;
  title?: string;
}

export function EventDetailsModal({
  event,
  isOpen,
  onClose,
  title,
}: EventDetailsModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [copiedRaw, setCopiedRaw] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"fields" | "json">("fields");

  // Bookmark state
  const eventIndex: number | null = event?.rawLine
    ? hashCode(event.rawLine)
    : event?.eventId
      ? hashCode(`${event.eventId}-${String(event?.timestamp)}`)
      : null;
  const [bookmarked, setBookmarked] = useState(false);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [bookmarkNote, setBookmarkNote] = useState("");

  // Sync bookmark state when event changes
  useEffect(() => {
    if (eventIndex !== null) {
      const bk = getBookmark(eventIndex);
      setBookmarked(!!bk);
      setBookmarkNote(bk?.note || "");
    }
  }, [eventIndex, isOpen]);

  // Handle ESC key to close modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Handle click outside modal to close
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Handle copy to clipboard
  const handleCopy = async () => {
    const formattedEvent = JSON.stringify(event, null, 2);
    try {
      await navigator.clipboard.writeText(formattedEvent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleCopyRaw = useCallback(async () => {
    const raw = event?.rawLine || "";
    if (!raw) return;
    try {
      await navigator.clipboard.writeText(raw);
      setCopiedRaw(true);
      setTimeout(() => setCopiedRaw(false), 2000);
    } catch (err) {
      console.error("Failed to copy raw event:", err);
    }
  }, [event]);

  // Copy a single field value
  const handleCopyField = useCallback(async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(key);
      setTimeout(() => setCopiedField(null), 1500);
    } catch (err) {
      console.error("Failed to copy field:", err);
    }
  }, []);

  // Reset copied state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setCopied(false);
      setCopiedRaw(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Format the event data as JSON
  const formattedEvent = JSON.stringify(event, null, 2);

  // Generate modal title
  const modalTitle =
    title ||
    `Event Details ${event?.eventId ? `- Event ID: ${event.eventId}` : ""}`;

  // Syntax highlight JSON
  const syntaxHighlight = (json: string) => {
    json = json
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return json.replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
      (match) => {
        let cls = "json-number";
        if (/^"/.test(match)) {
          if (/:$/.test(match)) {
            cls = "json-key";
          } else {
            cls = "json-string";
          }
        } else if (/true|false/.test(match)) {
          cls = "json-boolean";
        } else if (/null/.test(match)) {
          cls = "json-null";
        }
        return `<span class="${cls}">${match}</span>`;
      },
    );
  };

  // Build flat key-value pairs for the field table
  const flatFields: { key: string; value: string }[] = [];
  if (event && typeof event === "object") {
    const visited = new WeakSet();
    const walk = (obj: any, prefix: string, depth = 0) => {
      if (!obj || typeof obj !== "object" || depth > 10) return;
      if (visited.has(obj)) return; // Prevent circular reference loops
      visited.add(obj);
      try {
        for (const [k, v] of Object.entries(obj)) {
          const fullKey = prefix ? `${prefix}.${k}` : k;
          if (v != null && typeof v === "object" && !Array.isArray(v)) {
            walk(v, fullKey, depth + 1);
          } else {
            flatFields.push({
              key: fullKey,
              value: Array.isArray(v) ? v.join(", ") : String(v ?? ""),
            });
          }
        }
      } catch {
        // Guard against non-enumerable or exotic objects
      }
    };
    walk(event, "");
  }

  return (
    <div className="event-modal-backdrop" onClick={handleBackdropClick}>
      <div className="event-modal" ref={modalRef}>
        {/* Modal Header */}
        <div className="event-modal-header">
          <div className="event-modal-title-section">
            <h2 className="event-modal-title">{modalTitle}</h2>
            {event?.timestamp && (
              <span className="event-modal-subtitle">
                {new Date(event.timestamp).toLocaleString()}
              </span>
            )}
            {event?.computer && (
              <span className="event-modal-subtitle">
                Computer: {event.computer}
              </span>
            )}
          </div>

          {/* Bookmark controls */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginRight: 8,
            }}
          >
            {bookmarked ? (
              <button
                onClick={() => {
                  if (eventIndex !== null) removeBookmark(eventIndex);
                  setBookmarked(false);
                  setShowTagPicker(false);
                }}
                style={{
                  background: "rgba(255,140,0,0.15)",
                  border: "1px solid rgba(255,140,0,0.4)",
                  color: "#ff8c00",
                  borderRadius: 5,
                  padding: "4px 10px",
                  cursor: "pointer",
                  fontSize: "0.82rem",
                }}
                title="Remove bookmark"
              >
                ★ Bookmarked
              </button>
            ) : (
              <button
                onClick={() => setShowTagPicker(!showTagPicker)}
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid #444",
                  color: "#aaa",
                  borderRadius: 5,
                  padding: "4px 10px",
                  cursor: "pointer",
                  fontSize: "0.82rem",
                }}
                title="Bookmark this event"
              >
                ☆ Bookmark
              </button>
            )}
            {showTagPicker && !bookmarked && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <textarea
                  value={bookmarkNote}
                  onChange={(e) => setBookmarkNote(e.target.value)}
                  placeholder="Add a note (optional)…"
                  rows={2}
                  style={{
                    resize: "vertical",
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid #444",
                    borderRadius: 4,
                    color: "#ccc",
                    fontSize: "0.78rem",
                    padding: "4px 8px",
                    fontFamily: "inherit",
                    width: "100%",
                    boxSizing: "border-box",
                  }}
                />
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {BOOKMARK_TAGS.map((t) => (
                    <button
                      key={t.value}
                      onClick={() => {
                        if (eventIndex !== null) {
                          addBookmark({
                            eventIndex,
                            eventId: String(event?.eventId || ""),
                            timestamp: String(event?.timestamp || ""),
                            tag: t.value,
                            note: bookmarkNote,
                            createdAt: new Date().toISOString(),
                          });
                          setBookmarked(true);
                          setShowTagPicker(false);
                        }
                      }}
                      style={{
                        background: `${BOOKMARK_COLORS[t.value]}22`,
                        border: `1px solid ${BOOKMARK_COLORS[t.value]}66`,
                        color: BOOKMARK_COLORS[t.value],
                        borderRadius: 4,
                        padding: "3px 7px",
                        cursor: "pointer",
                        fontSize: "0.78rem",
                      }}
                      title={t.label}
                    >
                      {t.icon} {t.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button
            className="event-modal-close"
            onClick={onClose}
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Modal Content */}
        <div className="event-modal-content">
          {/* View toggle */}
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <button
              className={`event-modal-button ${viewMode === "fields" ? "primary" : "secondary"}`}
              style={{ padding: "3px 10px", fontSize: "0.78rem" }}
              onClick={() => setViewMode("fields")}
            >
              Fields
            </button>
            <button
              className={`event-modal-button ${viewMode === "json" ? "primary" : "secondary"}`}
              style={{ padding: "3px 10px", fontSize: "0.78rem" }}
              onClick={() => setViewMode("json")}
            >
              Raw JSON
            </button>
          </div>

          {viewMode === "json" ? (
            <pre className="event-json-display">
              <code
                dangerouslySetInnerHTML={{
                  __html: syntaxHighlight(formattedEvent),
                }}
              />
            </pre>
          ) : (
            <div className="event-fields-table">
              {flatFields.map(({ key, value }) => (
                <div key={key} className="event-field-row">
                  <span className="event-field-key" title={key}>
                    {key}
                  </span>
                  <span className="event-field-value" title={value}>
                    {value}
                  </span>
                  <button
                    className="event-field-copy"
                    onClick={() => handleCopyField(key, value)}
                    title="Copy value"
                  >
                    {copiedField === key ? "✓" : "⧉"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="event-modal-footer">
          <button
            className="event-modal-button primary"
            onClick={handleCopy}
            disabled={copied}
          >
            {copied ? "✓ Copied!" : "📋 Copy as JSON"}
          </button>
          <button
            className="event-modal-button primary"
            onClick={handleCopyRaw}
            disabled={copiedRaw || !event?.rawLine}
            title="Copy original raw XML/text event"
          >
            {copiedRaw ? "✓ Copied!" : "📄 Copy Raw XML/Text"}
          </button>
          <button className="event-modal-button secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
