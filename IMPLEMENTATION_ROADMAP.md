# AlienX Desktop - Implementation Roadmap

## 📋 Sprint Planning & Task Tracking

### Sprint 0: Critical Fixes (1-2 hours)

**Goal:** Remove critical issues that could cause bugs or confusion

#### Task 0.1: Fix sigmaScanWorker.ts Cancellation ⚠️ BLOCKING

- **File:** `src/workers/sigmaScanWorker.ts`
- **Change:** Replace `running` with `cancelled` and implement actual cancellation
- **Why:** Dead code + misleading comment should be removed
- **Time:** 15 minutes
- **PR Review:** Check that cancel handler now breaks the loop

```bash
# Test:
npm run build # Should have no build errors
npm test # Run worker tests if available
```

#### Task 0.2: Fix React Hook ESLint Disables

- **File:** `src/components/LLMAnalysis.tsx`
- **Change:** Add `provider, model` to dependency array (line 104)
- **Change:** Add missing deps to line 174
- **Why:** Prevents stale state bugs
- **Time:** 10 minutes

```bash
# Test:
npm run lint # Should have no exhaustive-deps warnings
npm test -- LLMAnalysis
```

#### Task 0.3: Fix Event Listener Memory Leak

- **File:** `src/components/EventCorrelation.tsx`
- **Change:** Properly handle async unlisten promise
- **Why:** Prevents memory leaks in long sessions
- **Time:** 20 minutes

```bash
# Test:
npm run dev # Run analysis multiple times, watch DevTools Memory
# Check Tauri event listener count doesn't grow unbounded
```

---

### Sprint 1: Performance Optimizations (3-4 hours)

**Goal:** Significantly improve data processing speed

#### Task 1.1: Create Set Utils Module

- **Create:** `src/lib/utils/setUtils.ts`
- **Export:** `extractUnique()` and `extractUniqueFields()`
- **Tests:** Add unit tests in `src/lib/utils/__tests__/setUtils.test.ts`
- **Time:** 30 minutes

```typescript
// Unit test example
describe("extractUnique", () => {
  it("should extract unique values in single pass", () => {
    const items = [
      { id: 1, name: "A" },
      { id: 2, name: "A" },
      { id: 3, name: "B" },
    ];
    const result = extractUnique(items, (x) => x.name);
    expect(result.size).toBe(2);
  });
});
```

**Acceptance:** ✅ All tests pass, ESLint passes

#### Task 1.2: Replace Duplicate Set Creation Patterns

- **Files to Update:**
  - `src/components/Dashboard.tsx` (line 80)
  - `src/components/ProcessExecutionDashboard.tsx` (line 593)
  - `src/lib/correlationEngine.ts` (line 522)
  - `src/lib/llm/dataFormatter.ts` (lines 178-181, 574-575)

- **Pattern:** Replace `new Set(...map().filter())` with `extractUnique()`
- **Time:** 45 minutes
- **Testing:** Run full test suite, benchmark large file processing

```bash
npm run build # Verify no bundle size increase
npm test -- dataFormatter # Test data formatter specifically
npm run perf:test # If available, run performance tests
```

#### Task 1.3: Optimize Data Collection in dataFormatter

- **File:** `src/lib/llm/dataFormatter.ts` (lines 174-200)
- **Change:** Single-pass data collection for `formatParsedDataStats()`
- **Before:** 4 separate map+filter operations (O(n\*4))
- **After:** Single loop (O(n))
- **Time:** 25 minutes

**Expected Performance Gain:**

```
For 50K events:
  Before: 200K operations
  After:  50K operations
  Improvement: 4x faster ✨
```

#### Task 1.4: Memoize YaraDetections Dependencies

- **File:** `src/components/YaraDetections.tsx`
- **Change:** Memoize `customRules` and platform rules key in parent
- **Parent:** `src/components/SigmaDetections.tsx` (if using YaraDetections)
- **Time:** 20 minutes

```typescript
// Before: YaraDetections rescans when parent re-renders
// After: Stable references prevent unnecessary scans
const platformRulesKey = useMemo(
  () => platformCustomRules.map((r) => r.id).join(","),
  [platformCustomRules],
);
```

---

### Sprint 2: Code Quality & Refactoring (4-5 hours)

**Goal:** Improve maintainability and reduce code duplication

#### Task 2.1: Add Constants File

- **Create:** `src/constants/ui.ts`
- **Export:** Virtual scroll config, timers, row heights
- **Update:** All files using magic numbers to import from constants
- **Time:** 1 hour

**Files to update:**

- `src/components/SigmaDetections.tsx`
- `src/components/YaraDetections.tsx`
- `src/components/RawLogsView.tsx`
- `src/App.tsx`
- `src/components/IOCPivotView.tsx`

#### Task 2.2: Extract Inline Functions in IOCPivotView

- **Current Structure:** 100+ line component with 5 inline functions
- **New Structure:**
  - `src/components/IOCPivotView/PivotHelpers.ts` - utility functions
  - `src/components/IOCPivotView/EventRow.tsx` - component
  - `src/components/IOCPivotView/StatsBar.tsx` - component
  - Main component imports and composes

- **Benefits:**
  - Memoization possible
  - Reusable components
  - Better testability

- **Time:** 1.5 hours

```typescript
// Before: All in one file
// After: Composable structure
<IOCPivotView>
  <StatsBar data={searchResult} />
  <EventList events={searchResult.events} />
</IOCPivotView>
```

#### Task 2.3: Simplify Virtual Scroll in SigmaDetections

- **File:** `src/components/SigmaDetections.tsx`
- **Change:** Use IntersectionObserver instead of manual scroll
- **Remove:** Legacy scroll handler (50+ lines)
- **Add:** Single IntersectionObserver effect
- **Time:** 45 minutes

**Code diff:**

```diff
- useEffect(() => {
-   if (sortedMatches.length === 0) return;
-   lastScrollY.current = window.scrollY;
-   hasScrolledOnce.current = false;
-   const handleWindowScroll = () => { /* 40 lines */ };
-   let ticking = false;
-   const throttledScroll = () => { /* 5 lines */ };
-   window.addEventListener("scroll", throttledScroll);
-   return () => window.removeEventListener("scroll", throttledScroll);
- }, [sortedMatches]);

+ useEffect(() => {
+   const observer = new IntersectionObserver(
+     entries => {
+       if (entries[0].isIntersecting) {
+         setVisibleCount(prev => Math.min(prev + LOAD_MORE_COUNT, sortedMatches.length));
+       }
+     },
+     { rootMargin: "200px" }
+   );
+
+   if (sentinelRef.current) observer.observe(sentinelRef.current);
+   return () => observer.disconnect();
+ }, [sortedMatches.length]);
```

#### Task 2.4: Replace Bookmark Polling with Events

- **File:** `src/App.tsx` (lines 128-130)
- **Change:** Add event listeners instead of setInterval
- **Files also updating:** Any file that adds/removes bookmarks
- **Time:** 30 minutes

---

### Sprint 3: Testing & Validation (2-3 hours)

**Goal:** Ensure all changes work correctly

#### Task 3.1: Add Unit Tests for Utilities

- **Create:** `src/lib/utils/__tests__/`
- **Test:** setUtils.ts functions
- **Test:** Data collection efficiency
- **Coverage Goal:** 80%+

```bash
npm test -- --coverage src/lib/utils
```

#### Task 3.2: Performance Testing

- **Tool:** Lighthouse CI or custom benchmark
- **Measure:**
  - Data collection time (50K+ events)
  - YARA scan time
  - SIGMA scan time
  - Initial render time
- **Target:** 20-25% improvement on data-heavy operations

```bash
# Create benchmark script
npm run perf:benchmark
```

#### Task 3.3: Manual Testing Checklist

- [ ] Upload large EVTX file (100K+ events)
- [ ] Run SIGMA detection - verify no slowdown
- [ ] Run YARA detection - verify no slowdown
- [ ] Add/remove bookmarks - verify instant UI update
- [ ] Cancel ongoing analysis - verify worker stops
- [ ] Check DevTools Memory - verify no leaks over time
- [ ] Compare bundle sizes - verify reduction or no increase

#### Task 3.4: Regression Testing

```bash
npm run test      # Full test suite
npm run lint      # No ESLint errors
npm run type-check # No TypeScript errors
npm run build     # Production build succeeds
```

---

## 📊 Effort & Impact Matrix

| Task                      | Effort | Impact | Priority |
| ------------------------- | ------ | ------ | -------- |
| Fix cancellation (0.1)    | 15m    | High   | 🔴 1     |
| Fix hook deps (0.2)       | 10m    | High   | 🔴 2     |
| Fix memory leak (0.3)     | 20m    | High   | 🔴 3     |
| Create setUtils (1.1)     | 30m    | Medium | 🟠 4     |
| Replace duplicates (1.2)  | 45m    | High   | 🟠 5     |
| Optimize data (1.3)       | 25m    | High   | 🟠 6     |
| Memoize YARA (1.4)        | 20m    | Medium | 🟠 7     |
| Constants file (2.1)      | 60m    | Medium | 🟡 8     |
| Extract components (2.2)  | 90m    | Medium | 🟡 9     |
| Virtual scroll (2.3)      | 45m    | High   | 🟡 10    |
| Event-based updates (2.4) | 30m    | Low    | 🟡 11    |
| Unit tests (3.1)          | 60m    | High   | ✅ 12    |
| Perf testing (3.2)        | 45m    | Medium | ✅ 13    |
| Manual testing (3.3)      | 90m    | High   | ✅ 14    |
| Regression test (3.4)     | 30m    | High   | ✅ 15    |

**Total Estimated: 11-13 hours across 3 sprints**

---

## 🎯 Success Metrics

### Code Quality

- [ ] No TypeScript errors
- [ ] ESLint score: 0 critical violations
- [ ] Test coverage: 70%+
- [ ] Unused imports/variables: 0

### Performance

- [ ] Data collection: 4x faster (50K events)
- [ ] Bundle size: Stable or -1 to 2KB
- [ ] Virtual scroll: Smooth (60fps)
- [ ] Memory: No leaks over 30 min session

### User Experience

- [ ] Faster analysis for large files
- [ ] Bookmark updates instant
- [ ] No unexpected UI freezes
- [ ] Cancellation works reliably

---

## 📝 Monthly Maintenance

### Post-Implementation Checklist

- [ ] Monitor error logs for cancellation issues
- [ ] Track performance metrics (Sentry, LogRocket)
- [ ] Review bundle size on each release
- [ ] Audit React hook usage with ESLint
- [ ] Update constants when UI changes

---

## 🔗 Related Documentation

- [CODE_ANALYSIS_REPORT.md](CODE_ANALYSIS_REPORT.md) - Full technical analysis
- [QUICK_FIX_GUIDE.md](QUICK_FIX_GUIDE.md) - Copy-paste fixes
- [TypeScript Strict Mode](https://www.typescriptlang.org/tsconfig#strict)
- [React Hooks Rules](https://react.dev/reference/react/useEffect#specifying-reactive-dependencies)

---

**Created:** January 2025  
**Status:** Ready for implementation  
**Estimated Duration:** 11-13 hours (2-3 developers, 2-3 weeks)
