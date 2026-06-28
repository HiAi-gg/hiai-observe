/**
 * Cross-project search API
 *
 * Searches across issues, events, and traces.
 */

import { and, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { parseLimit } from "../lib/pagination.js";
import { db } from "../store/db.js";
import { events, issues, projects, traces } from "../store/schema.js";

export const searchRoutes = new Elysia({ prefix: "/api/search" })

  // ── Cross-project search ────────────────────────────────────────────
  .get(
    "/",
    async ({ query }) => {
      const { q, projectId, limit = "50" } = query;
      const lim = parseLimit(limit);

      if (!q || q.trim().length < 2) {
        return { issues: [], events: [], traces: [] };
      }

      const escaped = q.replace(/[%_]/g, "\\$&");
      const pattern = `%${escaped}%`;

      // Search issues
      const issueConditions = [ilike(issues.title, pattern)];
      if (projectId) issueConditions.push(eq(issues.projectId, projectId));

      const matchedIssues = await db
        .select({
          id: issues.id,
          title: issues.title,
          type: issues.type,
          status: issues.status,
          count: issues.count,
          projectId: issues.projectId,
          lastSeen: issues.lastSeen,
        })
        .from(issues)
        .where(and(...issueConditions))
        .orderBy(desc(issues.lastSeen))
        .limit(lim);

      // Search events by message
      const eventConditions = [ilike(events.message, pattern)];
      if (projectId) eventConditions.push(eq(events.projectId, projectId));

      const matchedEvents = await db
        .select({
          id: events.id,
          message: events.message,
          exceptionType: events.exceptionType,
          level: events.level,
          projectId: events.projectId,
          createdAt: events.createdAt,
        })
        .from(events)
        .where(and(...eventConditions))
        .orderBy(desc(events.createdAt))
        .limit(lim);

      // Search traces by name
      const traceConditions = [ilike(traces.name, pattern)];
      if (projectId) traceConditions.push(eq(traces.projectId, projectId));

      const matchedTraces = await db
        .select({
          id: traces.id,
          name: traces.name,
          agent: sql<string | null>`null`,
          workflow: sql<string | null>`null`,
          durationMs: traces.durationMs,
          status: traces.status,
          projectId: traces.projectId,
          startTime: traces.startTime,
        })
        .from(traces)
        .where(and(...traceConditions))
        .orderBy(desc(traces.startTime))
        .limit(lim);

      // Get project names for grouping
      const projectIds = new Set([
        ...matchedIssues.map((i) => i.projectId),
        ...matchedEvents.map((e) => e.projectId),
        ...matchedTraces.map((t) => t.projectId),
      ]);

      const projectMap = new Map<string, string>();
      if (projectIds.size > 0) {
        const idArray = Array.from(projectIds);
        const projs = await db
          .select({ id: projects.id, name: projects.name })
          .from(projects)
          .where(inArray(projects.id, idArray));
        for (const p of projs) {
          projectMap.set(p.id, p.name);
        }
      }

      return {
        issues: matchedIssues.map((i) => ({
          ...i,
          projectName: projectMap.get(i.projectId) ?? "Unknown",
        })),
        events: matchedEvents.map((e) => ({
          ...e,
          projectName: projectMap.get(e.projectId) ?? "Unknown",
        })),
        traces: matchedTraces.map((t) => ({
          ...t,
          projectName: projectMap.get(t.projectId) ?? "Unknown",
        })),
      };
    },
    {
      query: t.Object({
        q: t.String({ minLength: 1 }),
        projectId: t.Optional(t.String({ format: "uuid" })),
        limit: t.Optional(t.String()),
      }),
    },
  );
