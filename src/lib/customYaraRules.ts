import { LogPlatform } from "../types";
import { BundledYaraRule } from "./yara";

export type YaraStrictness = "strict" | "balanced" | "permissive";

export interface CustomYaraRuleDraft {
  title: string;
  description: string;
  author: string;
  tags: string;
  literals: string;
  exclusions: string;
  minMatches: number;
  platform: LogPlatform | "all";
}

const CUSTOM_YARA_RULES_KEY = "alienx_custom_yara_rules_v1";
const YARA_STRICTNESS_KEY = "alienx_yara_strictness_v1";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

function parseMultiLine(value: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const line of value.split(/\r?\n/)) {
    const normalized = line.trim().toLowerCase();
    if (!normalized || normalized.length < 3 || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function isBundledRule(value: unknown): value is BundledYaraRule {
  if (!value || typeof value !== "object") return false;
  const rule = value as BundledYaraRule;
  return (
    typeof rule.id === "string" &&
    typeof rule.title === "string" &&
    typeof rule.name === "string" &&
    Array.isArray(rule.literals) &&
    typeof rule.minMatches === "number" &&
    typeof rule.anchor === "string" &&
    (rule.platform === "windows" ||
      rule.platform === "linux" ||
      rule.platform === "all")
  );
}

export function getCustomYaraRules(): BundledYaraRule[] {
  try {
    const raw = localStorage.getItem(CUSTOM_YARA_RULES_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isBundledRule);
  } catch {
    return [];
  }
}

function saveCustomYaraRules(rules: BundledYaraRule[]): void {
  localStorage.setItem(CUSTOM_YARA_RULES_KEY, JSON.stringify(rules));
}

function buildCustomYaraRuleFromDraft(
  draft: CustomYaraRuleDraft,
  existing?: BundledYaraRule,
): { ok: true; rule: BundledYaraRule } | { ok: false; error: string } {
  const title = draft.title.trim();
  if (!title) {
    return { ok: false, error: "Rule title is required." };
  }

  const literals = parseMultiLine(draft.literals);
  if (literals.length < 2) {
    return {
      ok: false,
      error: "Add at least two literals to reduce false positives.",
    };
  }

  const exclusions = parseMultiLine(draft.exclusions);
  const minMatches = Math.max(
    1,
    Math.min(draft.minMatches || 1, literals.length),
  );
  const baseName = slugify(title) || "custom_rule";
  const now = Date.now();

  const rule: BundledYaraRule = {
    id:
      existing?.id || `custom-${now}-${Math.random().toString(36).slice(2, 9)}`,
    name: baseName,
    title,
    description: draft.description.trim() || "Custom rule created in AlienX",
    author: draft.author.trim() || "AlienX User",
    source: "custom",
    sourceName: "custom",
    path: `custom/${baseName}.yara`,
    platform: draft.platform,
    tags: draft.tags
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean),
    literals,
    exclusions,
    minMatches,
    anchor: literals.reduce(
      (longest, next) => (next.length > longest.length ? next : longest),
      literals[0],
    ),
  };

  return { ok: true, rule };
}

export function createCustomYaraRule(
  draft: CustomYaraRuleDraft,
): { ok: true; rule: BundledYaraRule } | { ok: false; error: string } {
  const built = buildCustomYaraRuleFromDraft(draft);
  if (!built.ok) return built;
  const rule = built.rule;

  const all = getCustomYaraRules();
  all.unshift(rule);
  saveCustomYaraRules(all);

  return { ok: true, rule };
}

export function updateCustomYaraRule(
  ruleId: string,
  draft: CustomYaraRuleDraft,
): { ok: true; rule: BundledYaraRule } | { ok: false; error: string } {
  const all = getCustomYaraRules();
  const existing = all.find((rule) => rule.id === ruleId);
  if (!existing) {
    return { ok: false, error: "Custom rule not found." };
  }

  const built = buildCustomYaraRuleFromDraft(draft, existing);
  if (!built.ok) return built;

  const next = all.map((rule) => (rule.id === ruleId ? built.rule : rule));
  saveCustomYaraRules(next);
  return { ok: true, rule: built.rule };
}

export function customRuleToDraft(rule: BundledYaraRule): CustomYaraRuleDraft {
  return {
    title: rule.title,
    description: rule.description || "",
    author: rule.author || "",
    tags: (rule.tags || []).join(", "),
    literals: (rule.literals || []).join("\n"),
    exclusions: (rule.exclusions || []).join("\n"),
    minMatches: rule.minMatches || 1,
    platform: rule.platform,
  };
}

export function deleteCustomYaraRule(ruleId: string): void {
  const next = getCustomYaraRules().filter((rule) => rule.id !== ruleId);
  saveCustomYaraRules(next);
}

export function getStoredYaraStrictness(): YaraStrictness {
  const value = localStorage.getItem(YARA_STRICTNESS_KEY);
  if (value === "strict" || value === "balanced" || value === "permissive") {
    return value;
  }
  return "balanced";
}

export function setStoredYaraStrictness(value: YaraStrictness): void {
  localStorage.setItem(YARA_STRICTNESS_KEY, value);
}
