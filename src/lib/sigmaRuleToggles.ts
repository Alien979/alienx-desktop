const SIGMA_RULE_ENABLED_KEY = "alienx_sigma_rules_enabled_v1";

type EnabledRuleMap = Record<string, boolean>;

function readEnabledRuleMap(): EnabledRuleMap {
  try {
    const raw = localStorage.getItem(SIGMA_RULE_ENABLED_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as EnabledRuleMap;
  } catch {
    return {};
  }
}

function writeEnabledRuleMap(map: EnabledRuleMap): void {
  localStorage.setItem(SIGMA_RULE_ENABLED_KEY, JSON.stringify(map));
}

/**
 * Sigma rules are enabled by default.
 * We only persist ids the user disables (map[id] = false).
 */
export function isSigmaRuleEnabled(ruleId: string): boolean {
  const map = readEnabledRuleMap();
  if (Object.prototype.hasOwnProperty.call(map, ruleId)) {
    return Boolean(map[ruleId]);
  }
  return true;
}

export function setSigmaRuleEnabled(ruleId: string, enabled: boolean): void {
  const map = readEnabledRuleMap();
  if (enabled) {
    delete map[ruleId];
  } else {
    map[ruleId] = false;
  }
  writeEnabledRuleMap(map);
}

export function getDisabledSigmaRuleIds(): string[] {
  const map = readEnabledRuleMap();
  return Object.keys(map).filter((id) => map[id] === false);
}

