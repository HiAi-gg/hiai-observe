import { and, count, desc, eq, inArray } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { config } from "../lib/config.js";
import { db } from "../store/db.js";
import { events, issues, projects, uptimeMonitors } from "../store/schema.js";
import { getUptimePercentages } from "../store/uptime.js";

/**
 * tenantHealthPlugin — GET /api/tenant/:tenantId/health
 *
 * Returns a tenant-level health summary aggregating across all observe
 * projects bound to a given external tenant identifier
 * (`projects.tenant_id`). Designed for hiai-admin / hiai-dashboard shells
 * that manage tenants in their own domain model and need a single
 * rollup endpoint instead of N per-project queries.
 *
 * Response shape (see response schema below):
 *   {
 *     tenantId, projects, totalIssues, openIssues, avgUptime, lastError
 *   }
 *
 * Empty tenants return zeroed numerics and `lastError: null` rather than
 * 404 — the tenant id is an opaque external key, not a project UUID, so
 * a missing match is a valid "no projects bound yet" state.
 *
 * Auth: gated by ADMIN_API_KEY at handler level (see requireAdminKey) so
 * tenant summaries are not exposed to project-scoped API keys. The route
 * is also added to PUBLIC_PATHS in middleware/auth.ts so the global
 * project-key guard does not reject admin callers carrying only the
 * admin shared secret.
 */
function formatAgo(date: Date): string {
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function requireAdminKey(request: Request, set: { status?: number | string }): boolean {
  const expected = config.ADMIN_API_KEY;
  if (!expected) {
    // Fail closed if the operator has not configured an admin key — never
    // silently expose tenant summaries without a shared secret in place.
    set.status = 503;
    return false;
  }
  const auth = request.headers.get("authorization");
  const headerKey = request.headers.get("x-api-key");
  const presented = auth?.startsWith("Bearer ")
    ? auth.slice("Bearer ".length).trim()
    : headerKey?.trim();
  if (presented !== expected) {
    set.status = 401;
    return false;
  }
  return true;
}

export const tenantHealthPlugin = new Elysia().get(
  "/api/tenant/:tenantId/health",
  async ({ params, request, set }) => {
    if (!requireAdminKey(request, set as { status?: number | string })) {
      return { error: "Unauthorized" };
    }

    const { tenantId } = params;

    // 1. Resolve tenant → projects (one tenant may own multiple observe projects
    //    during migration; canonical model is 1:1 but the schema permits N:1).
    const tenantProjects = await db
      .select({ id: projects.id, name: projects.name, slug: projects.slug })
      .from(projects)
      .where(eq(projects.tenantId, tenantId));

    const projectIds = tenantProjects.map((p) => p.id);
    const projectsCount = tenantProjects.length;

    if (projectIds.length === 0) {
      return {
        tenantId,
        projects: 0,
        totalIssues: 0,
        openIssues: 0,
        avgUptime: 100,
        lastError: null,
      };
    }

    // 2. Aggregate issues + monitors in parallel — independent queries.
    const monitorsResult = await db
      .select({ id: uptimeMonitors.id })
      .from(uptimeMonitors)
      .where(inArray(uptimeMonitors.projectId, projectIds));
    const monitorIds = monitorsResult.map((m) => m.id);

    const [issuesAgg, openIssuesAgg, lastErrorRow] = await Promise.all([
      db.select({ value: count() }).from(issues).where(inArray(issues.projectId, projectIds)),
      db
        .select({ value: count() })
        .from(issues)
        .where(and(inArray(issues.projectId, projectIds), eq(issues.status, "unresolved"))),
      db
        .select({
          message: events.message,
          exceptionType: events.exceptionType,
          createdAt: events.createdAt,
        })
        .from(events)
        .where(and(inArray(events.projectId, projectIds), eq(events.level, "error")))
        .orderBy(desc(events.createdAt))
        .limit(1),
    ]);

    // 3. Average uptime across monitors (24h window). When no monitors
    //    exist we report 100 — the tenant has nothing to fail.
    let avgUptime = 100;
    if (monitorIds.length > 0) {
      const uptimeMap = await getUptimePercentages(monitorIds, 24);
      const values = Array.from(uptimeMap.values());
      const sum = values.reduce((acc, v) => acc + v, 0);
      avgUptime = Math.round((sum / values.length) * 100) / 100;
    }

    // 4. Format most recent error. Prefer `exceptionType: message` shape when
    //    the exception is set, otherwise fall back to message alone.
    const last = lastErrorRow[0];
    const lastError = last
      ? {
          ago: formatAgo(last.createdAt),
          message: last.exceptionType
            ? `${last.exceptionType}: ${last.message ?? ""}`.trim()
            : (last.message ?? ""),
        }
      : null;

    return {
      tenantId,
      projects: projectsCount,
      totalIssues: Number(issuesAgg[0]?.value ?? 0),
      openIssues: Number(openIssuesAgg[0]?.value ?? 0),
      avgUptime,
      lastError,
    };
  },
  {
    params: t.Object({
      tenantId: t.String({ minLength: 1, maxLength: 128 }),
    }),
  },
);
