/**
 * Admin bridge endpoints (OBS2.3c).
 *
 * Server-to-server API used by hiai-admin-proxy to manage the per-tenant
 * observe projects that back the JWT↔API-key auth bridge (see
 * docs/AUTH_BRIDGE.md §"Observe-side implementation").
 *
 * Endpoints:
 *   POST   /api/admin/projects              — Create a project + mint API key
 *                                             (optionally scoped to a tenant_id)
 *   GET    /api/admin/projects              — List projects (for admin-proxy bootstrap)
 *   POST   /api/admin/projects/:id/rotate-key — Rotate an API key
 *   GET    /api/admin/tenants/:tenantId     — Resolve tenant_id → project info
 *
 * All endpoints require the `ADMIN_API_KEY` Bearer token (constant-time
 * compared in lib/admin-auth.ts). This is NOT a user credential — it's the
 * server-to-server shared secret between observe and hiai-admin-proxy.
 *
 * Threat model & rotation: see docs/AUTH_BRIDGE.md §"Observe-side implementation".
 */

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { requireAdminKey } from "../lib/admin-auth.js";
import { hashApiKey, maskApiKey } from "../lib/auth.js";
import { logger } from "../lib/logger.js";
import { db } from "../store/db.js";
import { projects } from "../store/schema.js";

/**
 * Public projection for projects returned to admin-proxy.
 *
 * Excludes:
 *   - `apiKeyHash`     (bcrypt hash — never leaves the server)
 *   - `apiKey`         (legacy plaintext column; deprecated)
 *
 * The shape is inlined at each query site because Drizzle's `.select({...})`
 * expects column references, not a reusable SelectedFields object.
 */
function projectPublicSelect() {
  return {
    id: projects.id,
    name: projects.name,
    slug: projects.slug,
    keyPrefix: projects.keyPrefix,
    tenantId: projects.tenantId,
    apiRole: projects.apiRole,
    customDomain: projects.customDomain,
    logoUrl: projects.logoUrl,
    description: projects.description,
    autoResolveOnDeploy: projects.autoResolveOnDeploy,
    createdAt: projects.createdAt,
  };
}

/**
 * Build a deterministic-ish slug from a name. Falls back to a UUID-derived
 * slug if the name yields an empty slug after sanitization.
 */
function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || `project-${randomUUID().slice(0, 8)}`;
}

function mintApiKey(): string {
  return `ho_${randomUUID().replace(/-/g, "")}`;
}

function checkAdmin(
  headers: Record<string, string | undefined>,
): { ok: true } | { ok: false; status: number; body: { error: string } } {
  const result = requireAdminKey(headers);
  if (result.ok) return { ok: true };
  return { ok: false, status: result.status, body: { error: result.error } };
}

export const adminBridgeRoutes = new Elysia({ prefix: "/api/admin" })

  // ── POST /api/admin/projects ────────────────────────────────────────────
  // Creates a project and mints its first API key. Accepts an optional
  // `tenantId` so admin-proxy can scope the project to an external tenant
  // (1 tenant = 1 observe project, per AUTH_BRIDGE.md).
  //
  // Idempotency: if a project already exists for `tenantId`, its key is
  // rotated and the same project record returned with `rotated: true`.
  // Returns the plaintext API key ONCE — admin-proxy must store it
  // (encrypted at rest) immediately. The key is never recoverable again.
  .post(
    "/projects",
    async ({ body, headers, set }) => {
      const check = checkAdmin(headers as Record<string, string | undefined>);
      if (!check.ok) {
        set.status = check.status;
        return check.body;
      }

      const apiKey = mintApiKey();
      const { hash, prefix } = await hashApiKey(apiKey);

      // Idempotency: if a project already exists for this tenantId, rotate
      // its key and return the existing record.
      if (body.tenantId) {
        const [existing] = await db
          .select(projectPublicSelect())
          .from(projects)
          .where(eq(projects.tenantId, body.tenantId))
          .limit(1);
        if (existing) {
          await db
            .update(projects)
            .set({ apiKeyHash: hash, keyPrefix: prefix, apiKey: null })
            .where(eq(projects.id, existing.id));

          logger.info("Admin bridge: rotated key for existing tenant project", {
            projectId: existing.id,
            tenantId: body.tenantId,
          });
          return { project: { ...existing, keyPrefix: prefix }, apiKey, rotated: true };
        }
      }

      const slug = slugify(body.name);

      const [created] = await db
        .insert(projects)
        .values({
          name: body.name,
          slug,
          tenantId: body.tenantId ?? null,
          apiKeyHash: hash,
          keyPrefix: prefix,
          apiRole: body.apiRole ?? "admin",
        })
        .returning(projectPublicSelect());

      if (!created) {
        set.status = 500;
        return { error: "Failed to create project" };
      }

      logger.info("Admin bridge: created tenant project", {
        projectId: created.id,
        tenantId: created.tenantId,
      });

      set.status = 201;
      return { project: created, apiKey, rotated: false };
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 100 }),
        tenantId: t.Optional(t.String({ minLength: 1, maxLength: 128 })),
        apiRole: t.Optional(
          t.Union([t.Literal("admin"), t.Literal("member"), t.Literal("readonly")]),
        ),
      }),
    },
  )

  // ── GET /api/admin/projects ─────────────────────────────────────────────
  // Lists all projects (with tenant_id + keyPrefix). Admin-proxy uses this
  // at bootstrap to backfill its tenant→project mapping table.
  .get("/projects", async ({ headers, set }) => {
    const check = checkAdmin(headers as Record<string, string | undefined>);
    if (!check.ok) {
      set.status = check.status;
      return check.body;
    }

    const items = await db.select(projectPublicSelect()).from(projects).orderBy(projects.createdAt);

    return {
      projects: items.map((p) => ({
        ...p,
        apiKeyPreview: p.keyPrefix ? `${p.keyPrefix}...` : null,
      })),
    };
  })

  // ── POST /api/admin/projects/:id/rotate-key ─────────────────────────────
  // Forces a key rotation on an existing project. Returns the new plaintext
  // key ONCE. Used when an API key is compromised or as part of periodic
  // rotation policy.
  .post(
    "/projects/:id/rotate-key",
    async ({ params, headers, set }) => {
      const check = checkAdmin(headers as Record<string, string | undefined>);
      if (!check.ok) {
        set.status = check.status;
        return check.body;
      }

      const newKey = mintApiKey();
      const { hash, prefix } = await hashApiKey(newKey);

      const [updated] = await db
        .update(projects)
        .set({ apiKeyHash: hash, keyPrefix: prefix, apiKey: null })
        .where(eq(projects.id, params.id))
        .returning(projectPublicSelect());

      if (!updated) {
        set.status = 404;
        return { error: "Project not found" };
      }

      logger.info("Admin bridge: rotated key for project", {
        projectId: updated.id,
        tenantId: updated.tenantId,
      });

      return { project: updated, apiKey: newKey, apiKeyPreview: maskApiKey(newKey) };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
    },
  )

  // ── GET /api/admin/tenants/:tenantId ────────────────────────────────────
  // Resolves a tenant_id (the external admin-side identifier) to the observe
  // project that owns it. This is the lookup admin-proxy uses on every
  // incoming request to find the right API key to inject.
  //
  // Returns 404 when the tenant is not provisioned — admin-proxy should
  // treat this as a "needs provisioning" signal and call POST /api/admin/projects.
  .get(
    "/tenants/:tenantId",
    async ({ params, headers, set }) => {
      const check = checkAdmin(headers as Record<string, string | undefined>);
      if (!check.ok) {
        set.status = check.status;
        return check.body;
      }

      const [project] = await db
        .select(projectPublicSelect())
        .from(projects)
        .where(eq(projects.tenantId, params.tenantId))
        .limit(1);

      if (!project) {
        set.status = 404;
        return {
          error: "Tenant not provisioned in observe",
          tenantId: params.tenantId,
        };
      }

      return {
        tenantId: project.tenantId,
        project: {
          ...project,
          apiKeyPreview: project.keyPrefix ? `${project.keyPrefix}...` : null,
        },
      };
    },
    {
      params: t.Object({ tenantId: t.String({ minLength: 1, maxLength: 128 }) }),
    },
  );
