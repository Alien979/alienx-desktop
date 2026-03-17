export interface SavedSearchQuery {
  id: string;
  name: string;
  query: string;
  regex: boolean;
  createdAt: string;
}

const SEARCH_PRESETS_KEY = "alienx_saved_search_queries_v1";

function isSavedSearchQuery(value: unknown): value is SavedSearchQuery {
  if (!value || typeof value !== "object") return false;
  const item = value as SavedSearchQuery;
  return (
    typeof item.id === "string" &&
    typeof item.name === "string" &&
    typeof item.query === "string" &&
    typeof item.regex === "boolean" &&
    typeof item.createdAt === "string"
  );
}

export function getSavedSearchQueries(): SavedSearchQuery[] {
  try {
    const raw = localStorage.getItem(SEARCH_PRESETS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSavedSearchQuery);
  } catch {
    return [];
  }
}

export function saveSearchQuery(input: {
  name: string;
  query: string;
  regex: boolean;
}): { ok: true; item: SavedSearchQuery } | { ok: false; error: string } {
  const name = input.name.trim();
  const query = input.query.trim();

  if (!name) return { ok: false, error: "Name is required." };
  if (!query) return { ok: false, error: "Query is required." };

  const list = getSavedSearchQueries();
  const item: SavedSearchQuery = {
    id: `sq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    query,
    regex: input.regex,
    createdAt: new Date().toISOString(),
  };

  list.unshift(item);
  localStorage.setItem(SEARCH_PRESETS_KEY, JSON.stringify(list.slice(0, 40)));
  return { ok: true, item };
}

export function deleteSearchQuery(id: string): void {
  const list = getSavedSearchQueries().filter((item) => item.id !== id);
  localStorage.setItem(SEARCH_PRESETS_KEY, JSON.stringify(list));
}
