import { Elysia, t } from "elysia";
import { db } from "../store/db.js";
import { projects } from "../store/schema.js";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

export const projectsRoutes = new Elysia({ prefix: "/api/projects" })

  .get("/", async () => {
    const items = await db.select({
      id: projects.id,
      name: projects.name,
      slug: projects.slug,
      createdAt: projects.createdAt,
    }).from(projects).orderBy(projects.createdAt);

    return { projects: items };
  })

  .post("/", async ({ body, set }) => {
    const apiKey = `ho_${randomUUID().replace(/-/g, "")}`;
    const slug = body.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    const [created] = await db.insert(projects).values({
      name: body.name,
      slug,
      apiKey,
    }).returning();

    set.status = 201;
    return { project: created, apiKey };
  }, {
    body: t.Object({
      name: t.String({ minLength: 1, maxLength: 100 }),
    }),
  })

  .post("/:id/rotate-key", async ({ params, set }) => {
    const newKey = `ho_${randomUUID().replace(/-/g, "")}`;
    const [updated] = await db.update(projects)
      .set({ apiKey: newKey })
      .where(eq(projects.id, params.id))
      .returning();

    if (!updated) { set.status = 404; return { error: "Project not found" }; }
    return { apiKey: newKey };
  }, {
    params: t.Object({ id: t.String({ format: "uuid" }) }),
  })

  .delete("/:id", async ({ params, set }) => {
    const [existing] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, params.id)).limit(1);
    if (!existing) { set.status = 404; return { error: "Project not found" }; }

    await db.delete(projects).where(eq(projects.id, params.id));
    return { deleted: true };
  }, {
    params: t.Object({ id: t.String({ format: "uuid" }) }),
  });
