import { eq } from "drizzle-orm";
import { db } from "../store/db.js";
import { projects } from "../store/schema.js";
import { logger } from "./logger.js";

/**
 * Parse an API key from a raw Authorization header value.
 * Supports: Bearer, Basic (base64 "key:secret"), Sentry DSN, X-API-Key prefix, raw key.
 * Returns { apiKey } on success, null on failure.
 */
export function resolveApiKey(raw: string | undefined): { apiKey: string } | null {
  if (!raw) return null;

  const trimmed = raw.trim();

  // Bearer token
  if (trimmed.startsWith("Bearer ")) {
    const token = trimmed.slice(7).trim();
    return token ? { apiKey: token } : null;
  }

  // Basic auth (format: "apikey:" or "apikey:secret")
  if (trimmed.startsWith("Basic ")) {
    try {
      const decoded = Buffer.from(trimmed.slice(6), "base64").toString();
      const colonIndex = decoded.indexOf(":");
      const key = colonIndex === -1 ? decoded : decoded.slice(0, colonIndex);
      return key ? { apiKey: key } : null;
    } catch {
      return null;
    }
  }

  // Sentry DSN format: "Sentry sentry_key=xxx, sentry_version=..."
  if (trimmed.startsWith("Sentry ")) {
    const match = trimmed.match(/sentry_key="?([^",\s]+)/);
    return match?.[1] ? { apiKey: match[1] } : null;
  }

  // X-API-Key prefix (used by some SDKs in Authorization header)
  if (trimmed.startsWith("X-API-Key ")) {
    const key = trimmed.slice(10).trim();
    return key ? { apiKey: key } : null;
  }

  // Raw key (no spaces, no known prefix)
  if (!trimmed.includes(" ")) {
    return trimmed ? { apiKey: trimmed } : null;
  }

  return null;
}

// ── LRU cache (apiKey -> projectId) ───────────────────────────────────────
const CACHE_TTL_MS = 60_000;
const CACHE_MAX = 1_000;
const cache = new Map<string, { projectId: string; expiresAt: number }>();

function cacheGet(key: string): string | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  // Promote to most-recently-used
  cache.delete(key);
  cache.set(key, entry);
  return entry.projectId;
}

function cacheSet(key: string, projectId: string): void {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { projectId, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ── LRU cache (tenantId -> projectId) ─────────────────────────────────────
// Separate from the apiKey cache because keys are namespaced differently and
// we want a clean isolation point if either eviction policy diverges in the
// future (e.g., longer TTL for tenant lookups if the value is more stable).
const tenantCache = new Map<string, { projectId: string | null; expiresAt: number }>();

function tenantCacheGet(tenantId: string): { projectId: string | null } | undefined {
  const entry = tenantCache.get(tenantId);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    tenantCache.delete(tenantId);
    return undefined;
  }
  // Promote to most-recently-used
  tenantCache.delete(tenantId);
  tenantCache.set(tenantId, entry);
  return { projectId: entry.projectId };
}

function tenantCacheSet(tenantId: string, projectId: string | null): void {
  if (tenantCache.size >= CACHE_MAX) {
    const oldest = tenantCache.keys().next().value;
    if (oldest) tenantCache.delete(oldest);
  }
  tenantCache.set(tenantId, { projectId, expiresAt: Date.now() + CACHE_TTL_MS });
}

/**
 * Look up a project by API key with 60s LRU cache.
 * Uses bcrypt verification against stored hash; falls back to legacy apiKey column during migration.
 * Returns { projectId } on success, null if key is invalid.
 */
export async function lookupProject(apiKey: string): Promise<{ projectId: string } | null> {
  const cached = cacheGet(apiKey);
  if (cached) return { projectId: cached };

  const prefix = apiKey.slice(0, 8);

  // Find candidates by key prefix (narrows bcrypt verification to a few rows)
  const candidates = await db
    .select({ id: projects.id, apiKeyHash: projects.apiKeyHash })
    .from(projects)
    .where(eq(projects.keyPrefix, prefix))
    .limit(10);

  for (const candidate of candidates) {
    if (candidate.apiKeyHash) {
      const ok = await Bun.password.verify(apiKey, candidate.apiKeyHash);
      if (ok) {
        cacheSet(apiKey, candidate.id);
        return { projectId: candidate.id };
      }
    }
  }

  return null;
}

/**
 * Look up a project by its external tenant identifier (projects.tenant_id).
 *
 * Conventions: 1 tenant = 1 observe project (see src/store/schema.ts →
 * projects.tenantId comment + docs/EMBED.md §"Scope Parameters"). The
 * hiai-admin layer writes this column when it provisions a tenant; observe
 * uses it as a public query alias so admin/dashboard shells can scope list
 * endpoints via `?tenantId=<external-id>` without leaking project UUIDs.
 *
 * Caching: 60s LRU, separate namespace from `lookupProject` so the two
 * lookups have independent eviction pressure.
 *
 * Returns `{ projectId }` on success, `null` if the tenant has no project
 * bound to it. Returns `null` for empty input without touching the DB.
 */
export async function lookupProjectByTenantId(
  tenantId: string | null | undefined,
): Promise<{ projectId: string } | null> {
  if (!tenantId) return null;

  const cached = tenantCacheGet(tenantId);
  if (cached !== undefined) {
    return cached.projectId ? { projectId: cached.projectId } : null;
  }

  try {
    const [row] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.tenantId, tenantId))
      .limit(1);

    const projectId = row?.id ?? null;
    tenantCacheSet(tenantId, projectId);
    return projectId ? { projectId } : null;
  } catch (err) {
    // DB errors must not crash the request — fall through to "no match"
    // and let downstream handlers return an empty result set. Log so the
    // operator sees the issue in observability without breaking queries.
    logger.error("lookupProjectByTenantId failed", { tenantId, error: String(err) });
    return null;
  }
}

/**
 * Hash an API key and return { hash, prefix } for storage.
 */
export async function hashApiKey(apiKey: string): Promise<{ hash: string; prefix: string }> {
  const hash = await Bun.password.hash(apiKey, "bcrypt");
  const prefix = apiKey.slice(0, 8);
  return { hash, prefix };
}

/**
 * Return a masked version of an API key for display: first 8 chars + "..."
 */
export function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 8) return apiKey;
  return `${apiKey.slice(0, 8)}...`;
}
