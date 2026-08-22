import { and, count, desc, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { parseLimit, parseOffset } from "../lib/pagination.js";
import { applyScope, assertResourceProject, isScope } from "../lib/project-scope.js";
import { db } from "../store/db.js";
import { fingerprintRules } from "../store/schema.js";

export const fingerprintRulesPlugin = new Elysia({ prefix: "/api/fingerprint-rules" })
  .get(
    "/",
    async ({ query, request, set }) => {
      const scope = await applyScope({
        request,
        query: query as Record<string, unknown>,
        set,
      });
      if (!isScope(scope)) return scope;

      const limit = parseLimit(query.limit);
      const offset = parseOffset(query.offset);

      const where = scope.projectId ? eq(fingerprintRules.projectId, scope.projectId) : undefined;

      const [rows, totalRow] = await Promise.all([
        db
          .select()
          .from(fingerprintRules)
          .where(where)
          .orderBy(desc(fingerprintRules.createdAt))
          .limit(limit)
          .offset(offset),
        db.select({ value: count() }).from(fingerprintRules).where(where),
      ]);

      return { data: rows, total: Number(totalRow[0]?.value ?? 0), limit, offset };
    },
    {
      query: t.Object({
        projectId: t.Optional(t.String({ format: "uuid" })),
        tenantId: t.Optional(t.String()),
        limit: t.Optional(t.String()),
        offset: t.Optional(t.String()),
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

      try {
        new RegExp(body.pattern);
      } catch {
        set.status = 400;
        return { error: "Invalid regex pattern" };
      }

      const existing = await db
        .select()
        .from(fingerprintRules)
        .where(
          and(eq(fingerprintRules.projectId, boundProjectId), eq(fingerprintRules.name, body.name)),
        )
        .limit(1);

      if (existing.length > 0) {
        set.status = 409;
        return { error: "Rule name already exists for this project" };
      }

      const allowed = ["message", "stack", "type"];
      if (!allowed.includes(body.groupBy ?? "message")) {
        set.status = 400;
        return { error: `groupBy must be one of: ${allowed.join(", ")}` };
      }

      const inserted = await db
        .insert(fingerprintRules)
        .values({
          projectId: boundProjectId,
          name: body.name,
          pattern: body.pattern,
          groupBy: body.groupBy ?? "message",
          isActive: body.isActive ?? true,
        })
        .returning();

      return inserted[0];
    },
    {
      body: t.Object({
        projectId: t.String({ format: "uuid" }),
        name: t.String({ minLength: 1, maxLength: 100 }),
        pattern: t.String({ minLength: 1, maxLength: 500 }),
        groupBy: t.Optional(t.Union([t.Literal("message"), t.Literal("stack"), t.Literal("type")])),
        isActive: t.Optional(t.Boolean()),
      }),
    },
  )
  .get("/:id", async ({ params, request, set }) => {
    const scope = await applyScope({
      request,
      set,
    });
    if (!isScope(scope)) return scope;

    const row = await db
      .select()
      .from(fingerprintRules)
      .where(eq(fingerprintRules.id, params.id))
      .limit(1);

    if (
      row.length === 0 ||
      !row[0] ||
      !assertResourceProject(row[0].projectId, scope.projectId, scope.admin)
    ) {
      set.status = 404;
      return { error: "Not found" };
    }
    return row[0];
  })
  .put(
    "/:id",
    async ({ params, body, request, set }) => {
      const scope = await applyScope({
        request,
        set,
      });
      if (!isScope(scope)) return scope;

      const [existing] = await db
        .select()
        .from(fingerprintRules)
        .where(eq(fingerprintRules.id, params.id))
        .limit(1);
      if (!existing || !assertResourceProject(existing.projectId, scope.projectId, scope.admin)) {
        set.status = 404;
        return { error: "Not found" };
      }

      if (body.pattern) {
        try {
          new RegExp(body.pattern);
        } catch {
          set.status = 400;
          return { error: "Invalid regex pattern" };
        }
      }

      const updated = await db
        .update(fingerprintRules)
        .set({
          name: body.name,
          pattern: body.pattern,
          groupBy: body.groupBy,
          isActive: body.isActive,
        })
        .where(eq(fingerprintRules.id, params.id))
        .returning();

      if (updated.length === 0) {
        set.status = 404;
        return { error: "Not found" };
      }
      return updated[0];
    },
    {
      body: t.Object({
        name: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
        pattern: t.Optional(t.String({ minLength: 1, maxLength: 500 })),
        groupBy: t.Optional(t.Union([t.Literal("message"), t.Literal("stack"), t.Literal("type")])),
        isActive: t.Optional(t.Boolean()),
      }),
    },
  )
  .delete("/:id", async ({ params, request, set }) => {
    const scope = await applyScope({
      request,
      set,
    });
    if (!isScope(scope)) return scope;

    const [existing] = await db
      .select()
      .from(fingerprintRules)
      .where(eq(fingerprintRules.id, params.id))
      .limit(1);
    if (!existing || !assertResourceProject(existing.projectId, scope.projectId, scope.admin)) {
      set.status = 404;
      return { error: "Not found" };
    }

    const deleted = await db
      .delete(fingerprintRules)
      .where(eq(fingerprintRules.id, params.id))
      .returning();

    if (deleted.length === 0) {
      set.status = 404;
      return { error: "Not found" };
    }
    return { ok: true };
  });
