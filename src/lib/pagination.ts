/**
 * Centralized pagination parsers.
 *
 * Query string values arrive as strings (Elysia t.String() schema). We coerce
 * them to numbers defensively — handling NaN, negative values, and very large
 * values that could be used to coerce the DB into a full table scan.
 *
 * Defaults: limit=50, offset=0. Max limit is 200 to prevent unbounded reads.
 */

export function parseLimit(value: unknown, defaultVal = 50, max = 200): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return defaultVal;
  return Math.min(Math.floor(n), max);
}

export function parseOffset(value: unknown, defaultVal = 0): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return defaultVal;
  return Math.floor(n);
}
