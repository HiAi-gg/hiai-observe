import { desc, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { notFound } from "../lib/errors.js";
import { applyScope, assertResourceProject, isScope } from "../lib/project-scope.js";
import { db } from "../store/db.js";
import { savedSearches } from "../store/schema.js";

export const savedSearchesPlugin = new Elysia({ prefix: "/api/saved-searches" })
  .get(
    "/",
    async ({ query, request, set }) => {
      const scope = await applyScope({
        request,
        query: query as Record<string, unknown>,
        set,
      });
      if (!isScope(scope)) return scope;

      const rows = scope.projectId
        ? await db
            .select()
            .from(savedSearches)
            .where(eq(savedSearches.projectId, scope.projectId))
            .orderBy(desc(savedSearches.createdAt))
        : await db.select().from(savedSearches).orderBy(desc(savedSearches.createdAt));

      return { data: rows };
    },
    {
      query: t.Object({
        projectId: t.Optional(t.String()),
        tenantId: t.Optional(t.String()),
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

      if (!scope.admin && body.projectId && body.projectId !== scope.projectId) {
        set.status = 403;
        return { error: "Forbidden: cannot save searches for another project" };
      }
      const boundProjectId = scope.admin
        ? (body.projectId ?? null)
        : (scope.projectId ?? body.projectId ?? null);

      const [created] = await db
        .insert(savedSearches)
        .values({
          name: body.name,
          query: body.query,
          filters: body.filters ?? null,
          projectId: boundProjectId,
        })
        .returning();
      return { data: created };
    },
    {
      body: t.Object({
        name: t.String(),
        query: t.String(),
        filters: t.Optional(t.Record(t.String(), t.Unknown())),
        projectId: t.Optional(t.String()),
      }),
    },
  )
  .delete(
    "/:id",
    async ({ params, request, set }) => {
      const scope = await applyScope({
        request,
        set,
      });
      if (!isScope(scope)) return scope;

      const [existing] = await db
        .select()
        .from(savedSearches)
        .where(eq(savedSearches.id, params.id))
        .limit(1);
      if (!existing || !assertResourceProject(existing.projectId, scope.projectId, scope.admin)) {
        return notFound("Saved search not found");
      }

      const [deleted] = await db
        .delete(savedSearches)
        .where(eq(savedSearches.id, params.id))
        .returning();
      if (!deleted) return notFound("Saved search not found");
      return { data: deleted };
    },
    {
      params: t.Object({
        id: t.String(),
      }),
    },
  );
