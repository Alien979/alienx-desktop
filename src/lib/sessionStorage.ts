// Session storage for saving/loading analysis sessions
import { ParsedData, LogEntry } from "../types";
import { SigmaRuleMatch } from "./sigma/types";
import { ConversationMessage } from "./llm/storage/conversations";

export interface SavedSession {
  id: string;
  name: string;
  createdAt: string;
  filename: string;
  platform: string | null;
  eventCount: number;
  matchCount: number;
  // Compressed data
  data: ParsedData;
  matches: [string, SigmaRuleMatch[]][];
  // LLM conversation history (optional)
  conversation?: {
    provider: string;
    model: string;
    messages: ConversationMessage[];
  };
}

export interface SessionMetadata {
  id: string;
  name: string;
  createdAt: string;
  filename: string;
  platform: string | null;
  eventCount: number;
  matchCount: number;
}

const SESSIONS_INDEX_KEY = "alienx_sessions_index";
const SESSION_PREFIX = "alienx_session_";
const MAX_SESSIONS = 50;
const AUTOSAVE_KEY = "alienx_autosave_session_v1";

function isSessionMetadataArray(value: unknown): value is SessionMetadata[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        item &&
        typeof item === "object" &&
        typeof (item as SessionMetadata).id === "string" &&
        typeof (item as SessionMetadata).name === "string" &&
        typeof (item as SessionMetadata).createdAt === "string" &&
        typeof (item as SessionMetadata).filename === "string" &&
        (typeof (item as SessionMetadata).platform === "string" ||
          (item as SessionMetadata).platform === null) &&
        typeof (item as SessionMetadata).eventCount === "number" &&
        typeof (item as SessionMetadata).matchCount === "number",
    )
  );
}

function isSavedSession(value: unknown): value is SavedSession {
  if (!value || typeof value !== "object") return false;
  const session = value as SavedSession;
  return (
    typeof session.id === "string" &&
    typeof session.name === "string" &&
    typeof session.createdAt === "string" &&
    typeof session.filename === "string" &&
    (typeof session.platform === "string" || session.platform === null) &&
    typeof session.eventCount === "number" &&
    typeof session.matchCount === "number" &&
    !!session.data &&
    Array.isArray(session.data.entries) &&
    Array.isArray(session.matches)
  );
}

// Generate unique session ID
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

// Get all session metadata (without loading full data)
export function getSessionsList(): SessionMetadata[] {
  try {
    const index = localStorage.getItem(SESSIONS_INDEX_KEY);
    if (!index) return [];
    const parsed: unknown = JSON.parse(index);
    return isSessionMetadataArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Save a new session
export function saveSession(
  name: string,
  filename: string,
  platform: string | null,
  data: ParsedData,
  matches: Map<string, SigmaRuleMatch[]>,
  conversation?: {
    provider: string;
    model: string;
    messages: ConversationMessage[];
  },
): SessionMetadata | null {
  try {
    const id = generateId();
    const createdAt = new Date().toISOString();

    // Convert Map to array for JSON serialization
    const matchesArray: [string, SigmaRuleMatch[]][] = Array.from(
      matches.entries(),
    );

    // Calculate total match count
    const matchCount = matchesArray.reduce((sum, [, m]) => sum + m.length, 0);

    const session: SavedSession = {
      id,
      name,
      createdAt,
      filename,
      platform,
      eventCount: data.entries.length,
      matchCount,
      data,
      matches: matchesArray,
      conversation,
    };

    // Serialize with date handling
    const serialized = JSON.stringify(session, (_key, value) => {
      if (value instanceof Date) {
        return { __date: true, value: value.toISOString() };
      }
      return value;
    });

    // Check size - localStorage typically has 5-10MB limit per domain
    const sizeInMB = new Blob([serialized]).size / (1024 * 1024);
    if (sizeInMB > 8) {
      return null;
    }

    // Save session data
    localStorage.setItem(SESSION_PREFIX + id, serialized);

    // Update index
    const metadata: SessionMetadata = {
      id,
      name,
      createdAt,
      filename,
      platform,
      eventCount: data.entries.length,
      matchCount,
    };

    const sessions = getSessionsList();
    sessions.unshift(metadata);

    // Keep only MAX_SESSIONS
    if (sessions.length > MAX_SESSIONS) {
      const removed = sessions.splice(MAX_SESSIONS);
      // Clean up old session data
      for (const old of removed) {
        localStorage.removeItem(SESSION_PREFIX + old.id);
      }
    }

    localStorage.setItem(SESSIONS_INDEX_KEY, JSON.stringify(sessions));

    return metadata;
  } catch (error) {
    return null;
  }
}

// Load a session by ID
export function loadSession(id: string): {
  data: ParsedData;
  matches: Map<string, SigmaRuleMatch[]>;
  filename: string;
  platform: string | null;
  conversation?: {
    provider: string;
    model: string;
    messages: ConversationMessage[];
  };
} | null {
  try {
    const serialized = localStorage.getItem(SESSION_PREFIX + id);
    if (!serialized) return null;

    // Parse with date reviving
    const session = JSON.parse(serialized, (_key, value) => {
      if (value && typeof value === "object" && value.__date) {
        return new Date(value.value);
      }
      return value;
    }) as unknown;

    if (!isSavedSession(session)) {
      return null;
    }

    // Ensure timestamps are Date objects
    const entries: LogEntry[] = session.data.entries.map((entry) => ({
      ...entry,
      timestamp: new Date(entry.timestamp),
    }));

    const data: ParsedData = {
      ...session.data,
      entries,
      platform:
        (session.data as ParsedData).platform ||
        (session.platform as ParsedData["platform"]) ||
        "windows",
    };

    // Convert array back to Map
    const matches = new Map<string, SigmaRuleMatch[]>(session.matches);

    return {
      data,
      matches,
      filename: session.filename,
      platform: session.platform,
      conversation: session.conversation,
    };
  } catch (error) {
    return null;
  }
}

// Delete a session
export function deleteSession(id: string): boolean {
  try {
    localStorage.removeItem(SESSION_PREFIX + id);

    const sessions = getSessionsList().filter((s) => s.id !== id);
    localStorage.setItem(SESSIONS_INDEX_KEY, JSON.stringify(sessions));

    return true;
  } catch {
    return false;
  }
}

// Rename a session
export function renameSession(id: string, newName: string): boolean {
  try {
    const sessions = getSessionsList();
    const session = sessions.find((s) => s.id === id);
    if (!session) return false;

    session.name = newName;
    localStorage.setItem(SESSIONS_INDEX_KEY, JSON.stringify(sessions));

    // Also update the full session data
    const serialized = localStorage.getItem(SESSION_PREFIX + id);
    if (serialized) {
      const fullSession = JSON.parse(serialized) as unknown;
      if (!isSavedSession(fullSession)) return false;
      fullSession.name = newName;
      localStorage.setItem(SESSION_PREFIX + id, JSON.stringify(fullSession));
    }

    return true;
  } catch {
    return false;
  }
}

// Get estimated storage usage
export function getStorageUsage(): {
  used: number;
  available: number;
  percentage: number;
} {
  let used = 0;

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith("alienx_")) {
      const value = localStorage.getItem(key);
      if (value) {
        used += value.length * 2; // UTF-16 uses 2 bytes per char
      }
    }
  }

  // Estimate available (typically 5-10MB, assume 10MB)
  const available = 10 * 1024 * 1024;

  return {
    used,
    available,
    percentage: (used / available) * 100,
  };
}

// Clear all sessions
export function clearAllSessions(): void {
  const sessions = getSessionsList();
  for (const session of sessions) {
    localStorage.removeItem(SESSION_PREFIX + session.id);
  }
  localStorage.removeItem(SESSIONS_INDEX_KEY);
}

export function saveAutoSession(
  filename: string,
  platform: string | null,
  data: ParsedData,
  matches: Map<string, SigmaRuleMatch[]>,
): void {
  try {
    const payload = {
      savedAt: new Date().toISOString(),
      filename,
      platform,
      data,
      matches: Array.from(matches.entries()),
    };

    localStorage.setItem(
      AUTOSAVE_KEY,
      JSON.stringify(payload, (_key, value) => {
        if (value instanceof Date) {
          return { __date: true, value: value.toISOString() };
        }
        return value;
      }),
    );
  } catch {
    // Best effort; skip hard failure for autosave.
  }
}

export function loadAutoSession(): {
  savedAt: string;
  filename: string;
  platform: string | null;
  data: ParsedData;
  matches: Map<string, SigmaRuleMatch[]>;
} | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw, (_key, value) => {
      if (value && typeof value === "object" && value.__date) {
        return new Date(value.value);
      }
      return value;
    }) as unknown;

    if (!parsed || typeof parsed !== "object") return null;
    const payload = parsed as {
      savedAt?: string;
      filename?: string;
      platform?: string | null;
      data?: ParsedData;
      matches?: [string, SigmaRuleMatch[]][];
    };
    if (
      typeof payload.savedAt !== "string" ||
      typeof payload.filename !== "string" ||
      !payload.data ||
      !Array.isArray(payload.data.entries) ||
      !Array.isArray(payload.matches)
    ) {
      return null;
    }

    const entries: LogEntry[] = payload.data.entries.map((entry) => ({
      ...entry,
      timestamp: new Date(entry.timestamp),
    }));

    return {
      savedAt: payload.savedAt,
      filename: payload.filename,
      platform: payload.platform ?? null,
      data: {
        ...payload.data,
        entries,
      },
      matches: new Map<string, SigmaRuleMatch[]>(payload.matches),
    };
  } catch {
    return null;
  }
}

export function clearAutoSession(): void {
  localStorage.removeItem(AUTOSAVE_KEY);
}
