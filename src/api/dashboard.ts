import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../store/db.js";
import {
  alerts,
  containerStats,
  events,
  issues,
  projects,
  traces,
  uptimeMonitors,
} from "../store/schema.js";
import { getUptimePercentages } from "../store/uptime.js";

export interface HourlyBucket {
  hour: string; // ISO hour string
  count: number;
}

export const dashboardRoutes = new Elysia({ prefix: "/api/dashboard" }).get(
  "/",
  async ({ query }) => {
    // `tenantId` is accepted as an alias for `projectId` per
    // docs/EMBED.md §"Scope Parameters". tenantScopePlugin normalises
    // both forms into `query.projectId` (see src/middleware/tenant-scope.ts),
    // so reading `query.projectId` here is sufficient — but we also accept
    // `query.tenantId` directly for callers that hit the route without the
    // global plugin in their test harness.
    const q = query as Record<string, string | undefined>;
    const projectId = q.projectId ?? q.tenantId;
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const fiveMinsAgo = new Date(now.getTime() - 5 * 60 * 1000);

    // Build optional projectId filter
    const projectFilter = projectId ? eq(events.projectId, projectId) : undefined;
    const issueProjectFilter = projectId ? eq(issues.projectId, projectId) : undefined;
    const traceProjectFilter = projectId ? eq(traces.projectId, projectId) : undefined;
    const monitorProjectFilter = projectId ? eq(uptimeMonitors.projectId, projectId) : undefined;
    const alertProjectFilter = projectId ? eq(alerts.projectId, projectId) : undefined;

    const [
      errorCountRow,
      traceCountRow,
      recentIssues,
      monitors,
      activeAlerts,
      errorBuckets,
      traceBuckets,
      recentEvents,
      projectsCountRow,
    ] = await Promise.all([
      // errorCount24h
      db
        .select({ value: count() })
        .from(events)
        .where(
          and(eq(events.level, "error"), gte(events.createdAt, twentyFourHoursAgo), projectFilter),
        ),

      // traceCount24h
      db
        .select({ value: count() })
        .from(traces)
        .where(and(gte(traces.startTime, twentyFourHoursAgo), traceProjectFilter)),

      // recentIssues — last 5 (select only needed columns)
      db
        .select({
          id: issues.id,
          title: issues.title,
          type: issues.type,
          count: issues.count,
          status: issues.status,
          lastSeen: issues.lastSeen,
        })
        .from(issues)
        .where(issueProjectFilter)
        .orderBy(desc(issues.lastSeen))
        .limit(5),

      // active monitors (select only needed columns)
      db
        .select({
          id: uptimeMonitors.id,
          name: uptimeMonitors.name,
          url: uptimeMonitors.url,
          active: uptimeMonitors.active,
        })
        .from(uptimeMonitors)
        .where(and(eq(uptimeMonitors.active, true), monitorProjectFilter)),

      // activeAlerts count
      db
        .select({ value: count() })
        .from(alerts)
        .where(and(eq(alerts.isActive, true), alertProjectFilter)),

      // Hourly error buckets (last 24h) — typed Drizzle select with sql<> casts.
      // We can't use the typed query builder directly for date_trunc('hour', ...)
      // (Drizzle doesn't expose it as a top-level helper), but we can use the
      // typed select builder with explicit `sql<>` column expressions instead
      // of falling through to db.execute(sql`...`) with a double cast.
      db
        .select({
          hour: sql<string>`date_trunc('hour', ${events.createdAt})`,
          count: sql<number>`count(*)::int`,
        })
        .from(events)
        .where(
          and(eq(events.level, "error"), gte(events.createdAt, twentyFourHoursAgo), projectFilter),
        )
        .groupBy(sql`date_trunc('hour', ${events.createdAt})`)
        .orderBy(sql`date_trunc('hour', ${events.createdAt})`),

      // Hourly trace buckets (last 24h)
      db
        .select({
          hour: sql<string>`date_trunc('hour', ${traces.startTime})`,
          count: sql<number>`count(*)::int`,
        })
        .from(traces)
        .where(and(gte(traces.startTime, twentyFourHoursAgo), traceProjectFilter))
        .groupBy(sql`date_trunc('hour', ${traces.startTime})`)
        .orderBy(sql`date_trunc('hour', ${traces.startTime})`),

      // recentEvents — last 10 events (used by /embed/dashboard; safe to
      // expose on /api/dashboard too since the response is project-scoped
      // when projectId is set).
      db
        .select({
          id: events.id,
          projectId: events.projectId,
          message: events.message,
          exceptionType: events.exceptionType,
          level: events.level,
          createdAt: events.createdAt,
        })
        .from(events)
        .where(projectFilter)
        .orderBy(desc(events.createdAt))
        .limit(10),

      // projectsCount — admin scope (no projectId) returns total;
      // project-scoped returns 1 (the caller only sees its own project).
      db.select({ value: count() }).from(projects),
    ]);

    // Fill in missing hours with zero counts for sparklines
    function fillBuckets(buckets: HourlyBucket[]): HourlyBucket[] {
      const map = new Map<string, number>();
      for (const b of buckets) {
        const key = `${new Date(b.hour).toISOString().slice(0, 13)}:00:00.000Z`;
        map.set(key, b.count);
      }
      const result: HourlyBucket[] = [];
      for (let i = 23; i >= 0; i--) {
        const h = new Date(now.getTime() - i * 3600_000);
        const key = `${h.toISOString().slice(0, 13)}:00:00.000Z`;
        result.push({ hour: key, count: map.get(key) ?? 0 });
      }
      return result;
    }

    // Batch uptime percentage (single query instead of N)
    const monitorIds = monitors.map((m) => m.id);
    const uptimeMap = await getUptimePercentages(monitorIds, 24);
    const totalMonitors = monitors.length;
    const upMonitors = [...uptimeMap.values()].filter((v) => v >= 99.9).length;
    const uptimePercent =
      totalMonitors > 0 ? Math.round((upMonitors / totalMonitors) * 10000) / 100 : 100;

    // activeContainers — SQL DISTINCT ON instead of JS dedup
    const latestContainers = await db
      .selectDistinctOn([containerStats.containerId], {
        containerId: containerStats.containerId,
        status: containerStats.status,
      })
      .from(containerStats)
      .where(gte(containerStats.collectedAt, fiveMinsAgo))
      .orderBy(containerStats.containerId, desc(containerStats.collectedAt));

    const activeContainers = latestContainers.filter((v) => v.status === "running").length;

    // healthStatus — derived from monitor snapshot.
    // "healthy"   — all active monitors are up (uptime ≥ 99.9%)
    // "degraded"  — at least one active monitor has uptime < 99.9% but is up
    // "down"      — at least one active monitor is currently failing checks
    const activeMonitors = monitors;
    const downCount = activeMonitors.filter((m) => {
      const up = uptimeMap.get(m.id) ?? 100;
      return up < 99.0;
    }).length;
    const degradedCount = activeMonitors.filter((m) => {
      const up = uptimeMap.get(m.id) ?? 100;
      return up >= 99.0 && up < 99.9;
    }).length;
    const healthStatus: "healthy" | "degraded" | "down" =
      activeMonitors.length === 0
        ? "healthy"
        : downCount > 0
          ? "down"
          : degradedCount > 0
            ? "degraded"
            : "healthy";

    const activeIssues = recentIssues.filter((i) => i.status === "unresolved").length;

    return {
      // Dashboard overview fields (OBS2.4 — for /embed/dashboard parity)
      projectsCount: projectId ? 1 : (projectsCountRow[0]?.value ?? 0),
      activeIssues,
      activeAlerts: activeAlerts[0]?.value ?? 0,
      healthStatus,
      recentEvents,
      monitors: monitors.map((m) => ({
        id: m.id,
        name: m.name,
        url: m.url,
        active: m.active,
        uptime24h: uptimeMap.get(m.id) ?? 100,
        isUp: (uptimeMap.get(m.id) ?? 100) >= 99.9,
      })),
      // Legacy fields preserved for backward compatibility with the
      // /api/dashboard contract documented in docs/EMBED.md
      errorCount24h: errorCountRow[0]?.value ?? 0,
      uptimePercent,
      activeContainers,
      traceCount24h: traceCountRow[0]?.value ?? 0,
      recentIssues,
      monitorStatuses: monitors.map((m) => ({
        id: m.id,
        name: m.name,
        url: m.url,
        active: m.active,
        isUp: (uptimeMap.get(m.id) ?? 100) >= 99.9,
      })),
      alertCount: activeAlerts[0]?.value ?? 0,
      errorBuckets: fillBuckets(errorBuckets),
      traceBuckets: fillBuckets(traceBuckets),
    };
  },
  {
    query: t.Object({
      projectId: t.Optional(t.String()),
      // `tenantId` is accepted as a tenant alias per docs/EMBED.md §"Scope
      // Parameters" / OBS2.3b. We accept it here as an untyped string (no
      // UUID format) so non-UUID tenant identifiers used by hiai-admin
      // work transparently — tenantScopePlugin will copy the value into
      // projectId before downstream filters run.
      tenantId: t.Optional(t.String()),
    }),
  },
);
