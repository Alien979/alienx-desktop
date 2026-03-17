export type SigmaReviewStatus =
  | "unreviewed"
  | "reviewed"
  | "false_positive"
  | "confirmed";

export interface SigmaReviewNote {
  ruleId: string;
  status: SigmaReviewStatus;
  note: string;
  updatedAt: string;
}

const SIGMA_REVIEW_KEY = "alienx_sigma_review_notes_v1";

function isSigmaReviewNote(value: unknown): value is SigmaReviewNote {
  if (!value || typeof value !== "object") return false;
  const note = value as SigmaReviewNote;
  return (
    typeof note.ruleId === "string" &&
    typeof note.status === "string" &&
    typeof note.note === "string" &&
    typeof note.updatedAt === "string"
  );
}

function getAll(): SigmaReviewNote[] {
  try {
    const raw = localStorage.getItem(SIGMA_REVIEW_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSigmaReviewNote);
  } catch {
    return [];
  }
}

function saveAll(list: SigmaReviewNote[]): void {
  localStorage.setItem(SIGMA_REVIEW_KEY, JSON.stringify(list));
}

export function getSigmaReviewMap(): Map<string, SigmaReviewNote> {
  const map = new Map<string, SigmaReviewNote>();
  for (const item of getAll()) map.set(item.ruleId, item);
  return map;
}

export function upsertSigmaReviewNote(input: {
  ruleId: string;
  status: SigmaReviewStatus;
  note: string;
}): SigmaReviewNote {
  const list = getAll();
  const item: SigmaReviewNote = {
    ruleId: input.ruleId,
    status: input.status,
    note: input.note,
    updatedAt: new Date().toISOString(),
  };

  const idx = list.findIndex((entry) => entry.ruleId === input.ruleId);
  if (idx >= 0) list[idx] = item;
  else list.unshift(item);

  saveAll(list);
  return item;
}
