/**
 * Maintenance Windows API
 *
 * CRUD for maintenance windows. Active/upcoming windows suppress alerts
 * for associated monitors.
 */

import { and, count, desc, eq, gte, lte } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { applyScope, assertResourceProject, isScope } from "../lib/project-scope.js";
import { db } from "../store/db.js";
import { maintenanceWindows } from "../store/schema.js";

export const maintenanceRoutes = new Elysia({ prefix: "/api/maintenance" })

  // ── List maintenance windows (active + upcoming by default) ─────────
  .get(
    "/",
    async ({ query, request, set }) => {
      const scope = await applyScope({
        request,
        query: query as Record<string, unknown>,
        set,
      });
      if (!isScope(scope)) return scope;

      const { status, limit = "50", offset = "0" } = query;
      const now = new Date();

      const conditions = [];
      if (scope.projectId) conditions.push(eq(maintenanceWindows.projectId, scope.projectId));

      if (status === "active") {
        conditions.push(lte(maintenanceWindows.startsAt, now));
        conditions.push(gte(maintenanceWindows.endsAt, now));
      } else if (status === "upcoming") {
        conditions.push(gte(maintenanceWindows.startsAt, now));
      } else if (status === "past") {
        conditions.push(lte(maintenanceWindows.endsAt, now));
      }
      // default: no time filter, return all

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [items, totalResult] = await Promise.all([
        db
          .select()
          .from(maintenanceWindows)
          .where(where)
          .orderBy(desc(maintenanceWindows.startsAt))
          .limit(Number(limit))
          .offset(Number(offset)),
        db.select({ total: count() }).from(maintenanceWindows).where(where),
      ]);

      return {
        items,
        total: totalResult[0]?.total ?? 0,
        limit: Number(limit),
        offset: Number(offset),
      };
    },
    {
      query: t.Object({
        projectId: t.Optional(t.String()),
        tenantId: t.Optional(t.String()),
        status: t.Optional(
          t.Union([t.Literal("active"), t.Literal("upcoming"), t.Literal("past")]),
        ),
        limit: t.Optional(t.String()),
        offset: t.Optional(t.String()),
      }),
    },
  )

  // ── Get currently active windows (convenience) ──────────────────────
  .get(
    "/active/now",
    async ({ query, request, set }) => {
      const scope = await applyScope({
        request,
        query: query as Record<string, unknown>,
        set,
      });
      if (!isScope(scope)) return scope;

      const now = new Date();
      const conditions = [
        lte(maintenanceWindows.startsAt, now),
        gte(maintenanceWindows.endsAt, now),
      ];
      if (scope.projectId) {
        conditions.push(eq(maintenanceWindows.projectId, scope.projectId));
      }

      const items = await db
        .select()
        .from(maintenanceWindows)
        .where(and(...conditions))
        .orderBy(desc(maintenanceWindows.startsAt));

      return { items };
    },
    {
      query: t.Object({
        projectId: t.Optional(t.String()),
        tenantId: t.Optional(t.String()),
      }),
    },
  )

  // ── Get single maintenance window ───────────────────────────────────
  .get(
    "/:id",
    async ({ params, request, set }) => {
      const scope = await applyScope({
        request,
        set,
      });
      if (!isScope(scope)) return scope;

      const [window] = await db
        .select()
        .from(maintenanceWindows)
        .where(eq(maintenanceWindows.id, params.id))
        .limit(1);
      if (!window || !assertResourceProject(window.projectId, scope.projectId, scope.admin)) {
        set.status = 404;
        return { error: "Maintenance window not found" };
      }
      return window;
    },
    { params: t.Object({ id: t.String() }) },
  )

  // ── Create maintenance window ───────────────────────────────────────
  .post(
    "/",
    async ({ body, request, set }) => {
      const scope = await applyScope({
        request,
        set,
      });
      if (!isScope(scope)) return scope;

      if (!scope.admin && body.projectId !== scope.projectId) {
        set.status = 403;
        return { error: "Forbidden: cannot create windows for another project" };
      }

      const startsAt = new Date(body.startsAt);
      const endsAt = new Date(body.endsAt);

      if (endsAt <= startsAt) {
        set.status = 400;
        return { error: "endsAt must be after startsAt" };
      }

      const boundProjectId = scope.admin ? body.projectId : (scope.projectId as string);

      const [created] = await db
        .insert(maintenanceWindows)
        .values({
          projectId: boundProjectId,
          name: body.name,
          description: body.description ?? null,
          startsAt,
          endsAt,
          monitorIds: body.monitorIds ?? [],
        })
        .returning();

      return created;
    },
    {
      body: t.Object({
        projectId: t.String(),
        name: t.String({ minLength: 1 }),
        description: t.Optional(t.String()),
        startsAt: t.String({ format: "date-time" }),
        endsAt: t.String({ format: "date-time" }),
        monitorIds: t.Optional(t.Array(t.String())),
      }),
    },
  )

  // ── Update maintenance window ───────────────────────────────────────
  .put(
    "/:id",
    async ({ params, body, request, set }) => {
      const scope = await applyScope({
        request,
        set,
      });
      if (!isScope(scope)) return scope;

      const [existing] = await db
        .select({ id: maintenanceWindows.id, projectId: maintenanceWindows.projectId })
        .from(maintenanceWindows)
        .where(eq(maintenanceWindows.id, params.id))
        .limit(1);
      if (!existing || !assertResourceProject(existing.projectId, scope.projectId, scope.admin)) {
        set.status = 404;
        return { error: "Maintenance window not found" };
      }

      const updateData: Record<string, unknown> = {};
      if (body.name !== undefined) updateData.name = body.name;
      if (body.description !== undefined) updateData.description = body.description;
      if (body.startsAt !== undefined) updateData.startsAt = new Date(body.startsAt);
      if (body.endsAt !== undefined) updateData.endsAt = new Date(body.endsAt);
      if (body.monitorIds !== undefined) updateData.monitorIds = body.monitorIds;

      // Validate time range if both are provided or if one is provided
      const newStartsAt = updateData.startsAt as Date | undefined;
      const newEndsAt = updateData.endsAt as Date | undefined;
      if (newStartsAt && newEndsAt && newEndsAt <= newStartsAt) {
        set.status = 400;
        return { error: "endsAt must be after startsAt" };
      }

      const [updated] = await db
        .update(maintenanceWindows)
        .set(updateData)
        .where(eq(maintenanceWindows.id, params.id))
        .returning();

      return updated;
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        name: t.Optional(t.String({ minLength: 1 })),
        description: t.Optional(t.String()),
        startsAt: t.Optional(t.String({ format: "date-time" })),
        endsAt: t.Optional(t.String({ format: "date-time" })),
        monitorIds: t.Optional(t.Array(t.String())),
      }),
    },
  )

  // ── Delete maintenance window ───────────────────────────────────────
  .delete(
    "/:id",
    async ({ params, request, set }) => {
      const scope = await applyScope({
        request,
        set,
      });
      if (!isScope(scope)) return scope;

      const [existing] = await db
        .select({ id: maintenanceWindows.id, projectId: maintenanceWindows.projectId })
        .from(maintenanceWindows)
        .where(eq(maintenanceWindows.id, params.id))
        .limit(1);
      if (!existing || !assertResourceProject(existing.projectId, scope.projectId, scope.admin)) {
        set.status = 404;
        return { error: "Maintenance window not found" };
      }

      await db.delete(maintenanceWindows).where(eq(maintenanceWindows.id, params.id));
      return { deleted: true };
    },
    { params: t.Object({ id: t.String() }) },
  );
