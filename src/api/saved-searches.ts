import { Elysia, t } from "elysia";
import { db } from "../store/db.js";
import { savedSearches, } from "../store/schema.js";
import { eq, desc } from "drizzle-orm";
import { notFound } from "../lib/errors.js";

export const savedSearchesPlugin = new Elysia({ prefix: "/api/saved-searches" })
  .get("/", async ({ query }) => {
    const { projectId } = query;
    const conditions = [];
    if (projectId) conditions.push(eq(savedSearches.projectId, projectId));

    const rows = conditions.length > 0
      ? await db.select().from(savedSearches).where(eq(savedSearches.projectId, projectId!)).orderBy(desc(savedSearches.createdAt))
      : await db.select().from(savedSearches).orderBy(desc(savedSearches.createdAt));

    return { data: rows };
  }, {
    query: t.Object({
      projectId: t.Optional(t.String()),
    }),
  })
  .post(
    "/",
    async ({ body }) => {
      const [created] = await db.insert(savedSearches).values({
        name: body.name,
        query: body.query,
        filters: body.filters ?? null,
        projectId: body.projectId ?? null,
      }).returning();
      return { data: created };
    },
    {
      body: t.Object({
        name: t.String(),
        query: t.String(),
        filters: t.Optional(t.Record(t.String(), t.Unknown())),
        projectId: t.Optional(t.String()),
      }),
    }
  )
  .delete(
    "/:id",
    async ({ params }) => {
      const [deleted] = await db.delete(savedSearches).where(eq(savedSearches.id, params.id)).returning();
      if (!deleted) return notFound("Saved search not found");
      return { data: deleted };
    },
    {
      params: t.Object({
        id: t.String(),
      }),
    }
  );
