import { db } from "./db.js";
import { logs } from "./schema.js";
import { eq, and, gte, lte, ilike, sql, desc } from "drizzle-orm";
import type { LogEntry, NewLogEntry } from "./schema.js";

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
