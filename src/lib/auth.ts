import { db } from "../store/db.js";
import { projects } from "../store/schema.js";
import { eq } from "drizzle-orm";

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
    .select({ id: projects.id, apiKeyHash: projects.apiKeyHash, apiKey: projects.apiKey })
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
    // Fallback: legacy plaintext apiKey (during migration period)
    if (candidate.apiKey && candidate.apiKey === apiKey) {
      cacheSet(apiKey, candidate.id);
      return { projectId: candidate.id };
    }
  }

  return null;
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
