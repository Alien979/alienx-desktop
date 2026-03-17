export type ThreatActorIOCType =
  | "ip"
  | "domain"
  | "hash"
  | "filepath"
  | "url"
  | "email"
  | "registry"
  | "base64";

export interface ThreatActorIOC {
  id: string;
  type: ThreatActorIOCType;
  value: string;
  note?: string;
  createdAt: string;
}

export interface ThreatActorProfile {
  id: string;
  name: string;
  aliases: string[];
  description: string;
  iocs: ThreatActorIOC[];
  createdAt: string;
  updatedAt: string;
}

const THREAT_ACTOR_REPO_KEY = "alienx_threat_actor_repo_v1";

function isThreatActorProfile(value: unknown): value is ThreatActorProfile {
  if (!value || typeof value !== "object") return false;
  const actor = value as ThreatActorProfile;
  return (
    typeof actor.id === "string" &&
    typeof actor.name === "string" &&
    Array.isArray(actor.aliases) &&
    typeof actor.description === "string" &&
    Array.isArray(actor.iocs) &&
    typeof actor.createdAt === "string" &&
    typeof actor.updatedAt === "string"
  );
}

function readRepo(): ThreatActorProfile[] {
  try {
    const raw = localStorage.getItem(THREAT_ACTOR_REPO_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isThreatActorProfile);
  } catch {
    return [];
  }
}

function saveRepo(actors: ThreatActorProfile[]): void {
  localStorage.setItem(THREAT_ACTOR_REPO_KEY, JSON.stringify(actors));
}

function normalizeIOCValue(type: ThreatActorIOCType, value: string): string {
  const trimmed = value.trim();
  if (type === "base64") return trimmed;
  return trimmed.toLowerCase();
}

export function getThreatActors(): ThreatActorProfile[] {
  return readRepo();
}

export function createThreatActor(input: {
  name: string;
  aliases?: string;
  description?: string;
}): { ok: true; actor: ThreatActorProfile } | { ok: false; error: string } {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Threat actor name is required." };

  const now = new Date().toISOString();
  const actor: ThreatActorProfile = {
    id: `ta-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    name,
    aliases: (input.aliases || "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean),
    description: input.description?.trim() || "",
    iocs: [],
    createdAt: now,
    updatedAt: now,
  };

  const repo = readRepo();
  repo.unshift(actor);
  saveRepo(repo);
  return { ok: true, actor };
}

export function addThreatActorIOC(
  actorId: string,
  input: { type: ThreatActorIOCType; value: string; note?: string },
): { ok: true; actor: ThreatActorProfile } | { ok: false; error: string } {
  const repo = readRepo();
  const actor = repo.find((item) => item.id === actorId);
  if (!actor) return { ok: false, error: "Threat actor not found." };

  const normalized = normalizeIOCValue(input.type, input.value);
  if (!normalized) return { ok: false, error: "IOC value is required." };

  const duplicate = actor.iocs.some(
    (ioc) => ioc.type === input.type && ioc.value === normalized,
  );
  if (duplicate) {
    return {
      ok: false,
      error: "This IOC already exists for that threat actor.",
    };
  }

  actor.iocs.unshift({
    id: `ioc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    type: input.type,
    value: normalized,
    note: input.note?.trim() || "",
    createdAt: new Date().toISOString(),
  });
  actor.updatedAt = new Date().toISOString();

  saveRepo(repo);
  return { ok: true, actor };
}

export function deleteThreatActorIOC(actorId: string, iocId: string): void {
  const repo = readRepo();
  const actor = repo.find((item) => item.id === actorId);
  if (!actor) return;
  actor.iocs = actor.iocs.filter((ioc) => ioc.id !== iocId);
  actor.updatedAt = new Date().toISOString();
  saveRepo(repo);
}

export function deleteThreatActor(actorId: string): void {
  const repo = readRepo().filter((item) => item.id !== actorId);
  saveRepo(repo);
}
