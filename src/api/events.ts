import { and, count, desc, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { parseLimit, parseOffset } from "../lib/pagination.js";
import { db } from "../store/db.js";
import { events } from "../store/schema.js";

export const eventsPlugin = new Elysia({ prefix: "/api" })
  .get(
    "/events",
    async ({ query }) => {
      const { issueId, projectId, limit = "50", offset = "0" } = query;
      const lim = parseLimit(limit);
      const off = parseOffset(offset);

      const conditions = [];
      if (issueId) conditions.push(eq(events.issueId, issueId));
      if (projectId) conditions.push(eq(events.projectId, projectId));
      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [rows, total] = await Promise.all([
        db
          .select()
          .from(events)
          .where(where)
          .orderBy(desc(events.createdAt))
          .limit(lim)
          .offset(off),
        db.select({ value: count() }).from(events).where(where),
      ]);

      return { data: rows, total: total[0]?.value ?? 0, limit: lim, offset: off };
    },
    {
      query: t.Object({
        issueId: t.Optional(t.String({ format: "uuid" })),
        projectId: t.Optional(t.String({ format: "uuid" })),
        // tenantId is accepted as an alias for projectId. tenantScopePlugin
        // resolves it to the bound project UUID before the handler runs.
        tenantId: t.Optional(t.String()),
        limit: t.Optional(t.String()),
        offset: t.Optional(t.String()),
      }),
    },
  )
  .get(
    "/events/:id",
    async ({ params, set }) => {
      const event = await db.select().from(events).where(eq(events.id, params.id)).limit(1);
      if (!event[0]) {
        set.status = 404;
        return { error: "Event not found" };
      }
      return event[0];
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  );
