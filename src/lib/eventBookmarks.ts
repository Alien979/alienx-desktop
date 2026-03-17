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

const STORAGE_KEY = "alienx_bookmarks";

export function getBookmarks(): EventBookmark[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
}

export function removeBookmark(eventIndex: number): void {
  const bookmarks = getBookmarks().filter((b) => b.eventIndex !== eventIndex);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
}

export function isBookmarked(eventIndex: number): boolean {
  return getBookmarks().some((b) => b.eventIndex === eventIndex);
}

export function getBookmark(eventIndex: number): EventBookmark | undefined {
  return getBookmarks().find((b) => b.eventIndex === eventIndex);
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
