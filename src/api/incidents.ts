/**
 * Incidents API
 *
 * CRUD for incidents with status lifecycle:
 * investigating -> identified -> monitoring -> resolved
 */

import { and, count, desc, eq, ne } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../store/db.js";
import { incidents } from "../store/schema.js";

const VALID_STATUSES = ["investigating", "identified", "monitoring", "resolved"] as const;
type IncidentStatus = (typeof VALID_STATUSES)[number];

const STATUS_LIFECYCLE: Record<IncidentStatus, IncidentStatus[]> = {
  investigating: ["identified", "monitoring", "resolved"],
  identified: ["investigating", "monitoring", "resolved"],
  monitoring: ["investigating", "identified", "resolved"],
  resolved: [], // terminal state
};

export const incidentsRoutes = new Elysia({ prefix: "/api/incidents" })

  // ── List incidents ──────────────────────────────────────────────────
  .get(
    "/",
    async ({ query }) => {
      const { projectId, status, limit = "50", offset = "0" } = query;

      const conditions = [];
      if (projectId) conditions.push(eq(incidents.projectId, projectId));
      if (status) conditions.push(eq(incidents.status, status));

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [items, totalResult] = await Promise.all([
        db
          .select()
          .from(incidents)
          .where(where)
          .orderBy(desc(incidents.createdAt))
          .limit(Number(limit))
          .offset(Number(offset)),
        db.select({ total: count() }).from(incidents).where(where),
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
        status: t.Optional(t.Union(VALID_STATUSES.map((s) => t.Literal(s)))),
        limit: t.Optional(t.String()),
        offset: t.Optional(t.String()),
      }),
    },
  )

  // ── Get active (non-resolved) incidents per project ─────────────────
  .get(
    "/active",
    async ({ query }) => {
      const conditions = [ne(incidents.status, "resolved")];
      if (query.projectId) {
        conditions.push(eq(incidents.projectId, query.projectId));
      }

      const items = await db
        .select()
        .from(incidents)
        .where(and(...conditions))
        .orderBy(desc(incidents.createdAt));

      return { items };
    },
    {
      query: t.Object({
        projectId: t.Optional(t.String()),
      }),
    },
  )

  // ── Get single incident ─────────────────────────────────────────────
  .get(
    "/:id",
    async ({ params, set }) => {
      const [incident] = await db
        .select()
        .from(incidents)
        .where(eq(incidents.id, params.id))
        .limit(1);
      if (!incident) {
        set.status = 404;
        return { error: "Incident not found" };
      }
      return incident;
    },
    { params: t.Object({ id: t.String() }) },
  )

  // ── Create incident ─────────────────────────────────────────────────
  .post(
    "/",
    async ({ body }) => {
      const [created] = await db
        .insert(incidents)
        .values({
          projectId: body.projectId,
          monitorId: body.monitorId ?? null,
          title: body.title,
          status: body.status ?? "investigating",
          severity: body.severity ?? "minor",
          description: body.description ?? null,
        })
        .returning();

      return created;
    },
    {
      body: t.Object({
        projectId: t.String(),
        monitorId: t.Optional(t.String()),
        title: t.String({ minLength: 1 }),
        status: t.Optional(t.Union(VALID_STATUSES.map((s) => t.Literal(s)))),
        severity: t.Optional(
          t.Union([t.Literal("minor"), t.Literal("major"), t.Literal("critical")]),
        ),
        description: t.Optional(t.String()),
      }),
    },
  )

  // ── Update incident status ──────────────────────────────────────────
  .put(
    "/:id",
    async ({ params, body, set }) => {
      const [existing] = await db
        .select()
        .from(incidents)
        .where(eq(incidents.id, params.id))
        .limit(1);
      if (!existing) {
        set.status = 404;
        return { error: "Incident not found" };
      }

      // Validate status transition
      if (body.status) {
        const allowed = STATUS_LIFECYCLE[existing.status as IncidentStatus] ?? [];
        if (!allowed.includes(body.status as IncidentStatus)) {
          set.status = 400;
          return {
            error: `Cannot transition from '${existing.status}' to '${body.status}'`,
            allowedTransitions: allowed,
          };
        }
      }

      const updateData: Record<string, unknown> = {
        updatedAt: new Date(),
      };
      if (body.title !== undefined) updateData.title = body.title;
      if (body.status !== undefined) {
        updateData.status = body.status;
        if (body.status === "resolved") {
          updateData.resolvedAt = new Date();
        }
      }
      if (body.monitorId !== undefined) updateData.monitorId = body.monitorId;
      if (body.severity !== undefined) updateData.severity = body.severity;
      if (body.description !== undefined) updateData.description = body.description;

      const [updated] = await db
        .update(incidents)
        .set(updateData)
        .where(eq(incidents.id, params.id))
        .returning();

      return updated;
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        title: t.Optional(t.String({ minLength: 1 })),
        status: t.Optional(t.Union(VALID_STATUSES.map((s) => t.Literal(s)))),
        monitorId: t.Optional(t.String()),
        severity: t.Optional(
          t.Union([t.Literal("minor"), t.Literal("major"), t.Literal("critical")]),
        ),
        description: t.Optional(t.String()),
      }),
    },
  )

  // ── Delete incident ─────────────────────────────────────────────────
  .delete(
    "/:id",
    async ({ params, set }) => {
      const [existing] = await db
        .select({ id: incidents.id })
        .from(incidents)
        .where(eq(incidents.id, params.id))
        .limit(1);
      if (!existing) {
        set.status = 404;
        return { error: "Incident not found" };
      }

      await db.delete(incidents).where(eq(incidents.id, params.id));
      return { deleted: true };
    },
    { params: t.Object({ id: t.String() }) },
  );
