import { useMemo, useState } from "react";
import { LogPlatform } from "../types";
import { BundledYaraRule, loadBundledYaraRules } from "../lib/yara";
import {
  customRuleToDraft,
  createCustomYaraRule,
  CustomYaraRuleDraft,
  deleteCustomYaraRule,
  getCustomYaraRules,
  updateCustomYaraRule,
} from "../lib/customYaraRules";
import "./Dashboard.css";

interface YaraRuleLabProps {
  platform: LogPlatform;
  onBack: () => void;
}

export default function YaraRuleLab({ platform, onBack }: YaraRuleLabProps) {
  const [customRules, setCustomRules] = useState<BundledYaraRule[]>(() =>
    getCustomYaraRules(),
  );
  const [customRuleError, setCustomRuleError] = useState<string | null>(null);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [bundledRuleCount, setBundledRuleCount] = useState<number | null>(null);
  const [loadingBundledCount, setLoadingBundledCount] = useState(false);
  const [draftRule, setDraftRule] = useState<CustomYaraRuleDraft>({
    title: "",
    description: "",
    author: "",
    tags: "",
    literals: "",
    exclusions: "",
    minMatches: 2,
    platform,
  });

  const platformCustomRules = useMemo(
    () =>
      customRules.filter(
        (rule) => rule.platform === "all" || rule.platform === platform,
      ),
    [customRules, platform],
  );

  const resetDraftRule = () => {
    setEditingRuleId(null);
    setCustomRuleError(null);
    setDraftRule({
      title: "",
      description: "",
      author: "",
      tags: "",
      literals: "",
      exclusions: "",
      minMatches: 2,
      platform,
    });
  };

  const handleSaveCustomRule = () => {
    const result = editingRuleId
      ? updateCustomYaraRule(editingRuleId, draftRule)
      : createCustomYaraRule(draftRule);

    if (!result.ok) {
      setCustomRuleError(result.error);
      return;
    }

    setCustomRuleError(null);
    setCustomRules(getCustomYaraRules());
    resetDraftRule();
  };

  const handleEditCustomRule = (rule: BundledYaraRule) => {
    setEditingRuleId(rule.id);
    setCustomRuleError(null);
    setDraftRule(customRuleToDraft(rule));
  };

  const handleDeleteCustomRule = (ruleId: string) => {
    if (editingRuleId === ruleId) {
      resetDraftRule();
    }
    deleteCustomYaraRule(ruleId);
    setCustomRules(getCustomYaraRules());
  };

  const handleRefreshBundledCount = async () => {
    try {
      setLoadingBundledCount(true);
      const rules = await loadBundledYaraRules(platform);
      setBundledRuleCount(rules.length);
    } finally {
      setLoadingBundledCount(false);
    }
  };

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div>
          <h1>YARA Rule Lab</h1>
          <p className="tagline">
            Create and maintain custom rules separately from live detections.
          </p>
        </div>
        <div className="header-buttons">
          <button className="timeline-button" onClick={onBack}>
            ← Back to Selection
          </button>
        </div>
      </header>

      <div className="chart-card" style={{ marginBottom: "1rem" }}>
        <h3>Rule Inventory</h3>
        <p style={{ color: "var(--text-muted)", marginBottom: "0.6rem" }}>
          Custom rules for {platform}: {platformCustomRules.length}
          {bundledRuleCount !== null
            ? ` • Bundled rules: ${bundledRuleCount}`
            : ""}
        </p>
        <button className="timeline-button" onClick={handleRefreshBundledCount}>
          {loadingBundledCount ? "Checking..." : "Refresh bundled rule count"}
        </button>
      </div>

      <div className="chart-card" style={{ marginBottom: "1rem" }}>
        <h3>{editingRuleId ? "Edit Custom Rule" : "Create Custom Rule"}</h3>

        <div style={{ display: "grid", gap: "0.6rem", marginTop: "0.75rem" }}>
          <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
            <input
              value={draftRule.title}
              onChange={(e) =>
                setDraftRule((prev) => ({ ...prev, title: e.target.value }))
              }
              placeholder="Rule title"
              style={{
                flex: "1 1 220px",
                background: "var(--bg-hover)",
                border: "1px solid var(--border-primary)",
                color: "var(--text-primary)",
                borderRadius: 8,
                padding: "0.5rem",
              }}
            />
            <input
              value={draftRule.author}
              onChange={(e) =>
                setDraftRule((prev) => ({ ...prev, author: e.target.value }))
              }
              placeholder="Author"
              style={{
                flex: "1 1 180px",
                background: "var(--bg-hover)",
                border: "1px solid var(--border-primary)",
                color: "var(--text-primary)",
                borderRadius: 8,
                padding: "0.5rem",
              }}
            />
            <select
              value={draftRule.platform}
              onChange={(e) =>
                setDraftRule((prev) => ({
                  ...prev,
                  platform: e.target.value as LogPlatform | "all",
                }))
              }
              style={{
                background: "var(--bg-hover)",
                border: "1px solid var(--border-primary)",
                color: "var(--text-primary)",
                borderRadius: 8,
                padding: "0.5rem",
              }}
            >
              <option value="windows">Windows</option>
              <option value="linux">Linux</option>
              <option value="all">Windows + Linux</option>
            </select>
            <input
              type="number"
              min={1}
              value={draftRule.minMatches}
              onChange={(e) =>
                setDraftRule((prev) => ({
                  ...prev,
                  minMatches: Number(e.target.value) || 1,
                }))
              }
              title="Minimum literal matches"
              style={{
                width: 90,
                background: "var(--bg-hover)",
                border: "1px solid var(--border-primary)",
                color: "var(--text-primary)",
                borderRadius: 8,
                padding: "0.5rem",
              }}
            />
          </div>

          <input
            value={draftRule.tags}
            onChange={(e) =>
              setDraftRule((prev) => ({ ...prev, tags: e.target.value }))
            }
            placeholder="Tags (comma-separated)"
            style={{
              background: "var(--bg-hover)",
              border: "1px solid var(--border-primary)",
              color: "var(--text-primary)",
              borderRadius: 8,
              padding: "0.5rem",
            }}
          />

          <input
            value={draftRule.description}
            onChange={(e) =>
              setDraftRule((prev) => ({ ...prev, description: e.target.value }))
            }
            placeholder="Description"
            style={{
              background: "var(--bg-hover)",
              border: "1px solid var(--border-primary)",
              color: "var(--text-primary)",
              borderRadius: 8,
              padding: "0.5rem",
            }}
          />

          <textarea
            value={draftRule.literals}
            onChange={(e) =>
              setDraftRule((prev) => ({ ...prev, literals: e.target.value }))
            }
            placeholder="Required literals (one per line)"
            rows={6}
            style={{
              background: "var(--bg-hover)",
              border: "1px solid var(--border-primary)",
              color: "var(--text-primary)",
              borderRadius: 8,
              padding: "0.5rem",
            }}
          />

          <textarea
            value={draftRule.exclusions}
            onChange={(e) =>
              setDraftRule((prev) => ({ ...prev, exclusions: e.target.value }))
            }
            placeholder="Exclusion literals (optional, one per line)"
            rows={3}
            style={{
              background: "var(--bg-hover)",
              border: "1px solid var(--border-primary)",
              color: "var(--text-primary)",
              borderRadius: 8,
              padding: "0.5rem",
            }}
          />

          {customRuleError && (
            <div style={{ color: "#f87171", fontSize: "0.85rem" }}>
              {customRuleError}
            </div>
          )}

          <div
            style={{
              display: "flex",
              gap: "0.5rem",
              justifyContent: "flex-end",
            }}
          >
            {editingRuleId && (
              <button className="timeline-button" onClick={resetDraftRule}>
                Cancel Edit
              </button>
            )}
            <button className="timeline-button" onClick={handleSaveCustomRule}>
              {editingRuleId ? "Update Rule" : "Save Rule"}
            </button>
          </div>
        </div>
      </div>

      <div className="chart-card">
        <h3>Custom Rules ({platformCustomRules.length})</h3>
        {platformCustomRules.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>
            No custom rules for {platform} yet.
          </p>
        ) : (
          <div
            style={{ display: "grid", gap: "0.45rem", marginTop: "0.75rem" }}
          >
            {platformCustomRules.map((rule) => (
              <div
                key={rule.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "0.75rem",
                  border: "1px solid var(--border-secondary)",
                  borderRadius: 8,
                  padding: "0.5rem 0.65rem",
                  background: "var(--bg-hover)",
                }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>{rule.title}</div>
                  <div
                    style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}
                  >
                    {rule.literals.length} literals • min {rule.minMatches} •{" "}
                    {rule.platform}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    className="timeline-button"
                    onClick={() => handleEditCustomRule(rule)}
                  >
                    Edit
                  </button>
                  <button
                    className="timeline-button"
                    onClick={() => handleDeleteCustomRule(rule.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
