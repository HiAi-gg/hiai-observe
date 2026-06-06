import { Elysia, t } from "elysia";
import { db } from "../store/db.js";
import { statusSubscribers } from "../store/schema.js";
import { resolveApiKey, lookupProject } from "../lib/auth.js";
import { eq, and, desc, count } from "drizzle-orm";

async function authorizeProject(authHeader: string | undefined): Promise<string | null> {
  const parsed = resolveApiKey(authHeader);
  if (!parsed) return null;
  const project = await lookupProject(parsed.apiKey);
  return project?.projectId ?? null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const subscribersPlugin = new Elysia({ prefix: "/api/subscribers" })
  .get("/", async ({ query, headers, set }) => {
    const projectId = await authorizeProject(headers.authorization);
    if (!projectId) {
      set.status = 401;
      return { error: "Unauthorized" };
    }
    const filterProjectId = query.projectId ?? projectId;
    if (filterProjectId !== projectId) {
      set.status = 403;
      return { error: "Forbidden" };
    }
    const limit = Math.min(Math.max(query.limit ?? 100, 1), 500);
    const offset = Math.max(query.offset ?? 0, 0);
    const rows = await db.select().from(statusSubscribers)
      .where(eq(statusSubscribers.projectId, projectId))
      .orderBy(desc(statusSubscribers.createdAt))
      .limit(limit).offset(offset);
    const totalRows = await db.select({ total: count() }).from(statusSubscribers)
      .where(eq(statusSubscribers.projectId, projectId));
    const total = totalRows[0]?.total ?? 0;
    return { data: rows, total, limit, offset };
  }, {
    query: t.Object({
      projectId: t.Optional(t.String()),
      limit: t.Optional(t.Number()),
      offset: t.Optional(t.Number()),
    }),
  })
  .post("/", async ({ body, headers, set }) => {
    const projectId = await authorizeProject(headers.authorization);
    if (!projectId) {
      set.status = 401;
      return { error: "Unauthorized" };
    }
    if (body.projectId !== projectId) {
      set.status = 403;
      return { error: "Forbidden" };
    }
    const email = body.email.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      set.status = 400;
      return { error: "Invalid email address" };
    }
    const existing = await db.select().from(statusSubscribers)
      .where(and(eq(statusSubscribers.projectId, projectId), eq(statusSubscribers.email, email)));
    if (existing.length > 0) {
      set.status = 409;
      return { error: "Email already subscribed" };
    }
    const insertedRows = await db.insert(statusSubscribers).values({
      projectId,
      email,
      isVerified: body.autoVerify ?? false,
    }).returning();
    if (!insertedRows[0]) {
      set.status = 500;
      return { error: "Insert failed" };
    }
    return insertedRows[0];
  }, {
    body: t.Object({
      projectId: t.String(),
      email: t.String(),
      autoVerify: t.Optional(t.Boolean()),
    }),
  })
  .delete("/:id", async ({ params, headers, set }) => {
    const projectId = await authorizeProject(headers.authorization);
    if (!projectId) {
      set.status = 401;
      return { error: "Unauthorized" };
    }
    const rows = await db.select().from(statusSubscribers).where(eq(statusSubscribers.id, params.id));
    if (rows.length === 0 || !rows[0]) {
      set.status = 404;
      return { error: "Subscriber not found" };
    }
    if (rows[0].projectId !== projectId) {
      set.status = 403;
      return { error: "Forbidden" };
    }
    await db.delete(statusSubscribers).where(eq(statusSubscribers.id, params.id));
    return { deleted: true, id: params.id };
  })
  .post("/:id/verify", async ({ params, headers, set }) => {
    const projectId = await authorizeProject(headers.authorization);
    if (!projectId) {
      set.status = 401;
      return { error: "Unauthorized" };
    }
    const rows = await db.select().from(statusSubscribers).where(eq(statusSubscribers.id, params.id));
    if (rows.length === 0 || !rows[0]) {
      set.status = 404;
      return { error: "Subscriber not found" };
    }
    if (rows[0].projectId !== projectId) {
      set.status = 403;
      return { error: "Forbidden" };
    }
    const updatedRows = await db.update(statusSubscribers)
      .set({ isVerified: true })
      .where(eq(statusSubscribers.id, params.id))
      .returning();
    if (!updatedRows[0]) {
      set.status = 500;
      return { error: "Update failed" };
    }
    return updatedRows[0];
  });
