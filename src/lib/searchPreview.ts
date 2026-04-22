// Search result preview with context snippets
import { LogEntry } from "../types";

export interface SearchMatch {
  entry: LogEntry;
  field: string;
  matchText: string;
  context: string; // snippet with context before/after
  startIdx: number;
  endIdx: number;
}

const CONTEXT_CHARS = 60; // Characters before/after match to show

export function createSearchMatch(
  entry: LogEntry,
  field: string,
  fieldValue: string,
  matchText: string,
  matchIndex: number,
): SearchMatch {
  const startContext = Math.max(0, matchIndex - CONTEXT_CHARS);
  const endContext = Math.min(
    fieldValue.length,
    matchIndex + matchText.length + CONTEXT_CHARS,
  );

  const before = fieldValue.substring(startContext, matchIndex);
  const after = fieldValue.substring(matchIndex + matchText.length, endContext);

  const contextBefore = startContext > 0 ? "..." : "";
  const contextAfter = endContext < fieldValue.length ? "..." : "";

  const context = `${contextBefore}${before}<mark>${matchText}</mark>${after}${contextAfter}`;

  return {
    entry,
    field,
    matchText,
    context,
    startIdx: matchIndex,
    endIdx: matchIndex + matchText.length,
  };
}

export function searchInEntry(
  entry: LogEntry,
  query: string,
  isRegex: boolean,
): SearchMatch[] {
  const matches: SearchMatch[] = [];

  const searchValue = (value: string, fieldName: string) => {
    if (!value) return;

    const lowerValue = value.toLowerCase();
    const lowerQuery = query.toLowerCase();

    if (isRegex) {
      try {
        const regex = new RegExp(query, "gi");
        let match;
        while ((match = regex.exec(value)) !== null) {
          matches.push(
            createSearchMatch(entry, fieldName, value, match[0], match.index),
          );
        }
      } catch {
        // Invalid regex, skip
      }
    } else {
      let idx = 0;
      while ((idx = lowerValue.indexOf(lowerQuery, idx)) !== -1) {
        const actualMatch = value.substring(idx, idx + query.length);
        matches.push(
          createSearchMatch(entry, fieldName, value, actualMatch, idx),
        );
        idx += query.length;
      }
    }
  };

  // Search across common fields
  searchValue(entry.rawLine || "", "rawLine");
  searchValue(entry.message || "", "message");
  searchValue(entry.source || "", "source");
  searchValue(entry.computer || "", "computer");
  searchValue(String(entry.eventId || ""), "eventId");
  searchValue(entry.user || "", "user");
  searchValue(entry.processName || "", "processName");
  searchValue(entry.processCmd || "", "processCmd");

  // Search in eventData if available
  if (entry.eventData) {
    for (const [key, value] of Object.entries(entry.eventData)) {
      searchValue(value || "", key);
    }
  }

  return matches;
}

export function formatSearchResultPreview(match: SearchMatch): {
  field: string;
  preview: string;
  text: string;
} {
  return {
    field: match.field,
    preview: match.context,
    text: match.context,
  };
}

export function getSearchContextHTML(match: SearchMatch): string {
  return match.context;
}
