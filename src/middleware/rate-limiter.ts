import { Elysia } from "elysia";
import { config } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import { redis } from "../store/redis.js";
import { resolveProjectId } from "./auth.js";
import { recordRateLimiterFallOpen } from "./metrics.js";

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

const DEFAULT_LIMITS: Record<string, RateLimitConfig> = {
  "/api": { windowMs: 60_000, maxRequests: 100 },
  "/v1": { windowMs: 60_000, maxRequests: 1000 },
  "/api/:projectId/store": { windowMs: 60_000, maxRequests: 5000 },
  "/api/:projectId/envelope": { windowMs: 60_000, maxRequests: 5000 },
};

const KEY_LIMITS: Record<string, RateLimitConfig> = {
  "/api": { windowMs: 60_000, maxRequests: 200 },
  "/v1": { windowMs: 60_000, maxRequests: 2000 },
  "/api/:projectId/store": { windowMs: 60_000, maxRequests: 10000 },
  "/api/:projectId/envelope": { windowMs: 60_000, maxRequests: 10000 },
};

function getLimitForPath(path: string): RateLimitConfig {
  for (const [pattern, config] of Object.entries(DEFAULT_LIMITS)) {
    if (path.startsWith(pattern.replace(/\/:(\w+)/g, ""))) {
      return config;
    }
  }
  return { windowMs: 60_000, maxRequests: 100 };
}

function getKeyLimitForPath(path: string): RateLimitConfig {
  for (const [pattern, config] of Object.entries(KEY_LIMITS)) {
    if (path.startsWith(pattern.replace(/\/:(\w+)/g, ""))) {
      return config;
    }
  }
  return { windowMs: 60_000, maxRequests: 200 };
}

const TRUST_PROXY = config.TRUST_PROXY === "true";

function getClientIp(request: Request): string {
  // When behind a trusted reverse proxy, prefer forwarded headers
  if (TRUST_PROXY) {
    return (
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown"
    );
  }

  // Direct connection: use socket address (not spoofable by client)
  return (
    (request as unknown as { socket?: { remoteAddress?: string } }).socket?.remoteAddress ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

async function checkLimit(
  key: string,
  windowMs: number,
  maxRequests: number,
): Promise<{ allowed: boolean; remaining: number; resetMs: number }> {
  const now = Date.now();
  const windowStart = now - windowMs;

  const multi = redis.multi();
  multi.zremrangebyscore(key, 0, windowStart);
  multi.zadd(key, now, `${now}:${Math.random()}`);
  multi.zcard(key);
  multi.pexpire(key, windowMs);

  const results = await multi.exec();
  const count = (results?.[2]?.[1] as number) ?? 0;

  return {
    allowed: count <= maxRequests,
    remaining: Math.max(0, maxRequests - count),
    resetMs: windowMs - (now % windowMs),
  };
}

// ── Per-project rate limit cache ──────────────────────────────────────────
// LRU cache (projectId → { rateLimit, rateLimitWindowMs } | null) with a 60s
// TTL. The rate-limiter runs on every request, so we cannot afford a DB hit
// per request. The TTL is short enough that operator changes propagate
// within a minute; long enough that hot projects hit the cache for almost
// every request. `null` (not undefined) means "we looked this up and the
// project has no custom limit" — distinct from "we haven't looked it up".
const PROJECT_LIMIT_TTL_MS = 60_000;
const PROJECT_LIMIT_CACHE_MAX = 1_000;
const projectLimitCache = new Map<
  string,
  { value: { rateLimit: number; rateLimitWindowMs: number } | null; expiresAt: number }
>();

function projectLimitCacheGet(
  projectId: string,
): { value: { rateLimit: number; rateLimitWindowMs: number } | null } | undefined {
  const entry = projectLimitCache.get(projectId);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    projectLimitCache.delete(projectId);
    return undefined;
  }
  // Promote to most-recently-used
  projectLimitCache.delete(projectId);
  projectLimitCache.set(projectId, entry);
  return { value: entry.value };
}

function projectLimitCacheSet(
  projectId: string,
  value: { rateLimit: number; rateLimitWindowMs: number } | null,
): void {
  if (projectLimitCache.size >= PROJECT_LIMIT_CACHE_MAX) {
    const oldest = projectLimitCache.keys().next().value;
    if (oldest) projectLimitCache.delete(oldest);
  }
  projectLimitCache.set(projectId, { value, expiresAt: Date.now() + PROJECT_LIMIT_TTL_MS });
}

/**
 * Test-only: clear the per-project rate limit cache. Production code never
 * needs to do this — operators can wait 60s for natural expiry, or restart
 * the process. Used by tests to assert fresh lookups.
 */
export function _clearProjectLimitCacheForTests(): void {
  projectLimitCache.clear();
}

/**
 * Invalidate the cache entry for a single project. Called from the
 * /api/projects/:id/rate-limit handler so a freshly-saved limit takes
 * effect on the very next request, without waiting for the 60s TTL.
 * Best-effort: a missing entry is a no-op.
 */
export function invalidateProjectRateLimitCache(projectId: string): void {
  projectLimitCache.delete(projectId);
}

/**
 * Look up a project's per-project rate limit override. Returns the
 * (rateLimit, rateLimitWindowMs) pair when the project has a custom limit
 * configured, or null when it has none (caller should fall back to the
 * global path-based default). Any DB error is logged and treated as
 * "no override" — fail-open here mirrors the rest of the rate limiter:
 * a transient DB issue must not turn into a self-DOS.
 *
 * The DB import is deferred inside the function body to avoid a circular
 * dependency between this middleware and the Drizzle schema at module load.
 */
async function getProjectRateLimit(
  projectId: string,
): Promise<{ rateLimit: number; rateLimitWindowMs: number } | null> {
  const cached = projectLimitCacheGet(projectId);
  if (cached !== undefined) return cached.value;

  try {
    const { db } = await import("../store/db.js");
    const { projects } = await import("../store/schema.js");
    const { eq } = await import("drizzle-orm");
    const [row] = await db
      .select({
        rateLimit: projects.rateLimit,
        rateLimitWindowMs: projects.rateLimitWindowMs,
      })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    const value =
      row && row.rateLimit !== null
        ? {
            rateLimit: row.rateLimit,
            // Window falls back to 60s when only rateLimit is set. This is
            // the documented default and matches the path-based defaults.
            rateLimitWindowMs: row.rateLimitWindowMs ?? 60_000,
          }
        : null;

    projectLimitCacheSet(projectId, value);
    return value;
  } catch (err) {
    logger.warn("Per-project rate limit lookup failed, falling back to global", {
      projectId,
      error: String(err),
    });
    return null;
  }
}

/**
 * Normalize a project override so the rest of the rate-limiter can treat it
 * the same as the path-based defaults: a `(windowMs, maxRequests)` pair.
 * `rateLimitWindowMs` is clamped to a minimum of 1000ms (1s) to avoid abuse
 * via sub-second windows that would create excessive Redis churn.
 */
function projectOverrideToConfig(override: {
  rateLimit: number;
  rateLimitWindowMs: number;
}): RateLimitConfig {
  return {
    windowMs: Math.max(1_000, override.rateLimitWindowMs),
    maxRequests: Math.max(1, override.rateLimit),
  };
}

export const rateLimiterPlugin = new Elysia()
  .derive(() => {
    return { rateLimitHeaders: {} as Record<string, string> };
  })
  // `as: "global"` is required: a plugin's `onBeforeHandle` is local by
  // default in Elysia 1.4, which means it would only apply to routes
  // defined INSIDE the plugin instance. Marking the hook global merges it
  // into the parent app's event lifecycle so the rate limiter fires for
  // every route registered on `app` after `.use(rateLimiterPlugin)`.
  // Without this, the rate limiter silently no-ops in production.
  .onBeforeHandle({ as: "global" }, async ({ request, set }) => {
    const path = new URL(request.url).pathname;

    // Bypass rate limiting for public/health endpoints and iframe-friendly
    // embed routes. /embed/* and /status/* are designed to be loaded
    // inside hiai-dashboard iframes — throttling them per-IP would defeat
    // the purpose. Operators concerned about abuse should set reverse-proxy
    // rate limits instead.
    if (
      path === "/api/health" ||
      path === "/health" ||
      path === "/metrics" ||
      path.startsWith("/metrics") ||
      path === "/status" ||
      path.startsWith("/status/") ||
      path === "/embed" ||
      path.startsWith("/embed/")
    ) {
      return undefined;
    }

    const config = getLimitForPath(path);
    const clientIp = getClientIp(request);

    const apiKey = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || null;

    const hasKey = apiKey !== null;
    const keyLimit = hasKey ? getKeyLimitForPath(path) : null;
    const keyPrefix = hasKey ? apiKey.slice(0, 8) : null;

    const ipKey = `rl:ip:${clientIp}:${path}`;
    const keyBasedKey = hasKey ? `rl:key:${keyPrefix}:${path}` : null;

    // Per-project override: if the caller authenticated as a project that
    // has a custom rate limit configured, we apply that limit on top of
    // the IP-based limit. The project-scoped key is namespaced by the
    // projectId and a hash of the window size so changing the window
    // produces a fresh bucket (avoids stale counters when an operator
    // tightens the window). `resolveProjectId` is internally LRU-cached
    // (60s), so the second call per request is cheap.
    const projectId = await resolveProjectId(request);
    let projectLimitConfig: RateLimitConfig | null = null;
    let projectKey: string | null = null;
    if (projectId) {
      const override = await getProjectRateLimit(projectId);
      if (override) {
        projectLimitConfig = projectOverrideToConfig(override);
        projectKey = `rl:proj:${projectId}:${clientIp}:${path}:${projectLimitConfig.windowMs}`;
      }
    }

    try {
      const ipResult = await checkLimit(ipKey, config.windowMs, config.maxRequests);
      const keyResult =
        keyBasedKey && keyLimit
          ? await checkLimit(keyBasedKey, keyLimit.windowMs, keyLimit.maxRequests)
          : null;
      const projectResult =
        projectKey && projectLimitConfig
          ? await checkLimit(
              projectKey,
              projectLimitConfig.windowMs,
              projectLimitConfig.maxRequests,
            )
          : null;

      // The effective remaining count is the tightest of all three buckets
      // (ip, api-key, project). The effective limit is the project limit
      // when one is configured, otherwise the api-key limit, otherwise the
      // ip limit. Headers reflect the effective ceiling so clients see the
      // most restrictive one in play.
      const effectiveRemaining = projectResult
        ? keyResult
          ? Math.min(projectResult.remaining, keyResult.remaining, ipResult.remaining)
          : Math.min(projectResult.remaining, ipResult.remaining)
        : keyResult
          ? Math.min(keyResult.remaining, ipResult.remaining)
          : ipResult.remaining;

      const effectiveLimit = projectLimitConfig
        ? projectLimitConfig.maxRequests
        : keyLimit
          ? keyLimit.maxRequests
          : config.maxRequests;

      const effectiveResetMs = projectResult
        ? keyResult
          ? Math.min(projectResult.resetMs, keyResult.resetMs, ipResult.resetMs)
          : Math.min(projectResult.resetMs, ipResult.resetMs)
        : keyResult
          ? Math.min(keyResult.resetMs, ipResult.resetMs)
          : ipResult.resetMs;

      const headers: Record<string, string> = {
        "X-RateLimit-Limit": String(effectiveLimit),
        "X-RateLimit-Remaining": String(effectiveRemaining),
        "X-RateLimit-Reset": String(Math.ceil(effectiveResetMs / 1000)),
      };

      const overLimit =
        !ipResult.allowed ||
        (keyResult && !keyResult.allowed) ||
        (projectResult && !projectResult.allowed);

      if (overLimit) {
        set.status = 429;
        // Retry-After: use the window of the tightest limit, preferring
        // the project limit (most operator-specific) over the key limit,
        // over the global default.
        const retryAfter = projectLimitConfig
          ? Math.ceil(projectLimitConfig.windowMs / 1000)
          : keyLimit
            ? Math.ceil(keyLimit.windowMs / 1000)
            : Math.ceil(config.windowMs / 1000);
        headers["Retry-After"] = String(retryAfter);
        set.headers = headers;
        return { error: "Too many requests", retryAfter };
      }

      set.headers = headers;
    } catch (err) {
      // Fail-open: when Redis is unavailable, allow the request through.
      // A Redis hiccup must not become a self-DOS that blocks all traffic
      // (including health checks on other paths).
      logger.warn("Rate limiter unavailable, falling open", { error: String(err) });
      recordRateLimiterFallOpen();
      return;
    }
  });
