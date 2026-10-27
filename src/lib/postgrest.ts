/**
 * Helpers for building PostgREST filter strings safely from user input.
 */

/** `%value%` with LIKE wildcards escaped, so "50%" matches literally. */
export function containsPattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * Quote a value for use inside `.or("col.ilike.<value>")`. Double quotes keep
 * commas, dots and parentheses in user input from being read as syntax.
 */
export function quoteFilterValue(value: string): string {
  return `"${value.replace(/["\\]/g, (c) => `\\${c}`)}"`;
}
