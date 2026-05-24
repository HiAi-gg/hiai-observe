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
import { desc, eq, and, gte, count } from "drizzle-orm";
import { getUptimePercentages } from "../store/uptime.js";

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

    const [errorCountRow, traceCountRow, recentIssues, monitors, activeAlerts] = await Promise.all([
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
    ]);

    // Batch uptime percentage (single query instead of N)
    const monitorIds = monitors.map((m) => m.id);
    const uptimeMap = await getUptimePercentages(monitorIds, 24);
    const totalMonitors = monitors.length;
    const upMonitors = [...uptimeMap.values()].filter((v) => v >= 99.9).length;
    const uptimePercent = totalMonitors > 0 ? Math.round((upMonitors / totalMonitors) * 10000) / 100 : 100;

    // activeContainers — deduplicate by containerId, take latest
    const containerRows = await db
      .select({ containerId: containerStats.containerId, status: containerStats.status, collectedAt: containerStats.collectedAt })
      .from(containerStats)
      .where(gte(containerStats.collectedAt, fiveMinsAgo));

    const containerMap = new Map<string, { status: string; collectedAt: Date }>();
    for (const c of containerRows) {
      const existing = containerMap.get(c.containerId);
      if (!existing || c.collectedAt > existing.collectedAt) {
        containerMap.set(c.containerId, { status: c.status, collectedAt: c.collectedAt });
      }
    }
    const activeContainers = [...containerMap.values()].filter((v) => v.status === "running").length;

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
    };
  });
