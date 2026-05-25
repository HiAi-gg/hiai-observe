import { db } from "./db.js";
import { uptimeMonitors, uptimeChecks } from "./schema.js";
import { eq, and, gte, count, sql, inArray } from "drizzle-orm";

export async function getMonitors(projectId?: string, group?: string) {
  const conditions = [];
  if (projectId) conditions.push(eq(uptimeMonitors.projectId, projectId));
  if (group) conditions.push(eq(uptimeMonitors.monitorGroup, group));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  return db
    .select()
    .from(uptimeMonitors)
    .where(where)
    .orderBy(uptimeMonitors.createdAt);
}

export async function getMonitor(id: string) {
  const [monitor] = await db
    .select()
    .from(uptimeMonitors)
    .where(eq(uptimeMonitors.id, id))
    .limit(1);

  if (!monitor) return null;

  const [latestCheck] = await db
    .select()
    .from(uptimeChecks)
    .where(eq(uptimeChecks.monitorId, id))
    .orderBy(sql`${uptimeChecks.checkedAt} DESC`)
    .limit(1);

  return { ...monitor, latestCheck };
}

export async function createMonitor(data: {
  name: string;
  url: string;
  intervalSeconds: number;
  projectId: string;
  type?: string;
  monitorGroup?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  authType?: string;
  authValue?: string;
  ignoreSsl?: boolean;
  maxRedirects?: number;
  keyword?: string;
  keywordNot?: string;
  dnsRecordType?: string;
  dnsExpectedValue?: string;
  dnsResolver?: string;
}) {
  const [monitor] = await db
    .insert(uptimeMonitors)
    .values({
      name: data.name,
      url: data.url,
      type: data.type ?? "http",
      monitorGroup: data.monitorGroup ?? null,
      intervalSeconds: data.intervalSeconds,
      projectId: data.projectId,
      method: data.method ?? "GET",
      headers: data.headers ?? null,
      body: data.body ?? null,
      authType: data.authType ?? null,
      authValue: data.authValue ?? null,
      ignoreSsl: data.ignoreSsl ?? false,
      maxRedirects: data.maxRedirects ?? 5,
      keyword: data.keyword ?? null,
      keywordNot: data.keywordNot ?? null,
      dnsRecordType: data.dnsRecordType ?? null,
      dnsExpectedValue: data.dnsExpectedValue ?? null,
      dnsResolver: data.dnsResolver ?? null,
    })
    .returning();

  return monitor;
}

export async function getMonitorGroups(projectId?: string) {
  const conditions = projectId ? [eq(uptimeMonitors.projectId, projectId)] : [];
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select({
      group: uptimeMonitors.monitorGroup,
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(uptimeMonitors)
    .where(and(where, sql`${uptimeMonitors.monitorGroup} IS NOT NULL`))
    .groupBy(uptimeMonitors.monitorGroup)
    .orderBy(uptimeMonitors.monitorGroup);

  return rows.filter(r => r.group !== null);
}

export async function updateMonitor(
  id: string,
  data: Partial<{
    name: string;
    url: string;
    intervalSeconds: number;
    active: boolean;
    method: string;
    headers: Record<string, string>;
    body: string;
    authType: string;
    authValue: string;
    ignoreSsl: boolean;
    maxRedirects: number;
    keyword: string;
    keywordNot: string;
    dnsRecordType: string;
    dnsExpectedValue: string;
    dnsResolver: string;
  }>
) {
  const [monitor] = await db
    .update(uptimeMonitors)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(uptimeMonitors.id, id))
    .returning();

  return monitor;
}

export async function deleteMonitor(id: string) {
  await db.delete(uptimeChecks).where(eq(uptimeChecks.monitorId, id));
  await db.delete(uptimeMonitors).where(eq(uptimeMonitors.id, id));
}

export async function insertCheck(data: {
  monitorId: string;
  statusCode: number | null;
  responseTimeMs: number;
  error: string | null;
  success: boolean;
  certExpiry?: Date | null;
}) {
  const [check] = await db
    .insert(uptimeChecks)
    .values(data)
    .returning();

  return check;
}

export async function getChecks(
  monitorId: string,
  opts: {
    limit?: number;
    offset?: number;
    from?: Date;
    to?: Date;
  } = {}
) {
  const { limit = 50, offset = 0, from, to } = opts;

  const conditions = [eq(uptimeChecks.monitorId, monitorId)];
  if (from) conditions.push(gte(uptimeChecks.checkedAt, from));
  if (to) conditions.push(sql`${uptimeChecks.checkedAt} <= ${to}`);

  const where = and(...conditions);

  const [checks, totalRows] = await Promise.all([
    db
      .select()
      .from(uptimeChecks)
      .where(where)
      .orderBy(sql`${uptimeChecks.checkedAt} DESC`)
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(uptimeChecks)
      .where(where),
  ]);

  return {
    checks,
    total: totalRows[0]?.total ?? 0,
    limit,
    offset,
  };
}

export async function getUptimePercentage(
  monitorId: string,
  hours: number
): Promise<number> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const result = await db
    .select({
      total: count(),
      up: sql<number>`COUNT(*) FILTER (WHERE ${uptimeChecks.success} = true)`.mapWith(Number),
    })
    .from(uptimeChecks)
    .where(
      and(
        eq(uptimeChecks.monitorId, monitorId),
        gte(uptimeChecks.checkedAt, since)
      )
    );

  const total = result[0]?.total ?? 0;
  const up = result[0]?.up ?? 0;
  if (total === 0) return 100;
  return Math.round((up / total) * 10000) / 100;
}

export async function getUptimePercentages(
  monitorIds: string[],
  hours: number
): Promise<Map<string, number>> {
  if (monitorIds.length === 0) return new Map();
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const result = await db
    .select({
      monitorId: uptimeChecks.monitorId,
      total: count(),
      up: sql<number>`COUNT(*) FILTER (WHERE ${uptimeChecks.success} = true)`.mapWith(Number),
    })
    .from(uptimeChecks)
    .where(and(inArray(uptimeChecks.monitorId, monitorIds), gte(uptimeChecks.checkedAt, since)))
    .groupBy(uptimeChecks.monitorId);

  const map = new Map<string, number>();
  for (const row of result) {
    map.set(row.monitorId, row.total === 0 ? 100 : Math.round((row.up / row.total) * 10000) / 100);
  }
  for (const id of monitorIds) {
    if (!map.has(id)) map.set(id, 100);
  }
  return map;
}
