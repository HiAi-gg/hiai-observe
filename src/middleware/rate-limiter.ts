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

export const rateLimiterPlugin = new Elysia()
  .onBeforeHandle(async ({ request, set }) => {
    const path = new URL(request.url).pathname;
    const config = getLimitForPath(path);
    const clientIp = getClientIp(request);
    const key = `rl:${clientIp}:${path}`;

    try {
      const now = Date.now();
      const windowStart = now - config.windowMs;

      const multi = redis.multi();
      multi.zremrangebyscore(key, 0, windowStart);
      multi.zadd(key, now, `${now}:${Math.random()}`);
      multi.zcard(key);
      multi.pexpire(key, config.windowMs);

      const results = await multi.exec();
      const count = (results?.[2]?.[1] as number) ?? 0;

      if (count > config.maxRequests) {
        set.status = 429;
        const retryAfter = Math.ceil(config.windowMs / 1000);
        set.headers = { "Retry-After": String(retryAfter) };
        return {
          error: "Too many requests",
          retryAfter,
        };
      }
    } catch {
      // If Redis is down, reject requests (fail-closed)
      set.status = 429;
      set.headers = { "Retry-After": "60" };
      return {
        error: "Rate limiter unavailable",
        retryAfter: 60,
      };
    }
  });
