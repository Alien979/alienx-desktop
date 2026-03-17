import { useState, useCallback, useEffect } from "react";
import {
  getAvailablePlatformsWithCounts,
  getAvailableCategories,
  SigmaPlatform,
  PlatformInfo,
} from "../lib/sigma/utils/autoLoadRules";
import SigmaRuleLoader from "./SigmaRuleLoader";
import "./SigmaPlatformSelector.css";

interface SigmaPlatformSelectorProps {
  onSelect: (platform: SigmaPlatform, categories: string[]) => void;
  onBack: () => void;
  sigmaEngine?: any;
  onCustomRulesLoaded?: (count: number) => void;
  defaultPlatform?: SigmaPlatform | null;
}

export default function SigmaPlatformSelector({
  onSelect,
  onBack,
  sigmaEngine,
  onCustomRulesLoaded,
  defaultPlatform = null,
}: SigmaPlatformSelectorProps) {
  const [hoveredPlatform, setHoveredPlatform] = useState<string | null>(null);
  const [selectedPlatform, setSelectedPlatform] =
    useState<SigmaPlatform | null>(null);
  const [showRuleLoader, setShowRuleLoader] = useState(false);
  const [platforms, setPlatforms] = useState<PlatformInfo[]>([]);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadCategoriesForPlatform = useCallback(
    async (platformId: SigmaPlatform) => {
      setSelectedPlatform(platformId);
      setLoadError(null);
      try {
        const categories = (await getAvailableCategories(platformId)).sort();
        setAvailableCategories(categories);
        setSelectedCategories(categories);
        if (categories.length === 0) {
          setLoadError(
            `No categories available for ${platformId}. Run \"npm run bundle:sigma\" to generate rule bundles.`,
          );
        }
      } catch (_error) {
        setAvailableCategories([]);
        setSelectedCategories([]);
        setLoadError(
          `Failed to load ${platformId} manifest. Ensure rules are bundled.`,
        );
      }
    },
    [],
  );

  // Load platforms with dynamic rule counts and categories
  useEffect(() => {
    const loadData = async () => {
      setLoadError(null);
      // Load platforms
      const platformsData = await getAvailablePlatformsWithCounts();
      setPlatforms(platformsData);
    };
    loadData();
  }, []);

  const handlePlatformClick = async (platformId: SigmaPlatform) => {
    await loadCategoriesForPlatform(platformId);
  };

  useEffect(() => {
    if (!defaultPlatform || selectedPlatform) return;
    void loadCategoriesForPlatform(defaultPlatform);
  }, [defaultPlatform, selectedPlatform, loadCategoriesForPlatform]);

  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  };

  const handleLoad = () => {
    if (!selectedPlatform) return;
    onSelect(selectedPlatform, selectedCategories);
  };

  // Handler for when custom rules are loaded
  const handleCustomRulesLoaded = useCallback(
    (count: number) => {
      setShowRuleLoader(false);
      // Notify parent component about loaded custom rules
      if (onCustomRulesLoaded) {
        onCustomRulesLoaded(count);
      }
    },
    [onCustomRulesLoaded],
  );

  return (
    <div className="platform-selector">
      <div className="platform-header">
        <button className="back-button" onClick={onBack}>
          ← Back to Analysis Selection
        </button>
        <div className="header-content">
          <div className="logo-container">
            <h1>SIGMA Detection</h1>
            <span className="logo-icon">🛡️</span>
          </div>
          <p className="tagline">
            Cross-platform detection rules for Windows and Linux
          </p>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            marginTop: "1rem",
          }}
        >
          <button
            onClick={() => setShowRuleLoader(!showRuleLoader)}
            className="load-custom-rules-button"
            style={{
              padding: "0.75rem 1.5rem",
              background: showRuleLoader
                ? "var(--accent-orange)"
                : "var(--accent-blue)",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "0.95rem",
              fontWeight: "600",
              transition: "all 0.2s ease",
            }}
          >
            {showRuleLoader
              ? "✕ Close Rule Loader"
              : "📂 Load Custom SIGMA Rules"}
          </button>
        </div>
      </div>

      {/* Custom Rule Loader */}
      {showRuleLoader && sigmaEngine && (
        <div style={{ marginBottom: "2rem" }}>
          <SigmaRuleLoader
            engine={sigmaEngine}
            onRulesLoaded={handleCustomRulesLoaded}
          />
        </div>
      )}

      {/* Error message */}
      {loadError && (
        <div
          style={{
            margin: "1rem auto",
            maxWidth: "600px",
            padding: "1rem 1.5rem",
            background: "rgba(255, 80, 80, 0.1)",
            border: "1px solid rgba(255, 80, 80, 0.3)",
            borderRadius: "8px",
            color: "#ff6b6b",
            fontSize: "0.9rem",
            textAlign: "center",
          }}
        >
          ⚠️ {loadError}
        </div>
      )}

      <div className="platform-cards">
        {platforms.map((platform) => (
          <div
            key={platform.id}
            className={`platform-card ${platform.id} ${hoveredPlatform === platform.id ? "hovered" : ""} ${platform.ruleCount === 0 ? "disabled" : ""}`}
            onClick={() =>
              platform.ruleCount > 0 && handlePlatformClick(platform.id)
            }
            onMouseEnter={() => setHoveredPlatform(platform.id)}
            onMouseLeave={() => setHoveredPlatform(null)}
          >
            <div className="platform-icon">{platform.icon}</div>
            <div className="platform-content">
              <h3>{platform.name}</h3>
              <p>{platform.description}</p>
              <div className="rule-count">
                <span className="count">
                  {platform.ruleCount.toLocaleString()}
                </span>
                <span className="label">detection rules</span>
              </div>
            </div>
            <div className="platform-arrow">→</div>
          </div>
        ))}
      </div>

      {selectedPlatform && availableCategories.length > 0 && (
        <div className="platform-filters">
          <div className="filters-header">
            <div>
              <p className="filter-kicker">Rule filters</p>
              <h4>Load only relevant categories</h4>
              <p className="filter-sub">
                Reducing categories trims load time and noise.
              </p>
            </div>
            <div className="filter-actions">
              <button
                onClick={() => setSelectedCategories(availableCategories)}
              >
                Select all
              </button>
              <button onClick={() => setSelectedCategories([])}>Clear</button>
            </div>
          </div>
          <div className="filter-grid">
            {availableCategories.map((cat) => (
              <label key={cat} className="filter-chip">
                <input
                  type="checkbox"
                  checked={selectedCategories.includes(cat)}
                  onChange={() => toggleCategory(cat)}
                />
                <span>{cat.replace(/_/g, " ")}</span>
              </label>
            ))}
          </div>
          <div className="filter-footer">
            <span>
              {selectedCategories.length} of {availableCategories.length}{" "}
              categories selected
            </span>
            <button
              className="load-button"
              onClick={handleLoad}
              disabled={selectedCategories.length === 0}
            >
              Load rules
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
