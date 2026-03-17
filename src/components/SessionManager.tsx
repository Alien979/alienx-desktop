import { useState, useCallback, useRef } from "react";
import {
  getSessionsList,
  saveSession,
  loadSession,
  deleteSession,
  renameSession,
  getStorageUsage,
  SessionMetadata,
} from "../lib/sessionStorage";
import { ParsedData } from "../types";
import { SigmaRuleMatch } from "../lib/sigma/types";
import { ConversationMessage } from "../lib/llm/storage/conversations";
import "./SessionManager.css";

interface SessionManagerProps {
  currentData: ParsedData | null;
  currentFilename: string;
  currentPlatform: string | null;
  currentMatches: Map<string, SigmaRuleMatch[]>;
  currentConversation?: {
    provider: string;
    model: string;
    messages: ConversationMessage[];
  };
  onLoadSession: (
    data: ParsedData,
    filename: string,
    platform: string | null,
    matches: Map<string, SigmaRuleMatch[]>,
    conversation?: {
      provider: string;
      model: string;
      messages: ConversationMessage[];
    },
  ) => void;
  onClose: () => void;
}

export default function SessionManager({
  currentData,
  currentFilename,
  currentPlatform,
  currentMatches,
  currentConversation,
  onLoadSession,
  onClose,
}: SessionManagerProps) {
  const [sessions, setSessions] = useState<SessionMetadata[]>(getSessionsList);
  const [saveName, setSaveName] = useState(
    currentFilename ? currentFilename.replace(/\.[^.]+$/, "") : "",
  );
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "success" | "error"
  >("idle");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const storage = getStorageUsage();

  const handleSave = useCallback(() => {
    if (!currentData || !saveName.trim()) return;

    setSaveStatus("saving");

    // Small delay to show saving state
    setTimeout(() => {
      const result = saveSession(
        saveName.trim(),
        currentFilename,
        currentPlatform,
        currentData,
        currentMatches,
        currentConversation,
      );

      if (result) {
        setSaveStatus("success");
        setSessions(getSessionsList());
        setTimeout(() => setSaveStatus("idle"), 2000);
      } else {
        setSaveStatus("error");
        setTimeout(() => setSaveStatus("idle"), 3000);
      }
    }, 100);
  }, [
    currentData,
    currentFilename,
    currentPlatform,
    currentMatches,
    currentConversation,
    saveName,
  ]);

  const handleLoad = useCallback(
    (id: string) => {
      const session = loadSession(id);
      if (session) {
        onLoadSession(
          session.data,
          session.filename,
          session.platform,
          session.matches,
          session.conversation,
        );
        onClose();
      }
    },
    [onLoadSession, onClose],
  );

  const confirmDeleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const handleDelete = useCallback(
    (id: string) => {
      if (confirmDelete === id) {
        if (confirmDeleteTimerRef.current)
          clearTimeout(confirmDeleteTimerRef.current);
        deleteSession(id);
        setSessions(getSessionsList());
        setConfirmDelete(null);
      } else {
        if (confirmDeleteTimerRef.current)
          clearTimeout(confirmDeleteTimerRef.current);
        setConfirmDelete(id);
        // Auto-cancel after 3 seconds
        confirmDeleteTimerRef.current = setTimeout(
          () => setConfirmDelete(null),
          3000,
        );
      }
    },
    [confirmDelete],
  );

  const handleRename = useCallback(
    (id: string) => {
      if (editingId === id && editName.trim()) {
        renameSession(id, editName.trim());
        setSessions(getSessionsList());
        setEditingId(null);
        setEditName("");
      } else {
        const session = sessions.find((s) => s.id === id);
        setEditingId(id);
        setEditName(session?.name || "");
      }
    },
    [editingId, editName, sessions],
  );

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return `Today at ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    } else if (days === 1) {
      return `Yesterday at ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    } else if (days < 7) {
      return `${days} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="session-manager-overlay" onClick={onClose}>
      <div className="session-manager" onClick={(e) => e.stopPropagation()}>
        <div className="session-header">
          <h2>💾 Session Manager</h2>
          <button className="close-btn" onClick={onClose}>
            ×
          </button>
        </div>

        {/* Save Current Session */}
        {currentData && (
          <div className="save-section">
            <h3>Save Current Session</h3>
            <div className="save-form">
              <input
                type="text"
                placeholder="Session name..."
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                className="save-input"
                onKeyDown={(e) => e.key === "Enter" && handleSave()}
              />
              <button
                className={`save-btn ${saveStatus}`}
                onClick={handleSave}
                disabled={saveStatus === "saving" || !saveName.trim()}
              >
                {saveStatus === "saving"
                  ? "⏳ Saving..."
                  : saveStatus === "success"
                    ? "✓ Saved!"
                    : saveStatus === "error"
                      ? "✗ Error"
                      : "💾 Save"}
              </button>
            </div>
            <div className="save-info">
              <span>{currentData.entries.length.toLocaleString()} events</span>
              {currentMatches.size > 0 && (
                <span>
                  {Array.from(currentMatches.values()).reduce(
                    (s, m) => s + m.length,
                    0,
                  )}{" "}
                  detections
                </span>
              )}
              {currentPlatform && <span>{currentPlatform} rules</span>}
            </div>
          </div>
        )}

        {/* Saved Sessions List */}
        <div className="sessions-section">
          <h3>Saved Sessions ({sessions.length}/10)</h3>

          {sessions.length === 0 ? (
            <div className="no-sessions">
              <span className="no-sessions-icon">📭</span>
              <p>No saved sessions yet</p>
              <p className="no-sessions-hint">
                Save your current analysis to continue later
              </p>
            </div>
          ) : (
            <div className="sessions-list">
              {sessions.map((session) => (
                <div key={session.id} className="session-item">
                  <div className="session-info">
                    {editingId === session.id ? (
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="edit-name-input"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRename(session.id);
                          if (e.key === "Escape") {
                            setEditingId(null);
                            setEditName("");
                          }
                        }}
                      />
                    ) : (
                      <span className="session-name">{session.name}</span>
                    )}
                    <span className="session-meta">
                      {session.filename} • {session.eventCount.toLocaleString()}{" "}
                      events
                      {session.matchCount > 0 &&
                        ` • ${session.matchCount} detections`}
                      {session.platform && ` • ${session.platform}`}
                    </span>
                    <span className="session-date">
                      {formatDate(session.createdAt)}
                    </span>
                  </div>
                  <div className="session-actions">
                    <button
                      className="action-btn load"
                      onClick={() => handleLoad(session.id)}
                      title="Load session"
                    >
                      📂
                    </button>
                    <button
                      className="action-btn rename"
                      onClick={() => handleRename(session.id)}
                      title={editingId === session.id ? "Save name" : "Rename"}
                    >
                      {editingId === session.id ? "✓" : "✏️"}
                    </button>
                    <button
                      className={`action-btn delete ${confirmDelete === session.id ? "confirm" : ""}`}
                      onClick={() => handleDelete(session.id)}
                      title={
                        confirmDelete === session.id
                          ? "Click again to confirm"
                          : "Delete session"
                      }
                    >
                      {confirmDelete === session.id ? "⚠️" : "🗑️"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Storage Info */}
        <div className="storage-info">
          <div className="storage-bar">
            <div
              className="storage-used"
              style={{ width: `${Math.min(storage.percentage, 100)}%` }}
            />
          </div>
          <span className="storage-text">
            {formatSize(storage.used)} / {formatSize(storage.available)} used (
            {storage.percentage.toFixed(1)}%)
          </span>
        </div>

        <div className="session-privacy-note">
          🔒 Sessions are stored locally in your browser
        </div>
      </div>
    </div>
  );
}
