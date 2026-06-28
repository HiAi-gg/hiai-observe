import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { hashApiKey, maskApiKey } from "../lib/auth.js";
import { db } from "../store/db.js";
import {
  alertHistory,
  alerts,
  events,
  incidents,
  issues,
  maintenanceWindows,
  notificationConfig,
  projects,
  traces,
  uptimeChecks,
  uptimeMonitors,
} from "../store/schema.js";

export const projectsRoutes = new Elysia({ prefix: "/api/projects" })

  .get("/", async () => {
    const items = await db
      .select({
        id: projects.id,
        name: projects.name,
        slug: projects.slug,
        keyPrefix: projects.keyPrefix,
        createdAt: projects.createdAt,
      })
      .from(projects)
      .orderBy(projects.createdAt);

    return {
      projects: items.map((p) => ({
        ...p,
        apiKeyPreview: p.keyPrefix ? `${p.keyPrefix}...` : null,
      })),
    };
  })

  .post(
    "/",
    async ({ body, set }) => {
      const apiKey = `ho_${randomUUID().replace(/-/g, "")}`;
      const slug = body.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      const { hash, prefix } = await hashApiKey(apiKey);

      const [created] = await db
        .insert(projects)
        .values({
          name: body.name,
          slug,
          apiKeyHash: hash,
          keyPrefix: prefix,
        })
        .returning();

      set.status = 201;
      // Return plaintext key ONCE — never stored or returned again
      return { project: { ...created, apiKey: undefined, apiKeyHash: undefined }, apiKey };
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 100 }),
      }),
    },
  )

  .post(
    "/:id/rotate-key",
    async ({ params, set }) => {
      const newKey = `ho_${randomUUID().replace(/-/g, "")}`;
      const { hash, prefix } = await hashApiKey(newKey);

      const [updated] = await db
        .update(projects)
        .set({ apiKeyHash: hash, keyPrefix: prefix, apiKey: null })
        .where(eq(projects.id, params.id))
        .returning();

      if (!updated) {
        set.status = 404;
        return { error: "Project not found" };
      }
      // Return new plaintext key ONCE
      return { apiKey: newKey, apiKeyPreview: maskApiKey(newKey) };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
    },
  )

  .delete(
    "/:id",
    async ({ params, set }) => {
      const [existing] = await db
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.id, params.id))
        .limit(1);
      if (!existing) {
        set.status = 404;
        return { error: "Project not found" };
      }

      await db.transaction(async (tx) => {
        // Collect IDs of project children for cascade
        const projectAlerts = await tx
          .select({ id: alerts.id })
          .from(alerts)
          .where(eq(alerts.projectId, params.id));
        const projectMonitors = await tx
          .select({ id: uptimeMonitors.id })
          .from(uptimeMonitors)
          .where(eq(uptimeMonitors.projectId, params.id));

        // Delete grandchildren (children of project's children)
        if (projectAlerts.length > 0) {
          await tx.delete(alertHistory).where(
            inArray(
              alertHistory.alertId,
              projectAlerts.map((a) => a.id),
            ),
          );
        }
        if (projectMonitors.length > 0) {
          await tx.delete(uptimeChecks).where(
            inArray(
              uptimeChecks.monitorId,
              projectMonitors.map((m) => m.id),
            ),
          );
        }

        // Delete direct project children
        await tx.delete(alerts).where(eq(alerts.projectId, params.id));
        await tx.delete(uptimeMonitors).where(eq(uptimeMonitors.projectId, params.id));
        await tx.delete(events).where(eq(events.projectId, params.id));
        await tx.delete(issues).where(eq(issues.projectId, params.id));
        await tx.delete(traces).where(eq(traces.projectId, params.id));
        await tx.delete(notificationConfig).where(eq(notificationConfig.projectId, params.id));
        await tx.delete(maintenanceWindows).where(eq(maintenanceWindows.projectId, params.id));
        await tx.delete(incidents).where(eq(incidents.projectId, params.id));

        // Finally delete the project itself
        await tx.delete(projects).where(eq(projects.id, params.id));
      });
      return { deleted: true };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
    },
  )

  .put(
    "/:id/rate-limit",
    async ({ params, body, set }) => {
      // Validate the project exists first — returning 404 on a missing
      // project is clearer than a silent update of zero rows.
      const [existing] = await db
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.id, params.id))
        .limit(1);
      if (!existing) {
        set.status = 404;
        return { error: "Project not found" };
      }

      // Build the patch. `rateLimit: null` and `rateLimitWindowMs: null`
      // are both sentinel "clear" values — the operator uses either to
      // revert to the global path-based defaults. Undefined fields are
      // ignored so the endpoint is patch-style.
      const patch: { rateLimit?: number | null; rateLimitWindowMs?: number | null } = {};
      if (body.rateLimit !== undefined) patch.rateLimit = body.rateLimit;
      if (body.rateLimitWindowMs !== undefined) patch.rateLimitWindowMs = body.rateLimitWindowMs;

      const [updated] = await db
        .update(projects)
        .set(patch)
        .where(eq(projects.id, params.id))
        .returning({
          id: projects.id,
          name: projects.name,
          slug: projects.slug,
          rateLimit: projects.rateLimit,
          rateLimitWindowMs: projects.rateLimitWindowMs,
        });

      // Bust the in-process rate-limiter cache so the new limit takes
      // effect immediately rather than waiting up to 60s for natural
      // expiry. Best-effort: the cache is a module-level Map and the
      // import is deferred so tests / non-server contexts don't crash.
      try {
        const mod = await import("../middleware/rate-limiter.js");
        if (typeof mod.invalidateProjectRateLimitCache === "function") {
          mod.invalidateProjectRateLimitCache(params.id);
        }
      } catch {
        // Cache is a soft optimisation — never fail the request if it's
        // unavailable (e.g. server context, edge runtime).
      }

      return { project: updated };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({
        // null = clear override and revert to global default.
        // Undefined = leave the existing value alone.
        rateLimit: t.Optional(t.Union([t.Integer({ minimum: 1, maximum: 1_000_000 }), t.Null()])),
        // Minimum 1s to avoid sub-second windows that would create
        // excessive Redis churn; maximum 24h for sanity.
        rateLimitWindowMs: t.Optional(
          t.Union([t.Integer({ minimum: 1_000, maximum: 86_400_000 }), t.Null()]),
        ),
      }),
    },
  );
