import { Elysia } from "elysia";
import { db } from "../store/db.js";
import {
  events,
  issues,
  traces,
  uptimeMonitors,
  containerStats,
  alerts,
} from "../store/schema.js";
import { desc, eq, and, gte, count, sql } from "drizzle-orm";
import { getUptimePercentages } from "../store/uptime.js";

export interface HourlyBucket {
  hour: string; // ISO hour string
  count: number;
}

export const dashboardRoutes = new Elysia({ prefix: "/api/dashboard" })
  .get("/", async ({ query }) => {
    const projectId = (query as Record<string, string | undefined>).projectId;
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const fiveMinsAgo = new Date(now.getTime() - 5 * 60 * 1000);

    // Build optional projectId filter
    const projectFilter = projectId ? eq(events.projectId, projectId) : undefined;
    const issueProjectFilter = projectId ? eq(issues.projectId, projectId) : undefined;
    const traceProjectFilter = projectId ? eq(traces.projectId, projectId) : undefined;
    const monitorProjectFilter = projectId ? eq(uptimeMonitors.projectId, projectId) : undefined;
    const alertProjectFilter = projectId ? eq(alerts.projectId, projectId) : undefined;

    const [errorCountRow, traceCountRow, recentIssues, monitors, activeAlerts, errorBuckets, traceBuckets] = await Promise.all([
      // errorCount24h
      db
        .select({ value: count() })
        .from(events)
        .where(and(eq(events.level, "error"), gte(events.createdAt, twentyFourHoursAgo), projectFilter)),

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

      // Hourly error buckets (last 24h)
      db.execute(
        sql`SELECT date_trunc('hour', created_at) AS hour, count(*)::int AS count
            FROM events
            WHERE level = 'error' AND created_at >= ${twentyFourHoursAgo.toISOString()}
            ${projectId ? sql`AND project_id = ${projectId}` : sql``}
            GROUP BY hour ORDER BY hour`
      ) as unknown as Promise<HourlyBucket[]>,

      // Hourly trace buckets (last 24h)
      db.execute(
        sql`SELECT date_trunc('hour', start_time) AS hour, count(*)::int AS count
            FROM traces
            WHERE start_time >= ${twentyFourHoursAgo.toISOString()}
            ${projectId ? sql`AND project_id = ${projectId}` : sql``}
            GROUP BY hour ORDER BY hour`
      ) as unknown as Promise<HourlyBucket[]>,
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
    const uptimePercent = totalMonitors > 0 ? Math.round((upMonitors / totalMonitors) * 10000) / 100 : 100;

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

    return {
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
  });
