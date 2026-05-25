/**
 * Issue Comments API
 *
 * CRUD for comments on issues.
 * Routes are mounted at both /api/issues/:issueId/comments and /api/comments/:id.
 */
import { Elysia, t } from "elysia";
import { db } from "../store/db.js";
import { issueComments, issues } from "../store/schema.js";
import { eq, and, desc, count } from "drizzle-orm";

export const commentsRoutes = new Elysia({ prefix: "/api" })

  // ── List comments for an issue ──────────────────────────────────────
  .get("/issues/:issueId/comments", async ({ params, query, set }) => {
    const { limit = "50", offset = "0" } = query;
    const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
    const off = Math.max(parseInt(offset, 10) || 0, 0);

    // Verify issue exists
    const [issue] = await db.select({ id: issues.id })
      .from(issues)
      .where(eq(issues.id, params.issueId))
      .limit(1);
    if (!issue) {
      set.status = 404;
      return { error: "Issue not found" };
    }

    const [items, totalResult] = await Promise.all([
      db.select().from(issueComments)
        .where(eq(issueComments.issueId, params.issueId))
        .orderBy(desc(issueComments.createdAt))
        .limit(lim)
        .offset(off),
      db.select({ total: count() })
        .from(issueComments)
        .where(eq(issueComments.issueId, params.issueId)),
    ]);

    return {
      data: items,
      total: totalResult[0]?.total ?? 0,
      limit: lim,
      offset: off,
    };
  }, {
    params: t.Object({ issueId: t.String({ format: "uuid" }) }),
    query: t.Object({
      limit: t.Optional(t.String()),
      offset: t.Optional(t.String()),
    }),
  })

  // ── Add comment to an issue ─────────────────────────────────────────
  .post("/issues/:issueId/comments", async ({ params, body, set }) => {
    // Verify issue exists
    const [issue] = await db.select({ id: issues.id })
      .from(issues)
      .where(eq(issues.id, params.issueId))
      .limit(1);
    if (!issue) {
      set.status = 404;
      return { error: "Issue not found" };
    }

    const [created] = await db.insert(issueComments).values({
      issueId: params.issueId,
      authorName: body.authorName,
      body: body.body,
    }).returning();

    set.status = 201;
    return created;
  }, {
    params: t.Object({ issueId: t.String({ format: "uuid" }) }),
    body: t.Object({
      authorName: t.String({ minLength: 1 }),
      body: t.String({ minLength: 1 }),
    }),
  })

  // ── Delete comment ──────────────────────────────────────────────────
  .delete("/comments/:id", async ({ params, set }) => {
    const [existing] = await db.select({ id: issueComments.id })
      .from(issueComments)
      .where(eq(issueComments.id, params.id))
      .limit(1);
    if (!existing) {
      set.status = 404;
      return { error: "Comment not found" };
    }

    await db.delete(issueComments).where(eq(issueComments.id, params.id));
    return { deleted: true };
  }, { params: t.Object({ id: t.String({ format: "uuid" }) }) });
