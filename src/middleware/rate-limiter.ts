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

const PROJECT_RATE_LIMIT = Number(process.env.RATE_LIMIT_PROJECT_DEFAULT) || 1000;

function getLimitForPath(path: string): RateLimitConfig {
  for (const [pattern, config] of Object.entries(DEFAULT_LIMITS)) {
    if (path.startsWith(pattern.replace(/\/:(\w+)/g, ""))) {
      return config;
    }
  }
  return { windowMs: 60_000, maxRequests: 100 };
}

function getClientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
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
  .derive(({ request }) => {
    return { rateLimitHeaders: {} as Record<string, string> };
  })
  .onBeforeHandle(async ({ request, set }) => {
    const path = new URL(request.url).pathname;
    const config = getLimitForPath(path);
    const clientIp = getClientIp(request);

    // IP-based rate limit
    const ipKey = `rl:ip:${clientIp}:${path}`;
    try {
      const ipResult = await checkLimit(ipKey, config.windowMs, config.maxRequests);

      // Set standard rate limit headers
      const headers: Record<string, string> = {
        "X-RateLimit-Limit": String(config.maxRequests),
        "X-RateLimit-Remaining": String(ipResult.remaining),
        "X-RateLimit-Reset": String(Math.ceil(ipResult.resetMs / 1000)),
      };

      if (!ipResult.allowed) {
        set.status = 429;
        const retryAfter = Math.ceil(config.windowMs / 1000);
        headers["Retry-After"] = String(retryAfter);
        set.headers = headers;
        return { error: "Too many requests", retryAfter };
      }

      set.headers = headers;
    } catch {
      // If Redis is down, reject requests (fail-closed)
      set.status = 429;
      set.headers = { "Retry-After": "60" };
      return { error: "Rate limiter unavailable", retryAfter: 60 };
    }
  });
