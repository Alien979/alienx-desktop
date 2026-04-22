/**
 * Event bookmarking / annotation system.
 * Persists bookmarks in localStorage so they survive across browser sessions.
 */

export type BookmarkTag =
  | "suspicious"
  | "malicious"
  | "benign"
  | "investigate"
  | "evidence";

export interface EventBookmark {
  /** Hash-based unique identifier for the bookmarked event */
  eventIndex: number;
  timestamp: string;
  eventId: string;
  note: string;
  tag: BookmarkTag;
  createdAt: string;
}

export interface IOCBookmark {
  /** IOC value (e.g., IP, domain, hash) */
  ioc: string;
  /** Type of IOC (ip, domain, hash, etc.) */
  iocType: string;
  /** Number of events this IOC appears in */
  eventCount: number;
  note: string;
  tag: BookmarkTag;
  createdAt: string;
}

export type Bookmark = EventBookmark | IOCBookmark;

function isEventBookmark(value: unknown): value is EventBookmark {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.eventIndex === "number" &&
    typeof v.timestamp === "string" &&
    typeof v.eventId === "string" &&
    typeof v.note === "string" &&
    typeof v.tag === "string" &&
    typeof v.createdAt === "string"
  );
}

function isIOCBookmark(value: unknown): value is IOCBookmark {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.ioc === "string" &&
    typeof v.iocType === "string" &&
    typeof v.eventCount === "number" &&
    typeof v.note === "string" &&
    typeof v.tag === "string" &&
    typeof v.createdAt === "string"
  );
}

const STORAGE_KEY = "alienx_bookmarks";

export function getBookmarks(): EventBookmark[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isEventBookmark);
  } catch {
    return [];
  }
}

export function getIOCBookmarks(): IOCBookmark[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isIOCBookmark);
  } catch {
    return [];
  }
}

export function getAllBookmarks(): Bookmark[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is Bookmark => isEventBookmark(v) || isIOCBookmark(v),
    );
  } catch {
    return [];
  }
}

export function addBookmark(bookmark: EventBookmark): void {
  const bookmarks = getBookmarks();
  const existing = bookmarks.findIndex(
    (b) => b.eventIndex === bookmark.eventIndex,
  );
  if (existing >= 0) {
    bookmarks[existing] = bookmark;
  } else {
    bookmarks.push(bookmark);
  }
  const iocBookmarks = getIOCBookmarks();
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify([...bookmarks, ...iocBookmarks]),
  );
}

export function addIOCBookmark(bookmark: IOCBookmark): void {
  const iocBookmarks = getIOCBookmarks();
  const existing = iocBookmarks.findIndex(
    (b) => b.ioc === bookmark.ioc && b.iocType === bookmark.iocType,
  );
  if (existing >= 0) {
    iocBookmarks[existing] = bookmark;
  } else {
    iocBookmarks.push(bookmark);
  }
  const eventBookmarks = getBookmarks();
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify([...eventBookmarks, ...iocBookmarks]),
  );
}

export function removeBookmark(eventIndex: number): void {
  const bookmarks = getBookmarks().filter((b) => b.eventIndex !== eventIndex);
  const iocBookmarks = getIOCBookmarks();
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify([...bookmarks, ...iocBookmarks]),
  );
}

export function removeIOCBookmark(ioc: string, iocType: string): void {
  const iocBookmarks = getIOCBookmarks().filter(
    (b) => !(b.ioc === ioc && b.iocType === iocType),
  );
  const eventBookmarks = getBookmarks();
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify([...eventBookmarks, ...iocBookmarks]),
  );
}

export function isBookmarked(eventIndex: number): boolean {
  return getBookmarks().some((b) => b.eventIndex === eventIndex);
}

export function isIOCBookmarked(ioc: string, iocType: string): boolean {
  return getIOCBookmarks().some((b) => b.ioc === ioc && b.iocType === iocType);
}

export function getBookmark(eventIndex: number): EventBookmark | undefined {
  return getBookmarks().find((b) => b.eventIndex === eventIndex);
}

export function getIOCBookmark(
  ioc: string,
  iocType: string,
): IOCBookmark | undefined {
  return getIOCBookmarks().find((b) => b.ioc === ioc && b.iocType === iocType);
}

export function clearBookmarks(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export const BOOKMARK_TAGS: {
  value: BookmarkTag;
  label: string;
  icon: string;
  color: string;
}[] = [
  { value: "suspicious", label: "Suspicious", icon: "⚠️", color: "#ff8c00" },
  { value: "malicious", label: "Malicious", icon: "🔴", color: "#ff4444" },
  { value: "benign", label: "Benign", icon: "✅", color: "#44bb44" },
  { value: "investigate", label: "Investigate", icon: "🔍", color: "#00c8ff" },
  { value: "evidence", label: "Evidence", icon: "📌", color: "#cc44ff" },
];

export const BOOKMARK_COLORS: Record<BookmarkTag, string> = {
  suspicious: "#ff8c00",
  malicious: "#ff4444",
  benign: "#44bb44",
  investigate: "#00c8ff",
  evidence: "#cc44ff",
};
