/**
 * SIGMA YAML Parser
 *
 * Parses SIGMA rules from YAML format into typed SigmaRule objects
 */

import * as yaml from 'js-yaml';
import { SigmaRule, SigmaLogSource, SigmaLevel, SigmaStatus, SigmaValidationResult, SigmaValidationError } from '../types';

/**
 * Parse SIGMA rule from YAML string
 */
export function parseSigmaRule(yamlContent: string): SigmaRule {
  try {
    const doc = yaml.load(yamlContent, { schema: yaml.FAILSAFE_SCHEMA }) as any;

    if (!doc || typeof doc !== 'object') {
      throw new Error('Invalid YAML: must be an object');
    }

    // Extract and validate required fields
    const rule: SigmaRule = {
      title: String(doc.title || 'Untitled Rule'),
      id: String(doc.id || generateRuleId()),
      status: validateStatus(doc.status),
      description: doc.description ? String(doc.description) : undefined,
      author: doc.author ? String(doc.author) : undefined,
      date: doc.date ? String(doc.date) : undefined,
      modified: doc.modified ? String(doc.modified) : undefined,
      references: Array.isArray(doc.references)
        ? doc.references.map((r: unknown) => String(r))
        : doc.references
        ? [String(doc.references)]
        : undefined,
      tags: Array.isArray(doc.tags)
        ? doc.tags.map((t: unknown) => String(t))
        : doc.tags
        ? [String(doc.tags)]
        : undefined,
      falsepositives: Array.isArray(doc.falsepositives)
        ? doc.falsepositives.map((f: unknown) => String(f))
        : doc.falsepositives
        ? [String(doc.falsepositives)]
        : undefined,
      level: validateLevel(doc.level),
      logsource: parseLogSource(doc.logsource),
      detection: parseDetection(doc.detection),
      _originalYaml: yamlContent
    };

    return rule;
  } catch (error) {
    throw new Error(`Failed to parse SIGMA rule: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Parse multiple SIGMA rules from YAML content
 * Supports multi-document YAML files
 */
export function parseSigmaRules(yamlContent: string): SigmaRule[] {
  try {
    const docs = yaml.loadAll(yamlContent, undefined, { schema: yaml.FAILSAFE_SCHEMA });
    const rules: SigmaRule[] = [];

    for (const doc of docs) {
      if (doc && typeof doc === 'object') {
        const yamlStr = yaml.dump(doc);
        rules.push(parseSigmaRule(yamlStr));
      }
    }

    return rules;
  } catch (error) {
    throw new Error(`Failed to parse SIGMA rules: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Validate SIGMA rule structure
 */
export function validateSigmaRule(rule: SigmaRule): SigmaValidationResult {
  const errors: SigmaValidationError[] = [];
  const warnings: SigmaValidationError[] = [];

  // Required fields
  if (!rule.title || rule.title === 'Untitled Rule') {
    errors.push({
      field: 'title',
      message: 'Rule must have a title',
      severity: 'error'
    });
  }

  if (!rule.id) {
    errors.push({
      field: 'id',
      message: 'Rule must have an ID',
      severity: 'error'
    });
  }

  if (!rule.detection) {
    errors.push({
      field: 'detection',
      message: 'Rule must have a detection section',
      severity: 'error'
    });
  }

  if (!rule.detection.condition) {
    errors.push({
      field: 'detection.condition',
      message: 'Detection must have a condition',
      severity: 'error'
    });
  }

  // Recommended fields
  if (!rule.description) {
    warnings.push({
      field: 'description',
      message: 'Rule should have a description',
      severity: 'warning'
    });
  }

  if (!rule.level) {
    warnings.push({
      field: 'level',
      message: 'Rule should have a severity level',
      severity: 'warning'
    });
  }

  if (!rule.author) {
    warnings.push({
      field: 'author',
      message: 'Rule should have an author',
      severity: 'warning'
    });
  }

  // Validate detection selections
  const detectionKeys = Object.keys(rule.detection);
  const hasSelections = detectionKeys.some(k => k !== 'condition' && k !== 'timeframe');

  if (!hasSelections) {
    errors.push({
      field: 'detection',
      message: 'Detection must have at least one selection',
      severity: 'error'
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Parse log source section
 */
function parseLogSource(logsource: any): SigmaLogSource {
  if (!logsource || typeof logsource !== 'object') {
    return {};
  }

  return {
    product: logsource.product ? String(logsource.product) : undefined,
    service: logsource.service ? String(logsource.service) : undefined,
    category: logsource.category ? String(logsource.category) : undefined,
    definition: logsource.definition ? String(logsource.definition) : undefined
  };
}

/**
 * Parse detection section
 */
function parseDetection(detection: any): any {
  if (!detection || typeof detection !== 'object') {
    throw new Error('Detection must be an object');
  }

  // Return detection as-is - will be processed by condition parser
  return detection;
}

/**
 * Validate and normalize status
 */
function validateStatus(status: any): SigmaStatus | undefined {
  if (!status) return undefined;

  const validStatuses: SigmaStatus[] = ['experimental', 'test', 'stable', 'deprecated'];
  const normalized = String(status).toLowerCase() as SigmaStatus;

  if (validStatuses.includes(normalized)) {
    return normalized;
  }

  return 'experimental'; // Default
}

/**
 * Validate and normalize level
 */
function validateLevel(level: any): SigmaLevel | undefined {
  if (!level) return undefined;

  const validLevels: SigmaLevel[] = ['critical', 'high', 'medium', 'low', 'informational'];
  const normalized = String(level).toLowerCase() as SigmaLevel;

  if (validLevels.includes(normalized)) {
    return normalized;
  }

  return 'medium'; // Default
}

/**
 * Generate a unique rule ID
 */
function generateRuleId(): string {
  return `rule-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Parse SIGMA rule from file content
 * Convenience wrapper that handles common file formats
 */
export function parseSigmaRuleFile(content: string, filename: string): SigmaRule[] {
  const ext = filename.toLowerCase().split('.').pop();

  if (ext === 'yml' || ext === 'yaml') {
    return parseSigmaRules(content);
  }

  throw new Error(`Unsupported file type: ${ext}`);
}
