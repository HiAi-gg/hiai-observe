import { Elysia, t } from "elysia";
import { getMonitors, getChecks, getUptimePercentages } from "../store/uptime.js";
import { db } from "../store/db.js";
import { projects, incidents } from "../store/schema.js";
import { eq, and, ne, desc } from "drizzle-orm";

export const statusPagePlugin = new Elysia({ prefix: "/api/status" })
  .get("/:slug", async ({ params: { slug }, set }) => {
    const [project] = await db.select().from(projects).where(eq(projects.slug, slug)).limit(1);
    if (!project) { set.status = 404; return { error: "Status page not found" }; }

    const monitors = await getMonitors(project.id);

    const ids = monitors.map((m) => m.id);
    const uptimeMap = await getUptimePercentages(ids, 24);

    const monitorStatuses = await Promise.all(
      monitors.map(async (m) => {
        const uptime24h = uptimeMap.get(m.id) ?? 100;
        const { checks } = await getChecks(m.id, { limit: 96 });
        return {
          id: m.id,
          name: m.name,
          url: m.url,
          active: m.active,
          uptime24h,
          lastCheck: checks[0] ?? null,
        };
      })
    );

    const statuses = monitorStatuses.filter((m) => m.active);
    const down = statuses.filter((m) => m.lastCheck && !m.lastCheck.success);
    const degraded = statuses.filter((m) => m.lastCheck?.success && m.uptime24h < 99.9);

    let overall = "operational";
    if (down.length > 0) overall = "down";
    else if (degraded.length > 0) overall = "degraded";

    const activeIncidents = await db.select().from(incidents)
      .where(and(eq(incidents.projectId, project.id), ne(incidents.status, "resolved")))
      .orderBy(desc(incidents.createdAt));

    return {
      project: { id: project.id, name: project.name, slug: project.slug },
      overall,
      monitors: monitorStatuses,
      incidents: activeIncidents,
    };
  })

  .get("/:slug/history", async ({ params: { slug }, query, set }) => {
    const [project] = await db.select().from(projects).where(eq(projects.slug, slug)).limit(1);
    if (!project) { set.status = 404; return { error: "Status page not found" }; }

    const monitors = await getMonitors(project.id);
    const days = query.days ?? 30;

    const ids = monitors.map((m) => m.id);
    const uptimeMap = await getUptimePercentages(ids, days * 24);

    const history = monitors.map((m) => ({
      monitorId: m.id,
      name: m.name,
      uptimePercent: uptimeMap.get(m.id) ?? 100,
    }));

    return { history };
  }, {
    query: t.Object({
      days: t.Optional(t.Number({ minimum: 1, maximum: 90 })),
    }),
  });
