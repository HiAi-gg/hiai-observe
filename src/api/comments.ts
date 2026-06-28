/**
 * Issue Comments API
 *
 * CRUD for comments on issues.
 * Routes are mounted at both /api/issues/:issueId/comments and /api/comments/:id.
 */

import { and, count, desc, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { parseLimit, parseOffset } from "../lib/pagination.js";
import { db } from "../store/db.js";
import { issueComments, issues } from "../store/schema.js";

// Bounded input limits — defend against unbounded-storage DoS via
// attacker-controlled text fields. Postgres `text` is itself unbounded, so
// the route layer is the only place we can enforce a hard cap.
const MAX_COMMENT_BODY = 10_000; // 10 KB of comment text
const MAX_COMMENT_AUTHOR = 200;

export const commentsRoutes = new Elysia({ prefix: "/api" })

  // ── List comments for an issue ──────────────────────────────────────
  .get(
    "/issues/:id/comments",
    async ({ params, query, set }) => {
      const { limit = "50", offset = "0" } = query;
      const lim = parseLimit(limit);
      const off = parseOffset(offset);

      // Verify issue exists
      const [issue] = await db
        .select({ id: issues.id })
        .from(issues)
        .where(eq(issues.id, params.id))
        .limit(1);
      if (!issue) {
        set.status = 404;
        return { error: "Issue not found" };
      }

      const [items, totalResult] = await Promise.all([
        db
          .select()
          .from(issueComments)
          .where(eq(issueComments.issueId, params.id))
          .orderBy(desc(issueComments.createdAt))
          .limit(lim)
          .offset(off),
        db
          .select({ total: count() })
          .from(issueComments)
          .where(eq(issueComments.issueId, params.id)),
      ]);

      return {
        data: items,
        total: totalResult[0]?.total ?? 0,
        limit: lim,
        offset: off,
      };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      query: t.Object({
        limit: t.Optional(t.String()),
        offset: t.Optional(t.String()),
      }),
    },
  )

  // ── Add comment to an issue ─────────────────────────────────────────
  .post(
    "/issues/:id/comments",
    async ({ params, body, set }) => {
      // Verify issue exists
      const [issue] = await db
        .select({ id: issues.id })
        .from(issues)
        .where(eq(issues.id, params.id))
        .limit(1);
      if (!issue) {
        set.status = 404;
        return { error: "Issue not found" };
      }

      // Defense-in-depth: explicit byte-level guards in addition to the
      // t.String maxLength validator. The validator runs first, but we re-check
      // here to guarantee the cap is enforced even if schema validation is
      // ever loosened in the future.
      if (body.body.length > MAX_COMMENT_BODY) {
        set.status = 413;
        return { error: "Comment too large", detail: `Max length: ${MAX_COMMENT_BODY} chars` };
      }
      if (body.authorName.length > MAX_COMMENT_AUTHOR) {
        set.status = 413;
        return { error: "Author name too long", detail: `Max length: ${MAX_COMMENT_AUTHOR} chars` };
      }

      const [created] = await db
        .insert(issueComments)
        .values({
          issueId: params.id,
          authorName: body.authorName,
          body: body.body,
        })
        .returning();

      set.status = 201;
      return created;
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({
        authorName: t.String({ minLength: 1, maxLength: MAX_COMMENT_AUTHOR }),
        body: t.String({ minLength: 1, maxLength: MAX_COMMENT_BODY }),
      }),
    },
  )

  // ── Delete comment ──────────────────────────────────────────────────
  .delete(
    "/comments/:id",
    async ({ params, set }) => {
      const [existing] = await db
        .select({ id: issueComments.id })
        .from(issueComments)
        .where(eq(issueComments.id, params.id))
        .limit(1);
      if (!existing) {
        set.status = 404;
        return { error: "Comment not found" };
      }

      await db.delete(issueComments).where(eq(issueComments.id, params.id));
      return { deleted: true };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  );
