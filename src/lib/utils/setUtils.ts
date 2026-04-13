/**
 * Utility functions for efficiently creating Sets from collections
 * Optimized for single-pass iteration over large datasets
 */

/**
 * Extract unique values from array in a single pass
 * @param items - Array to extract from
 * @param selector - Function to select value from each item
 * @returns Set of unique selected values
 *
 * @example
 * const eventIds = extractUnique(entries, e => e.eventId);
 * // Instead of: new Set(entries.map(e => e.eventId).filter(Boolean))
 */
export function extractUnique<T, K>(
  items: T[],
  selector: (item: T) => K | undefined | null,
): Set<K> {
  const result = new Set<K>();
  for (const item of items) {
    const value = selector(item);
    if (value !== undefined && value !== null) {
      result.add(value);
    }
  }
  return result;
}

/**
 * Extract multiple unique fields in a single pass
 * More efficient than calling extractUnique multiple times
 * @param entries - Array to extract from
 * @param fieldSelectors - Map of field name to selector function
 * @returns Object with Set for each field
 *
 * @example
 * const unique = extractUniqueFields(data.entries, {
 *   computers: e => e.computer,
 *   eventIds: e => e.eventId,
 *   ips: e => e.ip,
 *   sources: e => e.source,
 * });
 * // Instead of 4 separate Set creations, this does 1 pass
 */
export function extractUniqueFields<T>(
  entries: T[],
  fieldSelectors: Record<string, (entry: T) => any>,
): Record<string, Set<any>> {
  const result: Record<string, Set<any>> = {};

  // Initialize empty sets for each field
  for (const fieldName of Object.keys(fieldSelectors)) {
    result[fieldName] = new Set();
  }

  // Single pass through all entries
  for (const entry of entries) {
    for (const [fieldName, selector] of Object.entries(fieldSelectors)) {
      const value = selector(entry);
      if (value !== undefined && value !== null) {
        result[fieldName].add(value);
      }
    }
  }

  return result;
}
