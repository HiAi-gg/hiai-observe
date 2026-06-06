import { db } from "./db.js";
import { logs } from "./schema.js";
import { eq, and, gte, lte, ilike, sql, desc } from "drizzle-orm";
import type { NewLogEntry } from "./schema.js";

interface SearchLogsParams {
  container?: string;
  level?: string;
  search?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

export async function insertLogs(entries: Array<{
  containerId: string;
  containerName: string;
  stream: string;
  message: string;
  timestamp: Date;
  level?: string;
  raw?: unknown;
}>): Promise<void> {
  if (entries.length === 0) return;

  const rows: NewLogEntry[] = entries.map((e) => ({
    containerId: e.containerId,
    containerName: e.containerName,
    stream: e.stream,
    message: e.message,
    timestamp: e.timestamp,
    level: e.level ?? null,
    raw: e.raw ?? null,
  }));

  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    await db.insert(logs).values(chunk);
  }
}

export async function searchLogs(params: SearchLogsParams) {
  const { container, level, search, from, to, limit = 100, offset = 0 } = params;

  const conditions = [];
  if (container) conditions.push(eq(logs.containerId, container));
  if (level) conditions.push(eq(logs.level, level));
  if (search) conditions.push(ilike(logs.message, `%${search.replace(/[%_]/g, "\\$&")}%`));
  if (from) conditions.push(gte(logs.timestamp, from));
  if (to) conditions.push(lte(logs.timestamp, to));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, countResult] = await Promise.all([
    db.select().from(logs).where(where).orderBy(desc(logs.timestamp)).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(logs).where(where),
  ]);

  return { logs: rows, total: countResult[0]?.count ?? 0, limit, offset };
}

export async function getLogContainers() {
  return db
    .select({
      containerId: logs.containerId,
      containerName: logs.containerName,
      count: sql<number>`count(*)`,
      latest: sql<Date>`max(${logs.timestamp})`,
    })
    .from(logs)
    .groupBy(logs.containerId, logs.containerName)
    .orderBy(desc(sql`max(${logs.timestamp})`));
}

export async function clearLogs(before?: Date): Promise<number> {
  if (before) {
    const result = await db.delete(logs).where(lte(logs.timestamp, before)).returning({ id: logs.id });
    return result.length;
  }
  const result = await db.delete(logs).returning({ id: logs.id });
  return result.length;
}

interface SearchLogsRegexParams {
  pattern: string;
  container?: string;
  level?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

export async function searchLogsRegex(params: SearchLogsRegexParams) {
  const { pattern, container, level, from, to, limit = 100, offset = 0 } = params;

  if (pattern.length > 300) {
    return { logs: [], total: 0, limit, offset };
  }
  try { new RegExp(pattern); } catch {
    return { logs: [], total: 0, limit, offset };
  }
  if (/\([^)]+\)[+*?][+*?]/.test(pattern)) {
    return { logs: [], total: 0, limit, offset };
  }

  const conditions = [];
  // Use PostgreSQL ~ operator for regex matching
  conditions.push(sql`${logs.message} ~ ${pattern}`);
  if (container) conditions.push(eq(logs.containerId, container));
  if (level) conditions.push(eq(logs.level, level));
  if (from) conditions.push(gte(logs.timestamp, from));
  if (to) conditions.push(lte(logs.timestamp, to));

  const where = and(...conditions);

  const [rows, countResult] = await Promise.all([
    db.select().from(logs).where(where).orderBy(desc(logs.timestamp)).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(logs).where(where),
  ]);

  return { logs: rows, total: countResult[0]?.count ?? 0, limit, offset };
}

interface SearchLogsFuzzyParams {
  term: string;
  container?: string;
  level?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
  threshold?: number;
}

export async function searchLogsFuzzy(params: SearchLogsFuzzyParams) {
  const { term, container, level, from, to, limit = 100, offset = 0, threshold = 0.1 } = params;

  const conditions = [];
  // Use pg_trgm similarity() for fuzzy matching — requires CREATE EXTENSION IF NOT EXISTS pg_trgm
  conditions.push(sql`similarity(${logs.message}, ${term}) > ${threshold}`);
  if (container) conditions.push(eq(logs.containerId, container));
  if (level) conditions.push(eq(logs.level, level));
  if (from) conditions.push(gte(logs.timestamp, from));
  if (to) conditions.push(lte(logs.timestamp, to));

  const where = and(...conditions);

  const [rows, countResult] = await Promise.all([
    db.select().from(logs).where(where).orderBy(sql`similarity(${logs.message}, ${term}) desc`).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(logs).where(where),
  ]);

  return { logs: rows, total: countResult[0]?.count ?? 0, limit, offset };
}

interface LogVolumeParams {
  interval?: string;
  containerId?: string;
  from?: Date;
  to?: Date;
}

export async function getLogVolume(params: LogVolumeParams) {
  const { interval = "1h", containerId, from, to } = params;

  // Map shorthand to PostgreSQL interval for date_trunc
  const truncUnit: Record<string, string> = {
    "5m": "minute", "15m": "minute", "30m": "minute",
    "1h": "hour", "6h": "hour", "12h": "hour", "1d": "day",
  };
  const unit = truncUnit[interval] ?? "hour";

  const conditions = [];
  const effectiveFrom = from ?? new Date(Date.now() - 24 * 60 * 60 * 1000);
  const effectiveTo = to ?? new Date();
  conditions.push(gte(logs.timestamp, effectiveFrom));
  conditions.push(lte(logs.timestamp, effectiveTo));
  if (containerId) conditions.push(eq(logs.containerId, containerId));

  const where = and(...conditions);

  // Use raw SQL for date_trunc with the validated unit
  const truncExpr = sql.raw(`date_trunc('${unit}', "timestamp")`);

  const rows = await db
    .select({
      bucket: sql<string>`${truncExpr}::text`,
      count: sql<number>`count(*)`,
    })
    .from(logs)
    .where(where)
    .groupBy(truncExpr)
    .orderBy(truncExpr);

  return rows.map(r => ({ time: r.bucket, count: r.count }));
}
