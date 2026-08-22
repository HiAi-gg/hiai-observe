import { and, eq, gte, sql } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { lookupProject, resolveApiKey } from "../lib/auth.js";
import { applyScope, isScope } from "../lib/project-scope.js";
import { db } from "../store/db.js";
import { subscribeAllLogs, subscribeLogs } from "../store/log-pubsub.js";
import {
  clearLogs,
  getLogContainers,
  getLogVolume,
  searchLogs,
  searchLogsFuzzy,
  searchLogsRegex,
} from "../store/logs.js";
import { logs } from "../store/schema.js";

function logScopeFilter(scope: { projectId: string | undefined; admin: boolean }) {
  if (scope.projectId) return eq(logs.projectId, scope.projectId);
  if (scope.admin) return undefined;
  return sql`false`;
}

export const logsPlugin = new Elysia({ prefix: "/api/logs" })
  .get("/stats", async ({ request, query, set }) => {
    const scope = await applyScope({
      request,
      query: query as Record<string, unknown>,
      set,
    });
    if (!isScope(scope)) return scope;
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const projectFilter = logScopeFilter(scope);
    const window = projectFilter
      ? and(gte(logs.timestamp, since24h), projectFilter)
      : gte(logs.timestamp, since24h);
    const [totalResult, byLevel, byContainer, byHour] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(logs).where(window),
      db
        .select({ level: logs.level, count: sql<number>`count(*)` })
        .from(logs)
        .where(window)
        .groupBy(logs.level),
      db
        .select({ container: logs.containerName, count: sql<number>`count(*)` })
        .from(logs)
        .where(window)
        .groupBy(logs.containerName)
        .orderBy(sql`count(*) desc`)
        .limit(10),
      db
        .select({
          hour: sql<string>`date_trunc('hour', ${logs.timestamp})::text`,
          count: sql<number>`count(*)`,
        })
        .from(logs)
        .where(window)
        .groupBy(sql`date_trunc('hour', ${logs.timestamp})`)
        .orderBy(sql`date_trunc('hour', ${logs.timestamp})`),
    ]);

    return {
      total24h: totalResult[0]?.count ?? 0,
      byLevel: Object.fromEntries(byLevel.map((r) => [r.level ?? "unknown", r.count])),
      byContainer: byContainer.map((r) => ({ name: r.container, count: r.count })),
      byHour: byHour.map((r) => ({ hour: r.hour, count: r.count })),
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
    },
  )
  .get(
    "/",
    async ({ query, request, set }) => {
      const scope = await applyScope({
        request,
        query: query as Record<string, unknown>,
        set,
      });
      if (!isScope(scope)) return scope;
      const { container, level, search, regex, fuzzy, from, to, limit, offset } = query;
      const scoped = {
        projectId: scope.projectId,
        includeHostLogs: scope.admin && !scope.projectId,
      };

      // Regex search uses PostgreSQL ~ operator
      if (regex) {
        try {
          const result = await searchLogsRegex({
            ...scoped,
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
          return {
            data: { logs: [], total: 0, limit: 100, offset: 0 },
            error: "Invalid regex pattern",
          };
        }
      }

      // Fuzzy search uses pg_trgm similarity (requires CREATE EXTENSION pg_trgm)
      if (fuzzy) {
        try {
          const result = await searchLogsFuzzy({
            ...scoped,
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
            ...scoped,
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
        ...scoped,
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
    },
  )
  .get(
    "/stream",
    async ({ query, request, set }) => {
      const parsed =
        resolveApiKey(request.headers.get("authorization") ?? undefined) ??
        (request.headers.get("x-api-key")
          ? { apiKey: request.headers.get("x-api-key")!.trim() }
          : null);
      if (!parsed) {
        set.status = 401;
        return { error: "Authentication required via Authorization or X-Api-Key" };
      }
      const project = await lookupProject(parsed.apiKey);
      if (!project) {
        set.status = 401;
        return { error: "Invalid API key" };
      }
      const scope = await applyScope({
        request,
        query: query as Record<string, unknown>,
        set,
      });
      if (!isScope(scope)) return scope;

      set.headers["Content-Type"] = "text/event-stream";
      set.headers["Cache-Control"] = "no-cache";
      set.headers["Connection"] = "keep-alive";

      const container = query.container;
      const scopedProjectId = scope.projectId;
      const admin = scope.admin;

      let unsub: (() => void) | undefined;
      let pingInterval: any;

      const stream = new ReadableStream({
        async start(controller) {
          const sendLog = (entry: any) => {
            if (
              container &&
              entry.container_id !== container &&
              entry.container_name !== container
            ) {
              return;
            }
            const entryProject = entry.projectId ?? entry.project_id;
            if (!admin && scopedProjectId && entryProject !== scopedProjectId) {
              return;
            }
            try {
              controller.enqueue(`data: ${JSON.stringify(entry)}\n\n`);
            } catch {}
          };

          if (container) {
            unsub = await subscribeLogs(container, sendLog);
          } else {
            unsub = await subscribeAllLogs(sendLog);
          }

          pingInterval = setInterval(() => {
            try {
              controller.enqueue(`: ping\n\n`);
            } catch {
              if (unsub) unsub();
              clearInterval(pingInterval);
            }
          }, 15000);
        },
        cancel() {
          if (unsub) unsub();
          if (pingInterval) clearInterval(pingInterval);
        },
      });

      return new Response(stream);
    },
    {
      query: t.Object({
        container: t.Optional(t.String()),
      }),
    },
  )
  .get("/containers", async ({ request, query, set }) => {
    const scope = await applyScope({
      request,
      query: query as Record<string, unknown>,
      set,
    });
    if (!isScope(scope)) return scope;
    const containers = await getLogContainers({
      projectId: scope.projectId,
      includeHostLogs: scope.admin && !scope.projectId,
    });
    return { data: containers };
  })
  .delete(
    "/",
    async ({ query, request, set }) => {
      if (!query.confirm) {
        set.status = 400;
        return { error: "Must provide confirm=true to delete logs" };
      }
      const scope = await applyScope({
        request,
        query: query as Record<string, unknown>,
        set,
      });
      if (!isScope(scope)) return scope;
      const before = query.before ? new Date(query.before) : undefined;
      const deleted = await clearLogs({
        before,
        projectId: scope.projectId,
        includeHostLogs: scope.admin && !scope.projectId,
      });
      return { deleted };
    },
    {
      query: t.Object({
        before: t.Optional(t.String()),
        confirm: t.Optional(t.String()),
      }),
    },
  );
