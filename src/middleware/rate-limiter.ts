import { Elysia } from "elysia";
import { redis } from "../store/redis.js";

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

const TRUST_PROXY = process.env.TRUST_PROXY === "true";

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

async function checkLimit(key: string, windowMs: number, maxRequests: number): Promise<{ allowed: boolean; remaining: number; resetMs: number }> {
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

export const rateLimiterPlugin = new Elysia()
  .derive(() => {
    return { rateLimitHeaders: {} as Record<string, string> };
  })
  .onBeforeHandle(async ({ request, set }) => {
    const path = new URL(request.url).pathname;

    // Bypass rate limiting for public/health endpoints
    if (path === "/health" || path === "/metrics" || path.startsWith("/metrics")) {
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

    try {
      const ipResult = await checkLimit(ipKey, config.windowMs, config.maxRequests);
      const keyResult = keyBasedKey && keyLimit
        ? await checkLimit(keyBasedKey, keyLimit.windowMs, keyLimit.maxRequests)
        : null;

      const effectiveRemaining = keyResult
        ? Math.min(ipResult.remaining, keyResult.remaining)
        : ipResult.remaining;
      const effectiveLimit = keyLimit ? keyLimit.maxRequests : config.maxRequests;

      const headers: Record<string, string> = {
        "X-RateLimit-Limit": String(effectiveLimit),
        "X-RateLimit-Remaining": String(effectiveRemaining),
        "X-RateLimit-Reset": String(Math.ceil(
          (keyResult ? Math.min(ipResult.resetMs, keyResult.resetMs) : ipResult.resetMs) / 1000
        )),
      };

      if (!ipResult.allowed || (keyResult && !keyResult.allowed)) {
        set.status = 429;
        const retryAfter = keyLimit
          ? Math.ceil(keyLimit.windowMs / 1000)
          : Math.ceil(config.windowMs / 1000);
        headers["Retry-After"] = String(retryAfter);
        set.headers = headers;
        return { error: "Too many requests", retryAfter };
      }

      set.headers = headers;
    } catch {
      set.status = 429;
      set.headers = { "Retry-After": "60" };
      return { error: "Rate limiter unavailable", retryAfter: 60 };
    }
  });
