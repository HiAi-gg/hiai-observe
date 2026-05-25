import { Elysia, t } from "elysia";
import { searchLogs, getLogContainers, clearLogs, searchLogsRegex, searchLogsFuzzy, getLogVolume } from "../store/logs.js";
import { db } from "../store/db.js";
import { logs } from "../store/schema.js";
import { sql, gte } from "drizzle-orm";

export const logsPlugin = new Elysia({ prefix: "/api/logs" })
  .get("/stats", async () => {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [totalResult, byLevel, byContainer, byHour] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(logs).where(gte(logs.timestamp, since24h)),
      db.select({ level: logs.level, count: sql<number>`count(*)` }).from(logs).where(gte(logs.timestamp, since24h)).groupBy(logs.level),
      db.select({ container: logs.containerName, count: sql<number>`count(*)` }).from(logs).where(gte(logs.timestamp, since24h)).groupBy(logs.containerName).orderBy(sql`count(*) desc`).limit(10),
      db.select({ hour: sql<string>`date_trunc('hour', ${logs.timestamp})::text`, count: sql<number>`count(*)` }).from(logs).where(gte(logs.timestamp, since24h)).groupBy(sql`date_trunc('hour', ${logs.timestamp})`).orderBy(sql`date_trunc('hour', ${logs.timestamp})`),
    ]);

    return {
      total24h: totalResult[0]?.count ?? 0,
      byLevel: Object.fromEntries(byLevel.map(r => [r.level ?? "unknown", r.count])),
      byContainer: byContainer.map(r => ({ name: r.container, count: r.count })),
      byHour: byHour.map(r => ({ hour: r.hour, count: r.count })),
    };
  })
  .get(
    "/volume",
    async ({ query }) => {
      const { interval, containerId, from, to } = query;
      const result = await getLogVolume({
        interval: interval || "1h",
        containerId: containerId || undefined,
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
      });
      return { data: result };
    },
    {
      query: t.Object({
        interval: t.Optional(t.String()),
        containerId: t.Optional(t.String()),
        from: t.Optional(t.String()),
        to: t.Optional(t.String()),
      }),
    }
  )
  .get(
    "/",
    async ({ query }) => {
      const { container, level, search, regex, fuzzy, from, to, limit, offset } = query;

      // Regex search uses PostgreSQL ~ operator
      if (regex) {
        try {
          const result = await searchLogsRegex({
            pattern: regex,
            container: container || undefined,
            level: level || undefined,
            from: from ? new Date(from) : undefined,
            to: to ? new Date(to) : undefined,
            limit: limit ? Math.min(Number(limit), 1000) : 100,
            offset: offset ? Number(offset) : 0,
          });
          return { data: result };
        } catch {
          return { data: { logs: [], total: 0, limit: 100, offset: 0 }, error: "Invalid regex pattern" };
        }
      }

      // Fuzzy search uses pg_trgm similarity (requires CREATE EXTENSION pg_trgm)
      if (fuzzy) {
        try {
          const result = await searchLogsFuzzy({
            term: fuzzy,
            container: container || undefined,
            level: level || undefined,
            from: from ? new Date(from) : undefined,
            to: to ? new Date(to) : undefined,
            limit: limit ? Math.min(Number(limit), 1000) : 100,
            offset: offset ? Number(offset) : 0,
          });
          return { data: result };
        } catch {
          // Fallback to ILIKE if pg_trgm not available
          const result = await searchLogs({
            container: container || undefined,
            level: level || undefined,
            search: fuzzy,
            from: from ? new Date(from) : undefined,
            to: to ? new Date(to) : undefined,
            limit: limit ? Math.min(Number(limit), 1000) : 100,
            offset: offset ? Number(offset) : 0,
          });
          return { data: result };
        }
      }

      const result = await searchLogs({
        container: container || undefined,
        level: level || undefined,
        search: search || undefined,
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
        limit: limit ? Math.min(Number(limit), 1000) : 100,
        offset: offset ? Number(offset) : 0,
      });

      return { data: result };
    },
    {
      query: t.Object({
        container: t.Optional(t.String()),
        level: t.Optional(t.String()),
        search: t.Optional(t.String()),
        regex: t.Optional(t.String()),
        fuzzy: t.Optional(t.String()),
        from: t.Optional(t.String()),
        to: t.Optional(t.String()),
        limit: t.Optional(t.Numeric()),
        offset: t.Optional(t.Numeric()),
      }),
    }
  )
  .get("/containers", async () => {
    const containers = await getLogContainers();
    return { data: containers };
  })
  .delete(
    "/",
    async ({ query }) => {
      const before = query.before ? new Date(query.before) : undefined;
      const deleted = await clearLogs(before);
      return { deleted };
    },
    {
      query: t.Object({
        before: t.Optional(t.String()),
      }),
    }
  );
