/**
 * SIGMA Rule Loader Utility
 *
 * Load SIGMA rules from files and directories
 */

import { SigmaEngine } from '../SigmaEngine';
import { parseSigmaRules, validateSigmaRule } from '../parser/yamlParser';

export interface LoadResult {
  loaded: number;
  failed: number;
  errors: { file: string; error: string }[];
  ruleIds: string[];
}

/**
 * Load SIGMA rules from File objects
 */
export async function loadRulesFromFiles(
  engine: SigmaEngine,
  files: File[]
): Promise<LoadResult> {
  const result: LoadResult = {
    loaded: 0,
    failed: 0,
    errors: [],
    ruleIds: []
  };

  for (const file of files) {
    try {
      const content = await file.text();

      // Try to parse and load rules
      const ruleIds = await engine.loadRules(content);

      result.loaded += ruleIds.length;
      result.ruleIds.push(...ruleIds);

      if (ruleIds.length === 0) {
        result.failed++;
        result.errors.push({
          file: file.name,
          error: 'No valid rules found in file'
        });
      }
    } catch (error) {
      result.failed++;
      result.errors.push({
        file: file.name,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return result;
}

/**
 * Load SIGMA rules from directory (using FileList from input[type=file])
 */
export async function loadRulesFromDirectory(
  engine: SigmaEngine,
  fileList: FileList
): Promise<LoadResult> {
  const files = Array.from(fileList).filter(
    file => file.name.endsWith('.yml') || file.name.endsWith('.yaml')
  );

  return loadRulesFromFiles(engine, files);
}

/**
 * Validate SIGMA rules from files without loading
 */
export async function validateRulesFromFiles(
  files: File[]
): Promise<{
  valid: number;
  invalid: number;
  results: { file: string; valid: boolean; errors: string[] }[];
}> {
  const results: { file: string; valid: boolean; errors: string[] }[] = [];
  let valid = 0;
  let invalid = 0;

  for (const file of files) {
    try {
      const content = await file.text();
      const rules = parseSigmaRules(content);

      for (const rule of rules) {
        const validation = validateSigmaRule(rule);

        results.push({
          file: file.name,
          valid: validation.valid,
          errors: validation.errors.map(e => e.message)
        });

        if (validation.valid) {
          valid++;
        } else {
          invalid++;
        }
      }
    } catch (error) {
      invalid++;
      results.push({
        file: file.name,
        valid: false,
        errors: [error instanceof Error ? error.message : String(error)]
      });
    }
  }

  return { valid, invalid, results };
}

/**
 * Get rule summary from files
 */
export async function getRuleSummary(files: File[]): Promise<{
  totalFiles: number;
  totalRules: number;
  bySeverity: Record<string, number>;
  byCategory: Record<string, number>;
}> {
  const summary = {
    totalFiles: files.length,
    totalRules: 0,
    bySeverity: {} as Record<string, number>,
    byCategory: {} as Record<string, number>
  };

  for (const file of files) {
    try {
      const content = await file.text();
      const rules = parseSigmaRules(content);

      summary.totalRules += rules.length;

      for (const rule of rules) {
        // Count by severity
        const level = rule.level || 'medium';
        summary.bySeverity[level] = (summary.bySeverity[level] || 0) + 1;

        // Count by category (from logsource)
        const category = rule.logsource?.category || 'unknown';
        summary.byCategory[category] = (summary.byCategory[category] || 0) + 1;
      }
    } catch (error) {
      // Skip invalid files
    }
  }

  return summary;
}

/**
 * Filter rules by criteria
 */
export async function filterRules(
  files: File[],
  criteria: {
    severity?: string[];
    category?: string[];
    tags?: string[];
  }
): Promise<File[]> {
  const filtered: File[] = [];

  for (const file of files) {
    try {
      const content = await file.text();
      const rules = parseSigmaRules(content);

      const matches = rules.some(rule => {
        // Check severity
        if (criteria.severity && rule.level) {
          if (!criteria.severity.includes(rule.level)) {
            return false;
          }
        }

        // Check category
        if (criteria.category && rule.logsource?.category) {
          if (!criteria.category.includes(rule.logsource.category)) {
            return false;
          }
        }

        // Check tags
        if (criteria.tags && rule.tags) {
          const hasTag = criteria.tags.some(tag =>
            rule.tags!.some(t => t.includes(tag))
          );
          if (!hasTag) {
            return false;
          }
        }

        return true;
      });

      if (matches) {
        filtered.push(file);
      }
    } catch (error) {
      // Skip invalid files
    }
  }

  return filtered;
}
