import { Elysia, t } from "elysia";
import { db } from "../store/db.js";
import { fingerprintRules, projects } from "../store/schema.js";
import { resolveApiKey, lookupProject } from "../lib/auth.js";
import { eq, and, desc } from "drizzle-orm";

async function authorizeProject(authHeader: string | undefined): Promise<string | null> {
  const parsed = resolveApiKey(authHeader);
  if (!parsed) return null;
  const project = await lookupProject(parsed.apiKey);
  return project?.projectId ?? null;
}

export const fingerprintRulesPlugin = new Elysia({ prefix: "/api/fingerprint-rules" })
  .get("/", async ({ query, headers, set }) => {
    const projectId = await authorizeProject(headers.authorization);
    if (!projectId) { set.status = 401; return { error: "Invalid API key" }; }

    const projectFilter = (query.projectId as string) || projectId;
    if (projectFilter !== projectId) { set.status = 403; return { error: "Forbidden" }; }

    const limit = Math.min(Math.max(parseInt((query.limit as string) || "50", 10) || 50, 1), 200);
    const offset = Math.max(parseInt((query.offset as string) || "0", 10) || 0, 0);

    const rows = await db.select()
      .from(fingerprintRules)
      .where(eq(fingerprintRules.projectId, projectId))
      .orderBy(desc(fingerprintRules.createdAt))
      .limit(limit)
      .offset(offset);

    return { data: rows, total: rows.length, limit, offset };
  }, {
    query: t.Object({
      projectId: t.Optional(t.String({ format: "uuid" })),
      limit: t.Optional(t.String()),
      offset: t.Optional(t.String()),
    }),
  })
  .post("/", async ({ body, headers, set }) => {
    const projectId = await authorizeProject(headers.authorization);
    if (!projectId) { set.status = 401; return { error: "Invalid API key" }; }

    if (body.projectId !== projectId) { set.status = 403; return { error: "Forbidden" }; }

    try {
      new RegExp(body.pattern);
    } catch {
      set.status = 400;
      return { error: "Invalid regex pattern" };
    }

    const existing = await db.select()
      .from(fingerprintRules)
      .where(and(
        eq(fingerprintRules.projectId, projectId),
        eq(fingerprintRules.name, body.name),
      ))
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

    const inserted = await db.insert(fingerprintRules).values({
      projectId,
      name: body.name,
      pattern: body.pattern,
      groupBy: body.groupBy ?? "message",
      isActive: body.isActive ?? true,
    }).returning();

    return inserted[0];
  }, {
    body: t.Object({
      projectId: t.String({ format: "uuid" }),
      name: t.String({ minLength: 1, maxLength: 100 }),
      pattern: t.String({ minLength: 1, maxLength: 500 }),
      groupBy: t.Optional(t.Union([t.Literal("message"), t.Literal("stack"), t.Literal("type")])),
      isActive: t.Optional(t.Boolean()),
    }),
  })
  .get("/:id", async ({ params, headers, set }) => {
    const projectId = await authorizeProject(headers.authorization);
    if (!projectId) { set.status = 401; return { error: "Invalid API key" }; }

    const row = await db.select()
      .from(fingerprintRules)
      .where(and(eq(fingerprintRules.id, params.id), eq(fingerprintRules.projectId, projectId)))
      .limit(1);

    if (row.length === 0) { set.status = 404; return { error: "Not found" }; }
    return row[0];
  })
  .put("/:id", async ({ params, body, headers, set }) => {
    const projectId = await authorizeProject(headers.authorization);
    if (!projectId) { set.status = 401; return { error: "Invalid API key" }; }

    if (body.pattern) {
      try { new RegExp(body.pattern); }
      catch { set.status = 400; return { error: "Invalid regex pattern" }; }
    }

    const updated = await db.update(fingerprintRules)
      .set({
        name: body.name,
        pattern: body.pattern,
        groupBy: body.groupBy,
        isActive: body.isActive,
      })
      .where(and(eq(fingerprintRules.id, params.id), eq(fingerprintRules.projectId, projectId)))
      .returning();

    if (updated.length === 0) { set.status = 404; return { error: "Not found" }; }
    return updated[0];
  }, {
    body: t.Object({
      name: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
      pattern: t.Optional(t.String({ minLength: 1, maxLength: 500 })),
      groupBy: t.Optional(t.Union([t.Literal("message"), t.Literal("stack"), t.Literal("type")])),
      isActive: t.Optional(t.Boolean()),
    }),
  })
  .delete("/:id", async ({ params, headers, set }) => {
    const projectId = await authorizeProject(headers.authorization);
    if (!projectId) { set.status = 401; return { error: "Invalid API key" }; }

    const deleted = await db.delete(fingerprintRules)
      .where(and(eq(fingerprintRules.id, params.id), eq(fingerprintRules.projectId, projectId)))
      .returning();

    if (deleted.length === 0) { set.status = 404; return { error: "Not found" }; }
    return { ok: true };
  });
