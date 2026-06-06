import { Elysia, t } from "elysia";
import { mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";

const SOURCEMAPS_DIR = join(process.cwd(), "sourcemaps");

async function ensureDir(dir: string) {
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
}

function projectDir(projectId: string) {
  return join(SOURCEMAPS_DIR, projectId);
}

export const sourcemapsRoutes = new Elysia({ prefix: "/api/sourcemaps" })

  // Upload source map for a release
  .post("/:projectId", async ({ params, request, set }) => {
    try {
      await ensureDir(SOURCEMAPS_DIR);
      const dir = projectDir(params.projectId);
      await ensureDir(dir);

      const formData = await request.formData();
      const file = formData.get("file");
      const release = formData.get("release") as string | null;

      if (!file || !(file instanceof File)) {
        set.status = 400;
        return { error: "Missing 'file' in form data" };
      }
      if (!release) {
        set.status = 400;
        return { error: "Missing 'release' in form data" };
      }

      const safeName = release.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = join(dir, `${safeName}.map`);
      const buffer = Buffer.from(await file.arrayBuffer());
      await writeFile(filePath, buffer);

      return { uploaded: true, projectId: params.projectId, release, size: buffer.length };
    } catch (_err) {
      set.status = 500;
      return { error: "Upload failed" };
    }
  }, {
    params: t.Object({ projectId: t.String({ format: "uuid" }) }),
  })

  // Download source map for a release
  .get("/:projectId/:release", async ({ params, set }) => {
    const dir = projectDir(params.projectId);
    const safeName = params.release.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = join(dir, `${safeName}.map`);

    if (!existsSync(filePath)) {
      set.status = 404;
      return { error: "Source map not found" };
    }

    const content = await readFile(filePath, "utf-8");
    return new Response(content, {
      headers: { "Content-Type": "application/json" },
    });
  }, {
    params: t.Object({
      projectId: t.String({ format: "uuid" }),
      release: t.String(),
    }),
  })

  // List uploaded source maps for a project
  .get("/:projectId", async ({ params }) => {
    const dir = projectDir(params.projectId);
    if (!existsSync(dir)) return { releases: [] };

    const files = await readdir(dir);
    const releases = files.filter((f) => f.endsWith(".map")).map((f) => f.replace(".map", ""));
    return { releases };
  }, {
    params: t.Object({ projectId: t.String({ format: "uuid" }) }),
  })

  // Delete a source map
  .delete("/:projectId/:release", async ({ params, set }) => {
    const { unlink } = await import("node:fs/promises");
    const dir = projectDir(params.projectId);
    const safeName = params.release.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = join(dir, `${safeName}.map`);

    if (!existsSync(filePath)) {
      set.status = 404;
      return { error: "Source map not found" };
    }

    await unlink(filePath);
    return { deleted: true };
  }, {
    params: t.Object({
      projectId: t.String({ format: "uuid" }),
      release: t.String(),
    }),
  });
