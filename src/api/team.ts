/**
 * Team Members API
 *
 * CRUD for project team members with role management.
 */

import { and, count, desc, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { parseLimit, parseOffset } from "../lib/pagination.js";
import { db } from "../store/db.js";
import { teamMembers } from "../store/schema.js";

const VALID_ROLES = ["owner", "admin", "member", "viewer"] as const;

export const teamRoutes = new Elysia({ prefix: "/api/team" })

  // ── List team members for a project ─────────────────────────────────
  .get(
    "/",
    async ({ query }) => {
      const { projectId, limit = "100", offset = "0" } = query;
      const lim = parseLimit(limit, 100, 500);
      const off = parseOffset(offset);

      const conditions = [];
      if (projectId) conditions.push(eq(teamMembers.projectId, projectId));

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [items, totalResult] = await Promise.all([
        db
          .select()
          .from(teamMembers)
          .where(where)
          .orderBy(desc(teamMembers.createdAt))
          .limit(lim)
          .offset(off),
        db.select({ total: count() }).from(teamMembers).where(where),
      ]);

      return {
        data: items,
        total: totalResult[0]?.total ?? 0,
        limit: lim,
        offset: off,
      };
    },
    {
      query: t.Object({
        projectId: t.Optional(t.String({ format: "uuid" })),
        limit: t.Optional(t.String()),
        offset: t.Optional(t.String()),
      }),
    },
  )

  // ── Add team member ─────────────────────────────────────────────────
  .post(
    "/",
    async ({ body, set }) => {
      // Check for duplicate email within project
      const existing = await db
        .select({ id: teamMembers.id })
        .from(teamMembers)
        .where(and(eq(teamMembers.projectId, body.projectId), eq(teamMembers.email, body.email)))
        .limit(1);

      if (existing[0]) {
        set.status = 409;
        return { error: "Team member with this email already exists in this project" };
      }

      const [created] = await db
        .insert(teamMembers)
        .values({
          projectId: body.projectId,
          name: body.name,
          email: body.email,
          role: body.role ?? "member",
        })
        .returning();

      set.status = 201;
      return created;
    },
    {
      body: t.Object({
        projectId: t.String({ format: "uuid" }),
        name: t.String({ minLength: 1 }),
        email: t.String({ format: "email" }),
        role: t.Optional(t.Union(VALID_ROLES.map((r) => t.Literal(r)))),
      }),
    },
  )

  // ── Update team member ──────────────────────────────────────────────
  .put(
    "/:id",
    async ({ params, body, set }) => {
      const [existing] = await db
        .select()
        .from(teamMembers)
        .where(eq(teamMembers.id, params.id))
        .limit(1);
      if (!existing) {
        set.status = 404;
        return { error: "Team member not found" };
      }

      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      if (body.name !== undefined) updateData.name = body.name;
      if (body.email !== undefined) updateData.email = body.email;
      if (body.role !== undefined) updateData.role = body.role;

      // Check for duplicate email within project when email is being updated
      if (body.email !== undefined) {
        const duplicate = await db
          .select({ id: teamMembers.id })
          .from(teamMembers)
          .where(
            and(eq(teamMembers.projectId, existing.projectId), eq(teamMembers.email, body.email)),
          )
          .limit(1);

        if (duplicate[0] && duplicate[0].id !== params.id) {
          set.status = 409;
          return { error: "Team member with this email already exists in this project" };
        }
      }

      const [updated] = await db
        .update(teamMembers)
        .set(updateData)
        .where(eq(teamMembers.id, params.id))
        .returning();

      return updated;
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({
        name: t.Optional(t.String({ minLength: 1 })),
        email: t.Optional(t.String({ format: "email" })),
        role: t.Optional(t.Union(VALID_ROLES.map((r) => t.Literal(r)))),
      }),
    },
  )

  // ── Remove team member ──────────────────────────────────────────────
  .delete(
    "/:id",
    async ({ params, set }) => {
      const [existing] = await db
        .select({ id: teamMembers.id })
        .from(teamMembers)
        .where(eq(teamMembers.id, params.id))
        .limit(1);
      if (!existing) {
        set.status = 404;
        return { error: "Team member not found" };
      }

      await db.delete(teamMembers).where(eq(teamMembers.id, params.id));
      return { deleted: true };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  );
