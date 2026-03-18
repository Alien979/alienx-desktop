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
  data: ParsedData;
  matches: [string, SigmaRuleMatch[]][];
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

interface AutoSessionPayload {
  savedAt: string;
  filename: string;
  platform: string | null;
  data: ParsedData;
  matches: [string, SigmaRuleMatch[]][];
}

interface AutoSessionMeta {
  savedAt: string;
  filename: string;
  platform: string | null;
  eventCount: number;
  matchCount: number;
  storage: "local" | "idb";
}

const SESSIONS_INDEX_KEY = "alienx_sessions_index";
const SESSION_PREFIX = "alienx_session_";
const MAX_SESSIONS = 50;

const AUTOSAVE_KEY = "alienx_autosave_session_v1";
const AUTOSAVE_DB = "alienx-autosave-db";
const AUTOSAVE_STORE = "autosave";
const AUTOSAVE_IDB_KEY = "latest";
const AUTOSAVE_IDB_THRESHOLD_EVENTS = 50000;

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

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

function reviveDates<T>(input: T): T {
  return JSON.parse(JSON.stringify(input), (_key, value) => {
    if (value && typeof value === "object" && value.__date) {
      return new Date(value.value);
    }
    return value;
  }) as T;
}

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
    const matchesArray: [string, SigmaRuleMatch[]][] = Array.from(
      matches.entries(),
    );
    const matchCount = matchesArray.reduce(
      (sum, [, grouped]) => sum + grouped.length,
      0,
    );

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

    const serialized = JSON.stringify(session, (_key, value) => {
      if (value instanceof Date) {
        return { __date: true, value: value.toISOString() };
      }
      return value;
    });

    const sizeInMB = new Blob([serialized]).size / (1024 * 1024);
    if (sizeInMB > 8) {
      return null;
    }

    localStorage.setItem(SESSION_PREFIX + id, serialized);

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

    if (sessions.length > MAX_SESSIONS) {
      const removed = sessions.splice(MAX_SESSIONS);
      for (const old of removed) {
        localStorage.removeItem(SESSION_PREFIX + old.id);
      }
    }

    localStorage.setItem(SESSIONS_INDEX_KEY, JSON.stringify(sessions));
    return metadata;
  } catch {
    return null;
  }
}

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

    const session = JSON.parse(serialized, (_key, value) => {
      if (value && typeof value === "object" && value.__date) {
        return new Date(value.value);
      }
      return value;
    }) as SavedSession;

    if (
      !session ||
      !Array.isArray(session.data?.entries) ||
      !Array.isArray(session.matches)
    ) {
      return null;
    }

    const entries: LogEntry[] = session.data.entries.map((entry) => ({
      ...entry,
      timestamp: new Date(entry.timestamp),
    }));

    return {
      data: {
        ...session.data,
        entries,
        platform:
          (session.data as ParsedData).platform ||
          (session.platform as ParsedData["platform"]) ||
          "windows",
      },
      matches: new Map<string, SigmaRuleMatch[]>(session.matches),
      filename: session.filename,
      platform: session.platform,
      conversation: session.conversation,
    };
  } catch {
    return null;
  }
}

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

export function renameSession(id: string, newName: string): boolean {
  try {
    const sessions = getSessionsList();
    const session = sessions.find((s) => s.id === id);
    if (!session) return false;

    session.name = newName;
    localStorage.setItem(SESSIONS_INDEX_KEY, JSON.stringify(sessions));

    const serialized = localStorage.getItem(SESSION_PREFIX + id);
    if (serialized) {
      const fullSession = reviveDates<SavedSession>(JSON.parse(serialized));
      fullSession.name = newName;
      localStorage.setItem(SESSION_PREFIX + id, JSON.stringify(fullSession));
    }

    return true;
  } catch {
    return false;
  }
}

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
        used += value.length * 2;
      }
    }
  }

  const available = 10 * 1024 * 1024;
  return {
    used,
    available,
    percentage: (used / available) * 100,
  };
}

export function clearAllSessions(): void {
  const sessions = getSessionsList();
  for (const session of sessions) {
    localStorage.removeItem(SESSION_PREFIX + session.id);
  }
  localStorage.removeItem(SESSIONS_INDEX_KEY);
}

function openAutosaveDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(AUTOSAVE_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(AUTOSAVE_STORE)) {
        db.createObjectStore(AUTOSAVE_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function writeAutosaveToIndexedDb(
  payload: AutoSessionPayload,
): Promise<void> {
  const db = await openAutosaveDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(AUTOSAVE_STORE, "readwrite");
    const store = tx.objectStore(AUTOSAVE_STORE);
    const request = store.put(payload, AUTOSAVE_IDB_KEY);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function readAutosaveFromIndexedDb(): Promise<AutoSessionPayload | null> {
  if (!("indexedDB" in window)) return null;
  try {
    const db = await openAutosaveDb();
    return await new Promise<AutoSessionPayload | null>((resolve, reject) => {
      const tx = db.transaction(AUTOSAVE_STORE, "readonly");
      const store = tx.objectStore(AUTOSAVE_STORE);
      const request = store.get(AUTOSAVE_IDB_KEY);
      request.onsuccess = () => {
        const value = request.result as AutoSessionPayload | undefined;
        resolve(value ?? null);
      };
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

function hydrateAutoSession(payload: AutoSessionPayload): {
  savedAt: string;
  filename: string;
  platform: string | null;
  data: ParsedData;
  matches: Map<string, SigmaRuleMatch[]>;
} {
  const entries: LogEntry[] = payload.data.entries.map((entry) => ({
    ...entry,
    timestamp: new Date(entry.timestamp),
  }));

  return {
    savedAt: payload.savedAt,
    filename: payload.filename,
    platform: payload.platform,
    data: {
      ...payload.data,
      entries,
    },
    matches: new Map<string, SigmaRuleMatch[]>(payload.matches),
  };
}

export async function saveAutoSession(
  filename: string,
  platform: string | null,
  data: ParsedData,
  matches: Map<string, SigmaRuleMatch[]>,
): Promise<void> {
  try {
    const payload: AutoSessionPayload = {
      savedAt: new Date().toISOString(),
      filename,
      platform,
      data,
      matches: Array.from(matches.entries()),
    };

    const matchCount = payload.matches.reduce(
      (sum, [, grouped]) => sum + grouped.length,
      0,
    );

    if (
      data.entries.length >= AUTOSAVE_IDB_THRESHOLD_EVENTS &&
      "indexedDB" in window
    ) {
      const meta: AutoSessionMeta = {
        savedAt: payload.savedAt,
        filename,
        platform,
        eventCount: data.entries.length,
        matchCount,
        storage: "idb",
      };

      // Only advertise IDB storage once the payload is actually persisted.
      try {
        await writeAutosaveToIndexedDb(payload);
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(meta));
        return;
      } catch {
        // Fall back to localStorage payload when IDB is unavailable/quota-limited.
      }
    }

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
    // Best effort only.
  }
}

export async function loadAutoSession(): Promise<{
  savedAt: string;
  filename: string;
  platform: string | null;
  data: ParsedData;
  matches: Map<string, SigmaRuleMatch[]>;
} | null> {
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

    if ((parsed as AutoSessionMeta).storage === "idb") {
      const payload = await readAutosaveFromIndexedDb();
      if (!payload) return null;
      return hydrateAutoSession(payload);
    }

    const payload = parsed as AutoSessionPayload;
    if (
      !Array.isArray(payload.data?.entries) ||
      !Array.isArray(payload.matches)
    ) {
      return null;
    }

    return hydrateAutoSession(payload);
  } catch {
    return null;
  }
}

export async function clearAutoSession(): Promise<void> {
  localStorage.removeItem(AUTOSAVE_KEY);

  if (!("indexedDB" in window)) return;

  try {
    const db = await openAutosaveDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(AUTOSAVE_STORE, "readwrite");
      const store = tx.objectStore(AUTOSAVE_STORE);
      const request = store.delete(AUTOSAVE_IDB_KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    // Best effort only.
  }
}
