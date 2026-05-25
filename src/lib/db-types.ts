/**
 * Typed helper for raw SQL query results from db.execute().
 *
 * Drizzle's db.execute() returns a result that doesn't directly map to
 * Array<T>, requiring a double cast. This helper narrows the type cleanly.
 */
export function castDbRows<T>(result: unknown): T[] {
  return result as T[];
}
