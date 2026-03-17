/**
 * SIGMA Detection Engine - Public API
 *
 * Browser-based SIGMA rule engine for Windows Event Log analysis
 */

// Main engine
export { SigmaEngine, createSigmaEngine } from './SigmaEngine';

// Types
export type {
  SigmaRule,
  SigmaLogSource,
  SigmaLevel,
  SigmaStatus,
  SigmaModifier,
  SigmaFieldValue,
  SigmaDetection,
  ConditionNode,
  ConditionNodeType,
  CompiledSigmaRule,
  CompiledSelection,
  CompiledFieldCondition,
  SigmaRuleMatch,
  SelectionMatchResult,
  FieldMatchResult,
  SigmaEngineStats,
  SigmaConfig,
  SigmaValidationResult,
  SigmaValidationError,
  FieldExtractor,
  RuleSource,
  RuleMetadata
} from './types';

// Parser
export { parseSigmaRule, parseSigmaRules, parseSigmaRuleFile, validateSigmaRule } from './parser/yamlParser';
export { parseCondition, getReferencedSelections, expandPattern, validateCondition } from './parser/conditionParser';

// Engine
export { compileRule, compileRules, validateCompiledRule, optimizeCompiledRule, getRuleMetadata } from './engine/compiler';
export { matchRule, matchRules, matchAllEvents, matchAllEventsOptimized, preIndexEventFields, getIndexedField } from './engine/matcher';
export type { IndexedFields } from './engine/matcher';
export { applyModifier, parseFieldModifier, matchAny, matchAll, isValidModifier } from './engine/modifiers';
export { filterWindowsRules, isWindowsCompatibleRule, processEventsOptimized } from './engine/optimizedMatcher';
export type { OptimizedMatchStats } from './engine/optimizedMatcher';

// Utils
export { autoLoadRules, getAvailableRuleFiles } from './utils/autoLoadRules';
export { loadRulesFromFiles, loadRulesFromDirectory, validateRulesFromFiles, getRuleSummary, filterRules } from './utils/ruleLoader';
