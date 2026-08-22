import { and, count, desc, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { applyScope, assertResourceProject, isScope } from "../lib/project-scope.js";
import { denyIfCannotDelete } from "../lib/rbac.js";
import { db } from "../store/db.js";
import { projects, statusSubscribers } from "../store/schema.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const subscribersPlugin = new Elysia({ prefix: "/api/subscribers" })
  .get(
    "/",
    async ({ query, request, set }) => {
      const scope = await applyScope({
        request,
        query: query as Record<string, unknown>,
        set,
      });
      if (!isScope(scope)) return scope;

      const limit = Math.min(Math.max(query.limit ?? 100, 1), 500);
      const offset = Math.max(query.offset ?? 0, 0);
      const where = scope.projectId ? eq(statusSubscribers.projectId, scope.projectId) : undefined;
      const rows = await db
        .select()
        .from(statusSubscribers)
        .where(where)
        .orderBy(desc(statusSubscribers.createdAt))
        .limit(limit)
        .offset(offset);
      const totalRows = await db.select({ total: count() }).from(statusSubscribers).where(where);
      const total = totalRows[0]?.total ?? 0;
      return { data: rows, total, limit, offset };
    },
    {
      query: t.Object({
        projectId: t.Optional(t.String()),
        tenantId: t.Optional(t.String()),
        limit: t.Optional(t.Number()),
        offset: t.Optional(t.Number()),
      }),
    },
  )
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
        return { error: "Forbidden" };
      }
      const boundProjectId = scope.admin ? body.projectId : (scope.projectId as string);
      const email = body.email.trim().toLowerCase();
      if (!EMAIL_RE.test(email)) {
        set.status = 400;
        return { error: "Invalid email address" };
      }
      const existing = await db
        .select()
        .from(statusSubscribers)
        .where(
          and(eq(statusSubscribers.projectId, boundProjectId), eq(statusSubscribers.email, email)),
        );
      if (existing.length > 0) {
        set.status = 409;
        return { error: "Email already subscribed" };
      }
      const insertedRows = await db
        .insert(statusSubscribers)
        .values({
          projectId: boundProjectId,
          email,
          isVerified: body.autoVerify ?? false,
        })
        .returning();
      if (!insertedRows[0]) {
        set.status = 500;
        return { error: "Insert failed" };
      }
      return insertedRows[0];
    },
    {
      body: t.Object({
        projectId: t.String(),
        email: t.String(),
        autoVerify: t.Optional(t.Boolean()),
      }),
    },
  )
  .post(
    "/public",
    async ({ body, set }) => {
      const email = body.email.trim().toLowerCase();
      if (!EMAIL_RE.test(email)) {
        set.status = 400;
        return { error: "Invalid email address" };
      }
      const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.slug, body.slug))
        .limit(1);
      if (!project) {
        set.status = 404;
        return { error: "Project not found" };
      }
      const existing = await db
        .select()
        .from(statusSubscribers)
        .where(
          and(eq(statusSubscribers.projectId, project.id), eq(statusSubscribers.email, email)),
        );
      if (existing.length > 0) {
        set.status = 409;
        return { error: "Email already subscribed" };
      }
      const insertedRows = await db
        .insert(statusSubscribers)
        .values({
          projectId: project.id,
          email,
          isVerified: false,
        })
        .returning();
      if (!insertedRows[0]) {
        set.status = 500;
        return { error: "Insert failed" };
      }
      return { id: insertedRows[0].id, subscribed: true };
    },
    {
      body: t.Object({
        slug: t.String({ minLength: 1 }),
        email: t.String(),
      }),
    },
  )
  .delete("/:id", async ({ params, request, set }) => {
    const scope = await applyScope({
      request,
      set,
    });
    if (!isScope(scope)) return scope;
    const denied = await denyIfCannotDelete(scope, set);
    if (denied) return denied;

    const rows = await db
      .select()
      .from(statusSubscribers)
      .where(eq(statusSubscribers.id, params.id));
    if (
      rows.length === 0 ||
      !rows[0] ||
      !assertResourceProject(rows[0].projectId, scope.projectId, scope.admin)
    ) {
      set.status = 404;
      return { error: "Subscriber not found" };
    }
    await db.delete(statusSubscribers).where(eq(statusSubscribers.id, params.id));
    return { deleted: true, id: params.id };
  })
  .post("/:id/verify", async ({ params, request, set }) => {
    const scope = await applyScope({
      request,
      set,
    });
    if (!isScope(scope)) return scope;

    const rows = await db
      .select()
      .from(statusSubscribers)
      .where(eq(statusSubscribers.id, params.id));
    if (
      rows.length === 0 ||
      !rows[0] ||
      !assertResourceProject(rows[0].projectId, scope.projectId, scope.admin)
    ) {
      set.status = 404;
      return { error: "Subscriber not found" };
    }
    const updatedRows = await db
      .update(statusSubscribers)
      .set({ isVerified: true })
      .where(eq(statusSubscribers.id, params.id))
      .returning();
    if (!updatedRows[0]) {
      set.status = 500;
      return { error: "Update failed" };
    }
    return updatedRows[0];
  });
