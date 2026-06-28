import { Elysia } from "elysia";
import { lookupProjectByTenantId } from "../lib/auth.js";

/**
 * tenantScopePlugin — normalizes external tenant-style query params into
 * the observe-native `project_id` / `projectId` parameters used by every
 * list endpoint.
 *
 * Background: hiai-observe is a single-tenant-per-key system. Its DB schema
 * scopes every record by `project_id` and most routes already accept that as
 * a query filter. Some handlers read `query.project_id` (snake), others read
 * `query.projectId` (camel) — Elysia exposes query keys verbatim from the
 * URL. External hosts (hiai-admin, hiai-dashboard) speak in `tenant_id`
 * because their own domain model is tenants-first.
 *
 * This plugin runs on every request. If the caller passed a tenant-style
 * alias, it normalizes the parsed `query` object so handlers reading either
 * `query.project_id` (snake) or `query.projectId` (camel) see the value
 * transparently — without per-route edits. It also derives `tenantProjectId`
 * for handlers that prefer to read it directly.
 *
 * Scope semantics (see docs/EMBED.md → Scope Parameters):
 * - `?project_id=UUID`  — canonical snake_case (monitor / infrastructure)
 * - `?projectId=UUID`   — canonical camelCase (alerts / issues / traces)
 * - `?tenant_id=UUID`   — primary alias (admin shells send this)
 * - `?tenantId=UUID`    — camelCase alias (dashboard stores.svelte)
 * - If multiple are set, `project_id` / `projectId` win (canonical first).
 * - Auth still runs upstream — this plugin only mutates query strings.
 *
 * Tenant resolution: when the caller passes a *tenant* identifier (a slug
 * like `acme-tenant` rather than a project UUID), we look up the bound
 * project via `lookupProjectByTenantId` and use the resolved projectId for
 * the canonical filter keys. The raw tenant id stays available as
 * `tenantProjectId` for handlers that want to log it. If the tenant has
 * no bound project, the request still proceeds with an empty filter
 * (callers that pass a bad tenant see an empty list — they don't get a
 * 401, because tenant auth is enforced upstream by the admin proxy).
 *
 * Implementation note: Elysia stores the parsed `query` object on the route
 * context. We rewrite keys on that object directly via `onParse`-equivalent
 * timing (the transform hook fires after parsing) so handlers downstream
 * transparently see canonical keys. We also remove the tenant alias keys
 * to keep `query` clean for downstream validators that might reject
 * unknown fields. `derive` is async (so it can do the DB lookup) and
 * `onTransform` reads the result.
 */
export const tenantScopePlugin = new Elysia({ name: "tenant-scope" })
  .derive({ as: "global" }, async ({ request }) => {
    const url = new URL(request.url);
    const params = url.searchParams;

    const canonicalSnake = params.get("project_id");
    const canonicalCamel = params.get("projectId");
    const tenantIdSnake = params.get("tenant_id");
    const tenantIdCamel = params.get("tenantId");

    // The first non-empty alias in priority order — this is the *raw*
    // value the caller sent. Used to decide whether to do a DB lookup.
    const rawAlias = canonicalSnake ?? canonicalCamel ?? tenantIdSnake ?? tenantIdCamel;

    // If the caller already passed a canonical `project_id` / `projectId`,
    // that wins. We don't try to resolve it as a tenant id — if the
    // caller mixed both forms with the canonical taking priority, the
    // tenant lookup would be wasted work anyway.
    const isCanonical = canonicalSnake != null || canonicalCamel != null;

    // Only treat the value as a tenant id (slug) when it was passed via
    // a tenant-style alias. Otherwise it's already a projectId UUID and
    // there's nothing to resolve.
    const tenantAliasValue =
      !isCanonical && (tenantIdSnake != null || tenantIdCamel != null)
        ? (tenantIdSnake ?? tenantIdCamel)
        : undefined;

    let resolvedProjectId: string | undefined;
    if (tenantAliasValue !== undefined) {
      const resolved = await lookupProjectByTenantId(tenantAliasValue);
      resolvedProjectId = resolved?.projectId;
    }

    return {
      // Raw alias value (whatever the caller sent) — useful for logging
      // and for handlers that need to know the *tenant* id rather than
      // the bound project.
      tenantProjectId: rawAlias ?? undefined,
      // Resolved projectId when the raw alias was a tenant id and the
      // lookup succeeded. Undefined if the caller passed a projectId
      // directly (in which case the canonical form is already set) or
      // the tenant has no bound project.
      resolvedProjectId,
    };
  })
  .onTransform({ as: "global" }, ({ query, tenantProjectId, resolvedProjectId }) => {
    if (typeof query !== "object" || query === null) return;

    const q = query as Record<string, unknown>;

    // The value to fill into the canonical project_id / projectId keys
    // is the resolved projectId (when we successfully looked up a tenant
    // id) or the raw alias (when the caller passed a projectId UUID
    // directly via a tenant-style alias — embed/dashboard does this
    // because the dashboard's projectId UUID *is* the only id the
    // dashboard knows about, and it sends it as `tenantId` for display).
    const canonical = resolvedProjectId !== undefined ? resolvedProjectId : tenantProjectId;

    if (!canonical) return;

    // Fill canonical forms the handler expects, but never overwrite an
    // explicit canonical value — caller may be intentionally passing a
    // tenant_id that differs from a project_id they want filtered.
    if (!("project_id" in q) || q.project_id === undefined || q.project_id === "") {
      q.project_id = canonical;
    }
    if (!("projectId" in q) || q.projectId === undefined || q.projectId === "") {
      q.projectId = canonical;
    }

    // Strip tenant-style aliases so downstream schema validators don't
    // see unknown keys (Elysia schemas can be strict by default).
    delete q.tenant_id;
    delete q.tenantId;
  });
