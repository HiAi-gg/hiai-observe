import { Elysia, t } from "elysia";
import { db } from "../store/db.js";
import { issues, events } from "../store/schema.js";
import { eq, and, ilike, desc, count } from "drizzle-orm";

export const issuesPlugin = new Elysia({ prefix: "/api" })
  .get(
    "/issues",
    async ({ query }) => {
      const { projectId, status, search, limit = "50", offset = "0" } = query;
      const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
      const off = Math.max(parseInt(offset, 10) || 0, 0);

      const conditions = [];
      if (projectId) conditions.push(eq(issues.projectId, projectId));
      if (status) conditions.push(eq(issues.status, status));
      if (search) {
        const escaped = search.replace(/[%_]/g, "\\$&");
        conditions.push(ilike(issues.title, `%${escaped}%`));
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [rows, total] = await Promise.all([
        db.select().from(issues).where(where).orderBy(desc(issues.lastSeen)).limit(lim).offset(off),
        db.select({ value: count() }).from(issues).where(where),
      ]);

      return { data: rows, total: total[0]?.value ?? 0, limit: lim, offset: off };
    },
    {
      query: t.Object({
        projectId: t.Optional(t.String({ format: "uuid" })),
        status: t.Optional(t.String()),
        search: t.Optional(t.String()),
        limit: t.Optional(t.String()),
        offset: t.Optional(t.String()),
      }),
    },
  )
  .get(
    "/issues/:id",
    async ({ params, set }) => {
      const issue = await db.select().from(issues).where(eq(issues.id, params.id)).limit(1);
      if (!issue[0]) { set.status = 404; return { error: "Issue not found" }; }

      const latestEvents = await db
        .select().from(events)
        .where(eq(events.issueId, params.id))
        .orderBy(desc(events.createdAt))
        .limit(5);

      return { ...issue[0], events: latestEvents };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )
  .patch(
    "/issues/:id",
    async ({ params, body, set }) => {
      const validStatuses = ["unresolved", "resolved", "ignored"] as const;
      if (!validStatuses.includes(body.status as typeof validStatuses[number])) {
        set.status = 400;
        return { error: "Invalid status. Must be: unresolved, resolved, ignored" };
      }

      const updated = await db
        .update(issues)
        .set({ status: body.status })
        .where(eq(issues.id, params.id))
        .returning();

      if (!updated[0]) { set.status = 404; return { error: "Issue not found" }; }
      return updated[0];
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({ status: t.String() }),
    },
  )
  // Merge issues: move events from source issues to target, delete sources
  .post(
    "/issues/merge",
    async ({ body, set }) => {
      const { targetIssueId, sourceIssueIds } = body;

      // Verify target exists
      const target = await db.select().from(issues).where(eq(issues.id, targetIssueId)).limit(1);
      if (!target[0]) { set.status = 404; return { error: "Target issue not found" }; }

      // Verify sources exist
      for (const srcId of sourceIssueIds) {
        if (srcId === targetIssueId) { set.status = 400; return { error: "Cannot merge issue with itself" }; }
        const src = await db.select({ id: issues.id }).from(issues).where(eq(issues.id, srcId)).limit(1);
        if (!src[0]) { set.status = 404; return { error: `Source issue ${srcId} not found` }; }
      }

      // Move events from sources to target
      for (const srcId of sourceIssueIds) {
        await db.update(events).set({ issueId: targetIssueId }).where(eq(events.issueId, srcId));
      }

      // Update target count
      const totalResult = await db
        .select({ value: count() })
        .from(events)
        .where(eq(events.issueId, targetIssueId));

      const totalEvents = totalResult[0]?.value ?? 1;
      await db.update(issues).set({ count: totalEvents }).where(eq(issues.id, targetIssueId));

      // Delete source issues
      for (const srcId of sourceIssueIds) {
        await db.delete(issues).where(eq(issues.id, srcId));
      }

      return { merged: sourceIssueIds.length, targetIssueId, totalEvents: totalEvents ?? 0 };
    },
    {
      body: t.Object({
        targetIssueId: t.String({ format: "uuid" }),
        sourceIssueIds: t.Array(t.String({ format: "uuid" }), { minItems: 1 }),
      }),
    },
  )

  // Delete
  .delete(
    "/issues/:id",
    async ({ params, set }) => {
      const existing = await db.select({ id: issues.id }).from(issues).where(eq(issues.id, params.id)).limit(1);
      if (!existing[0]) { set.status = 404; return { error: "Issue not found" }; }

      await db.delete(events).where(eq(events.issueId, params.id));
      await db.delete(issues).where(eq(issues.id, params.id));
      return { deleted: true };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  );
