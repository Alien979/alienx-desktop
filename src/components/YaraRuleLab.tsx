import { useEffect, useMemo, useState } from "react";
import { LogPlatform } from "../types";
import { BundledYaraRule, loadBundledYaraRules } from "../lib/yara";
import {
  customRuleToDraft,
  createCustomYaraRule,
  CustomYaraRuleDraft,
  deleteCustomYaraRule,
  getCustomYaraRules,
  isCustomRuleEnabled,
  setCustomRuleEnabled,
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
  const [, setEnabledRevision] = useState(0);
  const [customRuleError, setCustomRuleError] = useState<string | null>(null);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [bundledRuleCount, setBundledRuleCount] = useState<number | null>(null);
  const [loadingBundledCount, setLoadingBundledCount] = useState(false);
  const [bundledRules, setBundledRules] = useState<BundledYaraRule[]>([]);
  const [bundledSearchQuery, setBundledSearchQuery] = useState("");
  const [expandedBundledRuleId, setExpandedBundledRuleId] = useState<
    string | null
  >(null);
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
      setBundledRules(rules);
    } finally {
      setLoadingBundledCount(false);
    }
  };

  // Load bundled rules on mount
  useEffect(() => {
    handleRefreshBundledCount();
  }, [platform]);

  const handleCopyBundledRule = (rule: BundledYaraRule) => {
    setEditingRuleId(null);
    setCustomRuleError(null);
    const draft = customRuleToDraft(rule);
    // Modify title to indicate it's a copy
    draft.title = `${rule.title} (custom)`;
    setDraftRule(draft);
    // Scroll to form
    const formElement = document.querySelector(".yara-form-section");
    if (formElement) {
      formElement.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const filteredBundledRules = useMemo(() => {
    const query = bundledSearchQuery.toLowerCase();
    if (!query) return bundledRules;
    return bundledRules.filter(
      (rule) =>
        rule.title.toLowerCase().includes(query) ||
        rule.description?.toLowerCase().includes(query) ||
        rule.name.toLowerCase().includes(query) ||
        rule.tags?.some((tag) => tag.toLowerCase().includes(query)),
    );
  }, [bundledRules, bundledSearchQuery]);

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div>
          <h1>YARA Rule Lab</h1>
          <p className="tagline">
            Browse bundled rules and create custom rules for advanced detection
            tuning.
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
            ? ` • Bundled rules available: ${bundledRuleCount}`
            : ""}
        </p>
        <button className="timeline-button" onClick={handleRefreshBundledCount}>
          {loadingBundledCount ? "Loading..." : "Refresh Rules"}
        </button>
      </div>

      <div className="chart-card" style={{ marginBottom: "1rem" }}>
        <h3>How to build effective rules</h3>
        <details>
          <summary style={{ cursor: "pointer", color: "var(--text-muted)" }}>
            Quick guidance (recommended defaults)
          </summary>
          <div style={{ marginTop: "0.75rem", color: "var(--text-primary)" }}>
            <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
              <li>
                <strong>Literals</strong>: one per line. Use stable tokens you
                expect in the raw event text (process names, suspicious flags,
                domains, registry paths).
              </li>
              <li>
                <strong>Min matches</strong>: start with 2–3 to reduce false
                positives. Increase if the rule is too noisy.
              </li>
              <li>
                <strong>Exclusions</strong>: add known-benign strings (one per
                line) to suppress expected activity.
              </li>
              <li>
                <strong>Platform</strong>: keep Windows vs Linux rules separate
                when possible (paths/commands differ).
              </li>
            </ul>
            <div
              style={{
                marginTop: "0.75rem",
                fontSize: "0.85rem",
                color: "var(--text-muted)",
              }}
            >
              Tip: create a broad first version, run analysis, then refine with
              exclusions and a higher min-match threshold.
            </div>
          </div>
        </details>
      </div>

      <div
        className="chart-card yara-form-section"
        style={{ marginBottom: "1rem" }}
      >
        <h3>{editingRuleId ? "Edit Custom Rule" : "Create Custom Rule"}</h3>
        <p
          style={{
            color: "var(--text-muted)",
            fontSize: "0.85rem",
            marginBottom: "0.75rem",
          }}
        >
          {editingRuleId
            ? "Modify an existing custom rule"
            : "Create a new rule from scratch or copy a bundled rule"}
        </p>

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

      <div className="chart-card" style={{ marginBottom: "1rem" }}>
        <h3>Custom Rules ({platformCustomRules.length})</h3>
        {platformCustomRules.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>
            No custom rules for {platform} yet. Create one or copy an existing
            bundled rule above.
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
                <div
                  style={{
                    display: "flex",
                    gap: "0.5rem",
                    alignItems: "center",
                  }}
                >
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: "0.78rem",
                      color: "var(--text-muted)",
                      userSelect: "none",
                      cursor: "pointer",
                    }}
                    title="Include this rule in YARA analysis scans"
                  >
                    <input
                      type="checkbox"
                      checked={isCustomRuleEnabled(rule.id)}
                      onChange={(e) => {
                        setCustomRuleEnabled(rule.id, e.target.checked);
                        setEnabledRevision((r) => r + 1);
                      }}
                    />
                    Include
                  </label>
                  <button
                    className="timeline-button"
                    onClick={() => handleEditCustomRule(rule)}
                  >
                    Edit
                  </button>
                  <button
                    className="timeline-button"
                    onClick={() => {
                      if (
                        window.confirm(
                          `Delete rule "${rule.title}"?\n\nThis cannot be undone.`,
                        )
                      ) {
                        handleDeleteCustomRule(rule.id);
                      }
                    }}
                    style={{ color: "#f87171" }}
                    title="Delete this rule permanently"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bundled Rules Browser */}
      <div className="chart-card" style={{ marginBottom: "1rem" }}>
        <h3>
          Bundled YARA Rules ({filteredBundledRules.length})
          <span
            style={{
              fontSize: "0.8rem",
              color: "var(--text-muted)",
              marginLeft: "0.5rem",
            }}
          >
            from internet repositories
          </span>
        </h3>

        <div style={{ marginTop: "0.75rem", marginBottom: "0.75rem" }}>
          <input
            type="text"
            value={bundledSearchQuery}
            onChange={(e) => setBundledSearchQuery(e.target.value)}
            placeholder="Search by name, title, or tags..."
            style={{
              width: "100%",
              background: "var(--bg-hover)",
              border: "1px solid var(--border-primary)",
              color: "var(--text-primary)",
              borderRadius: 8,
              padding: "0.5rem",
            }}
          />
        </div>

        {filteredBundledRules.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>
            {bundledRuleCount === 0
              ? "No bundled rules loaded. Click Refresh Rules to load them."
              : "No rules match your search."}
          </p>
        ) : (
          <div
            style={{ display: "grid", gap: "0.45rem", marginTop: "0.75rem" }}
          >
            {filteredBundledRules.map((rule) => {
              const isExpanded = expandedBundledRuleId === rule.id;
              return (
                <div
                  key={rule.id}
                  style={{
                    border: "1px solid var(--border-secondary)",
                    borderRadius: 8,
                    padding: "0.65rem",
                    background: "var(--bg-hover)",
                  }}
                >
                  <div
                    onClick={() =>
                      setExpandedBundledRuleId(isExpanded ? null : rule.id)
                    }
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: "0.75rem",
                      cursor: "pointer",
                      userSelect: "none",
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, marginBottom: "0.25rem" }}>
                        {rule.title}
                      </div>
                      <div
                        style={{
                          fontSize: "0.8rem",
                          color: "var(--text-muted)",
                        }}
                      >
                        {rule.literals.length} literals • min {rule.minMatches}{" "}
                        • {rule.platform}
                        {rule.source && ` • ${rule.source}`}
                      </div>
                      {rule.tags && rule.tags.length > 0 && (
                        <div style={{ marginTop: "0.25rem" }}>
                          {rule.tags.slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              style={{
                                display: "inline-block",
                                fontSize: "0.7rem",
                                backgroundColor: "#6366f122",
                                color: "#6366f1",
                                padding: "0.15rem 0.4rem",
                                borderRadius: "3px",
                                marginRight: "0.3rem",
                              }}
                            >
                              {tag}
                            </span>
                          ))}
                          {rule.tags.length > 3 && (
                            <span
                              style={{
                                fontSize: "0.7rem",
                                color: "var(--text-muted)",
                                marginLeft: "0.2rem",
                              }}
                            >
                              +{rule.tags.length - 3} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      {rule.source === "custom" ? (
                        <>
                          <button
                            className="timeline-button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditCustomRule(rule);
                            }}
                            title="Edit this custom rule"
                          >
                            Edit
                          </button>
                          <button
                            className="timeline-button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (
                                window.confirm(`Delete rule "${rule.title}"?`)
                              ) {
                                handleDeleteCustomRule(rule.id);
                              }
                            }}
                            title="Delete this custom rule"
                            style={{ color: "#f87171" }}
                          >
                            Delete
                          </button>
                        </>
                      ) : (
                        <button
                          className="timeline-button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyBundledRule(rule);
                          }}
                          title="Copy this rule as a starting point for a custom rule"
                        >
                          Copy
                        </button>
                      )}
                      <span style={{ color: "var(--text-muted)" }}>
                        {isExpanded ? "▼" : "▶"}
                      </span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div
                      style={{
                        marginTop: "0.65rem",
                        paddingTop: "0.65rem",
                        borderTop: "1px solid var(--border-primary)",
                      }}
                    >
                      {rule.description && (
                        <div style={{ marginBottom: "0.5rem" }}>
                          <div style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                            Description
                          </div>
                          <div
                            style={{
                              fontSize: "0.8rem",
                              color: "var(--text-muted)",
                            }}
                          >
                            {rule.description}
                          </div>
                        </div>
                      )}
                      {rule.author && (
                        <div style={{ marginBottom: "0.5rem" }}>
                          <div style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                            Author
                          </div>
                          <div
                            style={{
                              fontSize: "0.8rem",
                              color: "var(--text-muted)",
                            }}
                          >
                            {rule.author}
                          </div>
                        </div>
                      )}
                      <div style={{ marginBottom: "0.5rem" }}>
                        <div style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                          Literals ({rule.literals.length})
                        </div>
                        <div
                          style={{
                            fontSize: "0.8rem",
                            color: "var(--text-muted)",
                            maxHeight: "150px",
                            overflowY: "auto",
                          }}
                        >
                          {rule.literals.map((lit, idx) => (
                            <div key={idx} style={{ marginTop: "0.2rem" }}>
                              • {lit.length > 80 ? lit.slice(0, 80) + "…" : lit}
                            </div>
                          ))}
                        </div>
                      </div>
                      {rule.exclusions && rule.exclusions.length > 0 && (
                        <div style={{ marginBottom: "0.5rem" }}>
                          <div style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                            Exclusions ({rule.exclusions.length})
                          </div>
                          <div
                            style={{
                              fontSize: "0.8rem",
                              color: "var(--text-muted)",
                              maxHeight: "100px",
                              overflowY: "auto",
                            }}
                          >
                            {rule.exclusions.map((exc, idx) => (
                              <div key={idx} style={{ marginTop: "0.2rem" }}>
                                •{" "}
                                {exc.length > 80 ? exc.slice(0, 80) + "…" : exc}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
