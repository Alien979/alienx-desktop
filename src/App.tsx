import {
  useState,
  useMemo,
  lazy,
  Suspense,
  useEffect,
  useCallback,
  useRef,
} from "react";
import FileDropZone from "./components/FileDropZone";
import LinuxDropZone from "./components/LinuxDropZone";
import AnalysisSelector, { AnalysisMode } from "./components/AnalysisSelector";
import PlatformChooser from "./components/PlatformChooser";
import Dashboard from "./components/Dashboard";
const LazySigmaPlatformSelector = lazy(
  () => import("./components/SigmaPlatformSelector"),
);
const LazyDashboards = lazy(() => import("./components/Dashboards"));
const LazyProcessExecutionDashboard = lazy(
  () => import("./components/ProcessExecutionDashboard"),
);
const LazyTimeline = lazy(() => import("./components/Timeline"));
const LazyRawLogsView = lazy(() => import("./components/RawLogsView"));
const LazyLLMAnalysis = lazy(() => import("./components/LLMAnalysis"));
const LazyRarityAnalysis = lazy(() => import("./components/RarityAnalysis"));
const LazyYaraRuleLab = lazy(() => import("./components/YaraRuleLab"));
import SessionManager from "./components/SessionManager";
import BookmarkPanel from "./components/BookmarkPanel";
import { EventDetailsModal } from "./components/EventDetailsModal";
import { getBookmarks } from "./lib/eventBookmarks";
import { ParsedData } from "./types";
import { LogPlatform } from "./types";
import type { LogEntry } from "./types";
import { clearVTCache } from "./lib/vtCache";
import { createSigmaEngine, SigmaEngine } from "./lib/sigma";
import { SigmaRuleMatch } from "./lib/sigma/types";
import {
  getCached,
  setCached,
  makeCacheKey,
  makeDatasetFingerprint,
  makeRulesetFingerprint,
} from "./lib/analysisCache";
import type { YaraRuleMatch, YaraScanStats } from "./lib/yara";
import type { SigmaPlatform } from "./lib/sigma/utils/autoLoadRules";
import SigmaDetections from "./components/SigmaDetections";
import {
  saveAutoSession,
  loadAutoSession,
  clearAutoSession,
} from "./lib/sessionStorage";
import {
  ErrorBoundary,
  FileOperationErrorBoundary,
  AnalysisErrorBoundary,
} from "./components/ErrorBoundary";
import LoadingState from "./components/LoadingState";
import "./components/Dashboard.css";

const LazyIOCExtractor = lazy(() => import("./components/IOCExtractor"));
const LazyEventCorrelation = lazy(
  () => import("./components/EventCorrelation"),
);

type AppView = "upload" | "select" | "sigma-platform" | "analysis";

function App() {
  const [analysisPlatform, setAnalysisPlatform] = useState<LogPlatform | null>(
    null,
  );
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [filename, setFilename] = useState<string>("");
  const [rulesLoading, setRulesLoading] = useState(false);
  const [ruleLoadProgress, setRuleLoadProgress] = useState<{
    loaded: number;
    total: number;
  } | null>(null);
  const [currentView, setCurrentView] = useState<AppView>("upload");
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode | null>(null);
  const [sigmaMatches, setSigmaMatches] = useState<
    Map<string, SigmaRuleMatch[]>
  >(new Map());
  const [sigmaHasRun, setSigmaHasRun] = useState(false);
  const [selectedPlatform, setSelectedPlatform] =
    useState<SigmaPlatform | null>(null);
  const [yaraMatches, setYaraMatches] = useState<YaraRuleMatch[] | null>(null);
  const [yaraStats, setYaraStats] = useState<YaraScanStats | null>(null);
  const [showSessionManager, setShowSessionManager] = useState(false);
  const [showBookmarkPanel, setShowBookmarkPanel] = useState(false);
  const [pivotEvent, setPivotEvent] = useState<LogEntry | null>(null);
  const [activePlaybookId, setActivePlaybookId] = useState<string | null>(null);
  const [playbookQuery, setPlaybookQuery] = useState("");
  const [autosaveAvailableAt, setAutosaveAvailableAt] = useState<string | null>(
    null,
  );
  const [bookmarkCount, setBookmarkCount] = useState(
    () => getBookmarks().length,
  );
  const ruleLoadRequestIdRef = useRef(0);

  // ── Theme toggle (dark / light) ─────────────────────────────
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    return (localStorage.getItem("alienx-theme") as "dark" | "light") || "dark";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("alienx-theme", theme);
  }, [theme]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const autosave = await loadAutoSession();
      if (mounted && autosave?.savedAt) {
        setAutosaveAvailableAt(autosave.savedAt);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!parsedData) return;

    const persist = () => {
      void saveAutoSession(
        filename,
        selectedPlatform || parsedData.platform,
        parsedData,
        sigmaMatches,
      );
      setAutosaveAvailableAt(new Date().toISOString());
    };

    const id = setInterval(persist, 30000);
    window.addEventListener("blur", persist);
    return () => {
      clearInterval(id);
      window.removeEventListener("blur", persist);
    };
  }, [parsedData, filename, selectedPlatform, sigmaMatches]);

  // Periodically refresh bookmark count (storage events don't fire on same tab)
  useEffect(() => {
    const id = setInterval(() => setBookmarkCount(getBookmarks().length), 2000);
    return () => clearInterval(id);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  // ── Keyboard shortcut help panel ────────────────────────────
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);

  // Create SIGMA engine instance (persists across renders)
  const sigmaEngine = useMemo(() => {
    return createSigmaEngine({
      autoCompile: true,
      enableRegex: true,
      strictValidation: false,
    });
  }, []);

  // Central scan cache key for Sigma (dataset + ruleset + options)
  const sigmaCacheKey = useMemo(() => {
    if (!parsedData) return null;

    // Use a lightweight fingerprint: counts + source files + time bounds.
    const times = parsedData.entries
      .map((e) => e.timestamp)
      .filter(Boolean)
      .map((t) => new Date(t as any).getTime())
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);
    const firstTimestamp =
      times.length > 0 ? new Date(times[0]).toISOString() : null;
    const lastTimestamp =
      times.length > 0 ? new Date(times[times.length - 1]).toISOString() : null;

    const datasetFingerprint = makeDatasetFingerprint({
      platform: parsedData.platform,
      format: parsedData.format,
      filename,
      entriesCount: parsedData.entries.length,
      parsedLines: parsedData.parsedLines,
      sourceFiles: parsedData.sourceFiles,
      firstTimestamp,
      lastTimestamp,
    });

    const ruleIds = sigmaEngine.getAllRules().map((r) => r.rule.id);
    const rulesetFingerprint = makeRulesetFingerprint({
      kind: "sigma",
      ruleIds,
      options: { selectedPlatform },
    });

    return makeCacheKey({
      kind: "sigma",
      datasetFingerprint,
      rulesetFingerprint,
      engineVersion: "sigma-engine-v1",
    });
  }, [parsedData, filename, selectedPlatform, sigmaEngine]);

  const yaraCacheKey = useMemo(() => {
    if (!parsedData) return null;
    // We cache YARA by dataset + strictness + enabled custom rules snapshot.
    // Bundled rules are stable for a given build, so we treat the build as the engineVersion.
    const times = parsedData.entries
      .map((e) => e.timestamp)
      .filter(Boolean)
      .map((t) => new Date(t as any).getTime())
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);
    const firstTimestamp =
      times.length > 0 ? new Date(times[0]).toISOString() : null;
    const lastTimestamp =
      times.length > 0 ? new Date(times[times.length - 1]).toISOString() : null;

    const datasetFingerprint = makeDatasetFingerprint({
      platform: parsedData.platform,
      format: parsedData.format,
      filename,
      entriesCount: parsedData.entries.length,
      parsedLines: parsedData.parsedLines,
      sourceFiles: parsedData.sourceFiles,
      firstTimestamp,
      lastTimestamp,
    });

    // We don't have bundled rule ids readily without loading them, so cache is keyed
    // by a conservative "ruleset" fingerprint that includes platform + strictness.
    const rulesetFingerprint = makeRulesetFingerprint({
      kind: "yara",
      ruleIds: [`platform:${parsedData.platform}`],
      options: {},
    });

    return makeCacheKey({
      kind: "yara",
      datasetFingerprint,
      rulesetFingerprint,
      engineVersion: "yara-engine-v1",
    });
  }, [parsedData, filename]);

  // Hydrate sigma results from cache when appropriate.
  useEffect(() => {
    if (!sigmaCacheKey) return;
    if (sigmaHasRun) return;
    if (sigmaMatches.size > 0) return;

    const cached = getCached<Array<[string, SigmaRuleMatch[]]>>(sigmaCacheKey);
    if (!cached) return;

    setSigmaMatches(new Map(cached));
    setSigmaHasRun(true);
  }, [sigmaCacheKey, sigmaHasRun, sigmaMatches.size]);

  useEffect(() => {
    if (!yaraCacheKey) return;
    if (yaraMatches && yaraStats) return;
    const cached = getCached<{ matches: YaraRuleMatch[]; stats: YaraScanStats | null }>(
      yaraCacheKey,
    );
    if (!cached) return;
    setYaraMatches(cached.matches);
    setYaraStats(cached.stats);
  }, [yaraCacheKey, yaraMatches, yaraStats]);

  const handleFileLoaded = (data: ParsedData, name: string) => {
    ruleLoadRequestIdRef.current += 1;
    clearVTCache(); // Clear stale VT results from previous file
    setAnalysisPlatform(data.platform);
    setParsedData(data);
    setFilename(name);
    setSigmaHasRun(false);
    setSigmaMatches(new Map());
    setSelectedPlatform(null);
    setYaraMatches(null);
    setYaraStats(null);
    setActivePlaybookId(null);
    setPlaybookQuery("");
    setCurrentView("select");
  };

  const handleReset = useCallback(() => {
    ruleLoadRequestIdRef.current += 1;
    setAnalysisPlatform(null);
    setParsedData(null);
    setFilename("");
    setAnalysisMode(null);
    setSigmaMatches(new Map());
    setSigmaHasRun(false);
    setSelectedPlatform(null);
    setYaraMatches(null);
    setYaraStats(null);
    setActivePlaybookId(null);
    setPlaybookQuery("");
    // Clear loaded rules from engine
    sigmaEngine.clearRules();
    setCurrentView("upload");
  }, [sigmaEngine]);

  const handleAnalysisSelect = useCallback(
    (mode: AnalysisMode) => {
      if (
        parsedData?.platform === "linux" &&
        (mode === "process-analysis" ||
          mode === "timeline" ||
          mode === "event-correlation")
      ) {
        return;
      }

      if (mode === "sigma") {
        // If analysis already ran for current rules/platform, go directly to analysis.
        // This includes valid zero-match runs.
        if (sigmaHasRun && selectedPlatform) {
          setAnalysisMode("sigma");
          setCurrentView("analysis");
        } else {
          setCurrentView("sigma-platform");
        }
      } else {
        setAnalysisMode(mode);
        setCurrentView("analysis");
      }
    },
    [parsedData, sigmaHasRun, selectedPlatform],
  );

  const handlePlatformSelect = async (
    platform: SigmaPlatform,
    categories: string[],
  ) => {
    const requestId = ++ruleLoadRequestIdRef.current;
    setSelectedPlatform(platform);
    setRulesLoading(true);

    // Clear any previously loaded rules
    sigmaEngine.clearRules();
    setSigmaMatches(new Map());
    setSigmaHasRun(false);
    setRuleLoadProgress(null);

    try {
      // Load rules for selected platform with progress tracking
      const { autoLoadRules } = await import("./lib/sigma/utils/autoLoadRules");
      const loadResult = await autoLoadRules(
        sigmaEngine,
        platform,
        (loaded, total) => {
          if (ruleLoadRequestIdRef.current !== requestId) return;
          setRuleLoadProgress({ loaded, total });
        },
        categories,
      );

      if (ruleLoadRequestIdRef.current !== requestId) {
        return;
      }

      if (loadResult.errors.length > 0) {
        console.warn(
          `[SIGMA] ${loadResult.loaded} rules loaded, ${loadResult.failed} failed. Errors:`,
          loadResult.errors.slice(0, 20),
        );
      }
      console.log(
        `[SIGMA] Successfully loaded ${loadResult.loaded} rules (${loadResult.failed} failed)`,
      );

      setRulesLoading(false);
      setRuleLoadProgress(null);

      // Switch to analysis view only after rules are loaded
      setAnalysisMode("sigma");
      setCurrentView("analysis");
    } catch (err) {
      if (ruleLoadRequestIdRef.current !== requestId) {
        return;
      }
      console.error("[SIGMA] Rule loading failed:", err);
      setRulesLoading(false);
      setRuleLoadProgress(null);
      // Stay on platform selector so user can retry
    }
  };

  const handleBackToSelector = useCallback(() => {
    setCurrentView("select");
    setAnalysisMode(null);
  }, []);

  const handleBackFromPlatformSelector = useCallback(() => {
    ruleLoadRequestIdRef.current += 1;
    setRulesLoading(false);
    setRuleLoadProgress(null);
    setCurrentView("select");
  }, []);

  const handlePlaybookSelect = useCallback(
    (playbookId: string, suggestedQuery: string) => {
      setActivePlaybookId(playbookId);
      setPlaybookQuery(suggestedQuery);
      handleAnalysisSelect("sigma");
    },
    [handleAnalysisSelect],
  );

  const handleRestoreAutosave = useCallback(() => {
    void (async () => {
      const autosave = await loadAutoSession();
      if (!autosave) {
        alert("Autosave payload is not available.");
        return;
      }
      setAnalysisPlatform(autosave.data.platform);
      setParsedData(autosave.data);
      setFilename(autosave.filename);
      setSelectedPlatform(autosave.platform as SigmaPlatform | null);
      setSigmaMatches(autosave.matches);
      setSigmaHasRun(true);
      setCurrentView("select");
    })();
  }, []);

  // ── Global keyboard shortcuts ────────────────────────────────
  // Declared after handlers so const references resolve without TDZ errors.
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Ignore when user is typing in an input / textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      // ? → toggle keyboard shortcut help
      if (e.key === "?") {
        e.preventDefault();
        setShowShortcutsHelp((prev) => !prev);
        return;
      }

      // Escape → go back one level (or close modals)
      if (e.key === "Escape") {
        e.preventDefault();
        if (showShortcutsHelp) {
          setShowShortcutsHelp(false);
          return;
        }
        if (currentView === "analysis") handleBackToSelector();
        else if (currentView === "sigma-platform")
          handleBackFromPlatformSelector();
        else if (currentView === "select" && parsedData) handleReset();
        return;
      }

      // Ctrl/Cmd+Shift shortcuts
      if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
        // L → toggle theme (works from any view)
        if (e.key.toLowerCase() === "l") {
          e.preventDefault();
          toggleTheme();
          return;
        }

        // B → toggle bookmark panel (works when data loaded)
        if (e.key.toLowerCase() === "b" && parsedData) {
          e.preventDefault();
          setShowBookmarkPanel((prev) => !prev);
          return;
        }

        // Quick navigation shortcuts (only from selector view)
        if (currentView === "select" && parsedData) {
          switch (e.key.toLowerCase()) {
            case "s":
              e.preventDefault();
              handleAnalysisSelect("sigma");
              break;
            case "d":
              e.preventDefault();
              handleAnalysisSelect("dashboards");
              break;
            case "t":
              e.preventDefault();
              handleAnalysisSelect("timeline");
              break;
            case "r":
              e.preventDefault();
              handleAnalysisSelect("raw-logs");
              break;
            case "i":
              e.preventDefault();
              handleAnalysisSelect("ioc-extraction");
              break;
            case "a":
              e.preventDefault();
              handleAnalysisSelect("rarity-analysis");
              break;
            case "e":
              e.preventDefault();
              handleAnalysisSelect("event-correlation");
              break;
            case "y":
              e.preventDefault();
              handleAnalysisSelect("yara-rule-lab");
              break;
          }
        }
      }
    },
    [
      currentView,
      parsedData,
      showShortcutsHelp,
      toggleTheme,
      handleBackToSelector,
      handleBackFromPlatformSelector,
      handleReset,
      handleAnalysisSelect,
    ],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const handleCustomRulesLoaded = async (count: number) => {
    console.log(`Loaded ${count} custom SIGMA rules`);
    // If we have data, we can immediately analyze it with the new rules
    if (parsedData) {
      // Clear previous matches to force re-analysis
      setSigmaMatches(new Map());
      setSigmaHasRun(false);
      // Switch to analysis view to trigger SigmaDetections to run analysis
      setAnalysisMode("sigma");
      setCurrentView("analysis");
    }
  };

  const handleLoadSession = (
    data: ParsedData,
    name: string,
    platform: string | null,
    matches: Map<string, SigmaRuleMatch[]>,
    _conversation?: { provider: string; model: string; messages: any[] },
  ) => {
    setAnalysisPlatform(data.platform);
    setParsedData(data);
    setFilename(name);
    setSelectedPlatform(platform as SigmaPlatform | null);
    setSigmaMatches(matches);
    setSigmaHasRun(true);
    setActivePlaybookId(null);
    setPlaybookQuery("");
    setCurrentView("select");
    // Note: conversation history will be handled by LLMAnalysis when it mounts
    // For now, we don't persist it in App state
  };

  // Render based on current view
  let content: JSX.Element;

  if (!analysisPlatform) {
    content = (
      <ErrorBoundary>
        <PlatformChooser
          onSelect={(platform) => setAnalysisPlatform(platform)}
        />
      </ErrorBoundary>
    );
  } else if (currentView === "upload" || !parsedData) {
    content = (
      <FileOperationErrorBoundary>
        {analysisPlatform === "windows" ? (
          <FileDropZone
            onFileLoaded={handleFileLoaded}
            rulesLoading={rulesLoading}
            onOpenSessions={() => setShowSessionManager(true)}
          />
        ) : (
          <LinuxDropZone
            onFileLoaded={handleFileLoaded}
            rulesLoading={rulesLoading}
            onOpenSessions={() => setShowSessionManager(true)}
          />
        )}
      </FileOperationErrorBoundary>
    );
  } else if (currentView === "select") {
    content = (
      <ErrorBoundary>
        <AnalysisSelector
          data={parsedData}
          filename={filename}
          onSelect={handleAnalysisSelect}
          onReset={handleReset}
          onOpenSessions={() => setShowSessionManager(true)}
          sigmaMatches={sigmaMatches}
          platform={selectedPlatform || parsedData.platform}
          onSelectPlaybook={handlePlaybookSelect}
        />
      </ErrorBoundary>
    );
  } else if (currentView === "sigma-platform") {
    content = (
      <ErrorBoundary>
        <Suspense
          fallback={<LoadingState message="Loading platform selector..." />}
        >
          <LazySigmaPlatformSelector
            onSelect={handlePlatformSelect}
            onBack={handleBackFromPlatformSelector}
            sigmaEngine={sigmaEngine}
            onCustomRulesLoaded={handleCustomRulesLoaded}
            defaultPlatform={parsedData.platform}
          />
        </Suspense>
      </ErrorBoundary>
    );
  } else if (analysisMode === "sigma") {
    content = (
      <AnalysisErrorBoundary>
        <SigmaAnalysisView
          data={parsedData}
          filename={filename}
          sigmaEngine={sigmaEngine}
          platform={selectedPlatform}
          rulesLoading={rulesLoading}
          ruleLoadProgress={ruleLoadProgress}
          onBack={handleBackToSelector}
          onOpenRawLogs={() => setAnalysisMode("raw-logs")}
          cachedMatches={sigmaHasRun ? sigmaMatches : undefined}
          onMatchesUpdate={(matches) => {
            setSigmaMatches(matches);
            setSigmaHasRun(true);
            if (sigmaCacheKey) {
              // Store Map as an array for JSON safety
              setCached(sigmaCacheKey, Array.from(matches.entries()));
            }
          }}
          cachedYaraMatches={yaraMatches ?? undefined}
          cachedYaraStats={yaraStats ?? undefined}
          onYaraMatchesUpdate={(matches, stats) => {
            setYaraMatches(matches);
            setYaraStats(stats);
            if (yaraCacheKey) {
              setCached(yaraCacheKey, { matches, stats });
            }
          }}
          onOpenYaraRuleLab={() => setAnalysisMode("yara-rule-lab")}
          playbookFilterId={activePlaybookId}
        />
      </AnalysisErrorBoundary>
    );
  } else if (analysisMode === "rarity-analysis") {
    content = (
      <AnalysisErrorBoundary>
        <Suspense
          fallback={
            <LoadingState message="Loading rarity analysis..." fullPage />
          }
        >
          <LazyRarityAnalysis data={parsedData} onBack={handleBackToSelector} />
        </Suspense>
      </AnalysisErrorBoundary>
    );
  } else if (analysisMode === "dashboards") {
    content = (
      <AnalysisErrorBoundary>
        <Suspense
          fallback={<LoadingState message="Loading dashboards..." fullPage />}
        >
          <LazyDashboards data={parsedData} onBack={handleBackToSelector} />
        </Suspense>
      </AnalysisErrorBoundary>
    );
  } else if (analysisMode === "yara-rule-lab") {
    content = (
      <AnalysisErrorBoundary>
        <Suspense
          fallback={
            <LoadingState message="Loading YARA Rule Lab..." fullPage />
          }
        >
          <LazyYaraRuleLab
            platform={parsedData.platform}
            onBack={handleBackToSelector}
          />
        </Suspense>
      </AnalysisErrorBoundary>
    );
  } else if (analysisMode === "process-analysis") {
    content = (
      <AnalysisErrorBoundary>
        <Suspense
          fallback={
            <LoadingState message="Loading process analysis..." fullPage />
          }
        >
          <LazyProcessExecutionDashboard
            entries={parsedData.entries}
            onBack={handleBackToSelector}
            onPivotToEvent={(entry) => setPivotEvent(entry)}
          />
        </Suspense>
      </AnalysisErrorBoundary>
    );
  } else if (analysisMode === "timeline") {
    content = (
      <AnalysisErrorBoundary>
        <Suspense
          fallback={<LoadingState message="Loading timeline..." fullPage />}
        >
          <TimelineAnalysisView
            data={parsedData}
            filename={filename}
            sigmaEngine={sigmaEngine}
            sigmaMatches={sigmaMatches}
            setSigmaMatches={setSigmaMatches}
            onBack={handleBackToSelector}
          />
        </Suspense>
      </AnalysisErrorBoundary>
    );
  } else if (analysisMode === "raw-logs") {
    content = (
      <ErrorBoundary>
        <Suspense
          fallback={<LoadingState message="Loading raw logs..." fullPage />}
        >
          <LazyRawLogsView
            data={parsedData}
            filename={filename}
            onBack={handleBackToSelector}
            sigmaMatches={sigmaMatches}
            initialSearchQuery={playbookQuery}
          />
        </Suspense>
      </ErrorBoundary>
    );
  } else if (analysisMode === "ai-analysis") {
    content = (
      <AnalysisErrorBoundary>
        <Suspense
          fallback={<LoadingState message="Loading AI analysis..." fullPage />}
        >
          <LazyLLMAnalysis
            data={parsedData}
            sigmaMatches={sigmaMatches}
            onBack={handleBackToSelector}
          />
        </Suspense>
      </AnalysisErrorBoundary>
    );
  } else if (analysisMode === "ioc-extraction") {
    content = (
      <AnalysisErrorBoundary>
        <Suspense
          fallback={
            <LoadingState message="Loading IOC extractor..." fullPage />
          }
        >
          <LazyIOCExtractor
            entries={parsedData.entries}
            onBack={handleBackToSelector}
            sigmaMatches={sigmaMatches}
          />
        </Suspense>
      </AnalysisErrorBoundary>
    );
  } else if (analysisMode === "event-correlation") {
    content = (
      <AnalysisErrorBoundary>
        <Suspense
          fallback={
            <LoadingState message="Loading correlation view..." fullPage />
          }
        >
          <LazyEventCorrelation
            entries={parsedData.entries}
            sigmaMatches={sigmaMatches}
            onBack={handleBackToSelector}
            data={parsedData}
            filename={filename}
            platform={selectedPlatform}
            onPivotToEvent={(entry) => setPivotEvent(entry)}
          />
        </Suspense>
      </AnalysisErrorBoundary>
    );
  } else {
    content = (
      <ErrorBoundary>
        <AnalysisSelector
          data={parsedData}
          filename={filename}
          onSelect={handleAnalysisSelect}
          onReset={handleReset}
          onOpenSessions={() => setShowSessionManager(true)}
          sigmaMatches={sigmaMatches}
          platform={selectedPlatform || parsedData.platform}
        />
      </ErrorBoundary>
    );
  }

  const sessionContext = parsedData
    ? {
        currentData: parsedData,
        currentFilename: filename,
        currentPlatform: selectedPlatform || parsedData.platform,
        currentMatches: sigmaMatches,
        currentConversation: undefined, // Conversation managed by LLMAnalysis
      }
    : {
        currentData: null,
        currentFilename: "",
        currentPlatform: null as SigmaPlatform | null,
        currentMatches: new Map<string, SigmaRuleMatch[]>(),
        currentConversation: undefined,
      };

  return (
    <div className="app">
      {!parsedData && autosaveAvailableAt && (
        <div
          style={{
            position: "fixed",
            top: 12,
            right: 12,
            zIndex: 2200,
            background: "rgba(15,23,42,0.92)",
            border: "1px solid rgba(96,165,250,0.35)",
            borderRadius: 8,
            padding: "8px 10px",
            display: "flex",
            gap: 8,
            alignItems: "center",
          }}
        >
          <span style={{ color: "#cbd5e1", fontSize: "0.78rem" }}>
            Autosave available (
            {new Date(autosaveAvailableAt).toLocaleTimeString()})
          </span>
          <button className="timeline-button" onClick={handleRestoreAutosave}>
            Restore
          </button>
          <button
            className="timeline-button"
            onClick={() => {
              void clearAutoSession();
              setAutosaveAvailableAt(null);
            }}
          >
            Dismiss
          </button>
        </div>
      )}
      <div className="app-main">{content}</div>

      {/* Theme toggle button */}
      <button
        className="theme-toggle-btn"
        onClick={toggleTheme}
        title={`Switch to ${theme === "dark" ? "light" : "dark"} mode (Ctrl+Shift+L)`}
      >
        {theme === "dark" ? "☀️" : "🌙"}
      </button>

      {/* Bookmark panel button — visible when data is loaded */}
      {parsedData && (
        <button
          className="theme-toggle-btn"
          onClick={() => setShowBookmarkPanel(true)}
          title="View bookmarked events (Ctrl+Shift+B)"
          style={{ left: 72, position: "fixed" }}
        >
          🔖
          {bookmarkCount > 0 && (
            <span
              style={{
                position: "absolute",
                top: -4,
                right: -4,
                background: "#ff4444",
                color: "#fff",
                borderRadius: "50%",
                minWidth: 18,
                height: 18,
                fontSize: "0.65rem",
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "0 4px",
                lineHeight: 1,
              }}
            >
              {bookmarkCount > 99 ? "99+" : bookmarkCount}
            </span>
          )}
        </button>
      )}

      {/* Keyboard shortcuts help button */}
      <button
        className="theme-toggle-btn"
        onClick={() => setShowShortcutsHelp(true)}
        title="Keyboard shortcuts (?)"
        style={{ left: parsedData ? 120 : 72 }}
      >
        ?
      </button>

      {showSessionManager && (
        <SessionManager
          {...sessionContext}
          onLoadSession={handleLoadSession}
          onClose={() => setShowSessionManager(false)}
        />
      )}

      {showBookmarkPanel && parsedData && (
        <BookmarkPanel
          entries={parsedData.entries}
          onClose={() => setShowBookmarkPanel(false)}
          onPivotToEvent={(entry) => {
            setShowBookmarkPanel(false);
            setPivotEvent(entry);
          }}
        />
      )}

      {pivotEvent && (
        <EventDetailsModal
          event={pivotEvent}
          isOpen={true}
          onClose={() => setPivotEvent(null)}
          title="Bookmarked Event"
        />
      )}

      {/* Keyboard shortcut help modal */}
      {showShortcutsHelp && (
        <div
          className="feedback-modal-backdrop"
          onClick={() => setShowShortcutsHelp(false)}
        >
          <div
            className="feedback-modal"
            onClick={(e) => e.stopPropagation()}
            style={{ width: 380 }}
          >
            <h3 style={{ marginBottom: "0.75rem" }}>⌨️ Keyboard Shortcuts</h3>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "0.85rem",
              }}
            >
              <tbody>
                {[
                  ["?", "Toggle this help panel"],
                  ["Escape", "Go back / close modals"],
                  ["Ctrl+Shift+L", "Toggle dark / light theme"],
                  ["Ctrl+Shift+B", "Toggle bookmark panel"],
                  ["Ctrl+Shift+S", "Open SIGMA detections"],
                  ["Ctrl+Shift+D", "Open Dashboards"],
                  ["Ctrl+Shift+T", "Open Timeline"],
                  ["Ctrl+Shift+R", "Open Raw Logs"],
                  ["Ctrl+Shift+Y", "Open YARA Rule Lab"],
                  ["Ctrl+Shift+I", "Open IOC Extraction"],
                  ["Ctrl+Shift+A", "Open Rarity Analysis"],
                  ["Ctrl+Shift+E", "Open Event Correlation"],
                ].map(([key, desc]) => (
                  <tr key={key}>
                    <td
                      style={{
                        padding: "4px 8px 4px 0",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <kbd
                        style={{
                          background: "rgba(255,255,255,0.08)",
                          border: "1px solid rgba(255,255,255,0.2)",
                          borderRadius: 4,
                          padding: "2px 6px",
                          fontFamily: "monospace",
                          fontSize: "0.8rem",
                        }}
                      >
                        {key}
                      </kbd>
                    </td>
                    <td style={{ padding: "4px 0", color: "#ccc" }}>{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p
              style={{
                marginTop: "0.75rem",
                fontSize: "0.75rem",
                color: "#888",
              }}
            >
              Navigation shortcuts work from the analysis selector view.
            </p>
            <button
              className="feedback-close"
              onClick={() => setShowShortcutsHelp(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// SIGMA Analysis View Component
interface SigmaAnalysisViewProps {
  data: ParsedData;
  filename: string;
  sigmaEngine: SigmaEngine;
  platform: SigmaPlatform | null;
  rulesLoading: boolean;
  ruleLoadProgress: { loaded: number; total: number } | null;
  onBack: () => void;
  onOpenRawLogs: () => void;
  onMatchesUpdate: (matches: Map<string, SigmaRuleMatch[]>) => void;
  cachedMatches?: Map<string, SigmaRuleMatch[]>;
  cachedYaraMatches?: YaraRuleMatch[];
  cachedYaraStats?: YaraScanStats;
  onYaraMatchesUpdate?: (
    matches: YaraRuleMatch[],
    stats: YaraScanStats | null,
  ) => void;
  onOpenYaraRuleLab?: () => void;
  playbookFilterId?: string | null;
}

function SigmaAnalysisView({
  data,
  filename,
  sigmaEngine,
  platform: _platform,
  rulesLoading: _rulesLoading,
  ruleLoadProgress: _ruleLoadProgress,
  onBack,
  onOpenRawLogs,
  onMatchesUpdate,
  cachedMatches,
  cachedYaraMatches,
  cachedYaraStats,
  onYaraMatchesUpdate,
  onOpenYaraRuleLab,
  playbookFilterId,
}: SigmaAnalysisViewProps) {
  // Skip loading screen - rules load in background
  return (
    <Dashboard
      data={data}
      filename={filename}
      onBack={onBack}
      onOpenRawLogs={onOpenRawLogs}
      sigmaEngine={sigmaEngine}
      onMatchesUpdate={onMatchesUpdate}
      cachedMatches={cachedMatches}
      cachedYaraMatches={cachedYaraMatches}
      cachedYaraStats={cachedYaraStats}
      onYaraMatchesUpdate={onYaraMatchesUpdate}
      onOpenYaraRuleLab={onOpenYaraRuleLab}
      playbookFilterId={playbookFilterId}
    />
  );
}

// Timeline Analysis View Component
interface TimelineAnalysisViewProps {
  data: ParsedData;
  filename: string;
  sigmaEngine: SigmaEngine;
  sigmaMatches: Map<string, SigmaRuleMatch[]>;
  setSigmaMatches: (matches: Map<string, SigmaRuleMatch[]>) => void;
  onBack: () => void;
}

function TimelineAnalysisView({
  data,
  sigmaEngine,
  sigmaMatches,
  setSigmaMatches,
  onBack,
}: TimelineAnalysisViewProps) {
  const [hasProcessed, setHasProcessed] = useState(sigmaMatches.size > 0);

  // If no SIGMA matches yet, show a processing state or run detection
  if (sigmaMatches.size === 0 && !hasProcessed) {
    return (
      <div className="dashboard">
        <div className="dashboard-header">
          <div>
            <h1>Threat Timeline</h1>
            <p className="tagline">Processing SIGMA detections...</p>
          </div>
          <button className="timeline-button" onClick={onBack}>
            ← Back to Selection
          </button>
        </div>
        <section className="sigma-section">
          <SigmaDetections
            events={data.entries}
            sigmaEngine={sigmaEngine}
            onMatchesUpdate={(matches: Map<string, SigmaRuleMatch[]>) => {
              setSigmaMatches(matches);
              setHasProcessed(true);
            }}
            cachedMatches={hasProcessed ? sigmaMatches : undefined}
            sourceFiles={data.sourceFiles}
          />
        </section>
      </div>
    );
  }

  return <LazyTimeline matches={sigmaMatches} onBack={onBack} />;
}

export default App;
