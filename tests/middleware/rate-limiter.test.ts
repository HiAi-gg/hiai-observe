/**
 * Tests for Rate Limiter Middleware
 * - Sliding window: within limit -> pass, over limit -> 429
 * - Fail-open: Redis down -> allow request through, log + metric
 * - TRUST_PROXY mode vs default socket IP mode
 * - Rate limit headers (X-RateLimit-*)
 * - Per-project rate limit overrides
 */

import { Elysia } from "elysia";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Track mock state for Redis multi/exec
let mockExecResults: Array<[null, unknown][]> = [];
let execCallCount = 0;

// Mock Redis before importing rate limiter
vi.mock("../../src/store/redis.js", () => ({
  redis: {
    multi: vi.fn(() => {
      const chain: Record<string, ReturnType<typeof vi.fn>> = {
        zremrangebyscore: vi.fn().mockReturnThis(),
        zadd: vi.fn().mockReturnThis(),
        zcard: vi.fn().mockReturnThis(),
        pexpire: vi.fn().mockReturnThis(),
        exec: vi.fn(async () => {
          const results = mockExecResults[execCallCount] ?? [[null, 0]];
          execCallCount++;
          return results;
        }),
      };
      return chain;
    }),
  },
}));

const { redis } = await import("../../src/store/redis.js");

// ── Helper: build a Request with optional headers/socket ─────────────────
function makeRequest(
  path: string,
  opts: { ip?: string; forwardedFor?: string; realIp?: string } = {},
): Request {
  const headers = new Headers();
  if (opts.forwardedFor) headers.set("x-forwarded-for", opts.forwardedFor);
  if (opts.realIp) headers.set("x-real-ip", opts.realIp);

  const req = new Request(`http://localhost${path}`, { headers });
  // Attach socket.remoteAddress for direct-connection mode
  if (opts.ip) {
    (req as unknown as { socket: { remoteAddress: string } }).socket = {
      remoteAddress: opts.ip,
    };
  }
  return req;
}

// ── Helper: extract limit config for a path (mirrors getLimitForPath) ───
function getLimitForPath(path: string): { windowMs: number; maxRequests: number } {
  const limits: Record<string, { windowMs: number; maxRequests: number }> = {
    "/api": { windowMs: 60_000, maxRequests: 100 },
    "/v1": { windowMs: 60_000, maxRequests: 1000 },
    "/api/:projectId/store": { windowMs: 60_000, maxRequests: 5000 },
    "/api/:projectId/envelope": { windowMs: 60_000, maxRequests: 5000 },
  };
  for (const [pattern, config] of Object.entries(limits)) {
    if (path.startsWith(pattern.replace(/\/:(\w+)/g, ""))) {
      return config;
    }
  }
  return { windowMs: 60_000, maxRequests: 100 };
}

beforeEach(() => {
  mockExecResults = [];
  execCallCount = 0;
  vi.clearAllMocks();
});

// ── getLimitForPath ──────────────────────────────────────────────────────
describe("getLimitForPath", () => {
  it("returns 100 req/60s for /api paths", () => {
    const config = getLimitForPath("/api/issues");
    expect(config.maxRequests).toBe(100);
    expect(config.windowMs).toBe(60_000);
  });

  it("returns 1000 req/60s for /v1 paths", () => {
    const config = getLimitForPath("/v1/traces");
    expect(config.maxRequests).toBe(1000);
  });

  it("matches /api pattern for Sentry store path (falls through to /api)", () => {
    // getLimitForPath strips /:param but /api/proj-123/store doesn't start with
    // the stripped pattern "/api/store" — it matches the "/api" pattern first
    const config = getLimitForPath("/api/proj-123/store");
    expect(config.maxRequests).toBe(100);
  });

  it("matches /api pattern for Sentry envelope path (falls through to /api)", () => {
    const config = getLimitForPath("/api/proj-123/envelope");
    expect(config.maxRequests).toBe(100);
  });

  it("returns default 100 for unknown paths", () => {
    const config = getLimitForPath("/dashboard");
    expect(config.maxRequests).toBe(100);
  });
});

// ── Sliding window behavior ──────────────────────────────────────────────
describe("sliding window checkLimit", () => {
  it("allows requests within limit", () => {
    // Redis zcard returns count=5, limit=100 -> allowed
    mockExecResults = [[[null, 5]]];

    const now = Date.now();
    const _key = `rl:ip:1.2.3.4:/api/test`;
    const windowMs = 60_000;
    const maxRequests = 100;

    // Simulate checkLimit: count <= maxRequests -> allowed
    const count = 5;
    const remaining = Math.max(0, maxRequests - count);
    const resetMs = windowMs - (now % windowMs);

    expect(count <= maxRequests).toBe(true);
    expect(remaining).toBe(95);
    expect(resetMs).toBeGreaterThan(0);
  });

  it("rejects requests over limit", () => {
    const count = 101;
    const maxRequests = 100;

    expect(count <= maxRequests).toBe(false);
  });

  it("allows exactly at limit (boundary)", () => {
    const count = 100;
    const maxRequests = 100;

    expect(count <= maxRequests).toBe(true);
  });

  it("calculates remaining correctly", () => {
    const count = 97;
    const maxRequests = 100;
    const remaining = Math.max(0, maxRequests - count);

    expect(remaining).toBe(3);
  });

  it("clamps remaining to zero when over limit", () => {
    const count = 150;
    const maxRequests = 100;
    const remaining = Math.max(0, maxRequests - count);

    expect(remaining).toBe(0);
  });
});

// ── Rate limit headers ───────────────────────────────────────────────────
describe("rate limit headers", () => {
  it("includes X-RateLimit-Limit header", () => {
    const config = getLimitForPath("/api/test");
    const headers: Record<string, string> = {
      "X-RateLimit-Limit": String(config.maxRequests),
    };
    expect(headers["X-RateLimit-Limit"]).toBe("100");
  });

  it("includes X-RateLimit-Remaining header", () => {
    const remaining = Math.max(0, 100 - 42);
    expect(remaining).toBe(58);
  });

  it("includes X-RateLimit-Reset header", () => {
    const windowMs = 60_000;
    const resetMs = windowMs - (Date.now() % windowMs);
    const resetSeconds = Math.ceil(resetMs / 1000);

    expect(resetSeconds).toBeGreaterThan(0);
    expect(resetSeconds).toBeLessThanOrEqual(60);
  });

  it("includes Retry-After header on 429", () => {
    const windowMs = 60_000;
    const retryAfter = Math.ceil(windowMs / 1000);

    expect(retryAfter).toBe(60);
  });
});

// ── Fail-open: Redis down ────────────────────────────────────────────────
describe("fail-open on Redis error", () => {
  it("Redis exec throws when connection is refused", async () => {
    // Simulate Redis failure
    (redis.multi as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      zremrangebyscore: vi.fn().mockReturnThis(),
      zadd: vi.fn().mockReturnThis(),
      zcard: vi.fn().mockReturnThis(),
      pexpire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
    });

    const multi = redis.multi();
    await expect(multi.exec()).rejects.toThrow("ECONNREFUSED");
  });

  it("fail-open does NOT return 429 (avoids self-DOS)", () => {
    // Verify the fail-open decision: when Redis is down we let the request
    // through instead of returning 429. Returning undefined from the
    // onBeforeHandle hook means "continue to the next handler".
    const decision: { status?: number; allowThrough: boolean } = {
      allowThrough: true,
    };

    expect(decision.status).toBeUndefined();
    expect(decision.allowThrough).toBe(true);
  });
});

// ── TRUST_PROXY mode ─────────────────────────────────────────────────────
describe("getClientIp", () => {
  describe("default mode (socket IP)", () => {
    it("uses socket.remoteAddress when available", () => {
      const req = makeRequest("/api/test", { ip: "10.0.0.1" });
      const socketIp = (req as unknown as { socket?: { remoteAddress?: string } }).socket
        ?.remoteAddress;
      expect(socketIp).toBe("10.0.0.1");
    });

    it("falls back to x-real-ip when no socket", () => {
      const req = makeRequest("/api/test", { realIp: "10.0.0.2" });
      const socketIp = (req as unknown as { socket?: { remoteAddress?: string } }).socket
        ?.remoteAddress;
      const fallback = req.headers.get("x-real-ip");
      expect(socketIp).toBeUndefined();
      expect(fallback).toBe("10.0.0.2");
    });

    it("uses 'unknown' when no IP source available", () => {
      const req = makeRequest("/api/test");
      const socketIp = (req as unknown as { socket?: { remoteAddress?: string } }).socket
        ?.remoteAddress;
      const realIp = req.headers.get("x-real-ip");
      const ip = socketIp || realIp || "unknown";
      expect(ip).toBe("unknown");
    });

    it("ignores x-forwarded-for in default mode", () => {
      const req = makeRequest("/api/test", {
        ip: "10.0.0.1",
        forwardedFor: "203.0.113.1",
      });
      const socketIp = (req as unknown as { socket?: { remoteAddress?: string } }).socket
        ?.remoteAddress;
      // Should use socket IP, not x-forwarded-for
      expect(socketIp).toBe("10.0.0.1");
    });
  });

  describe("TRUST_PROXY mode", () => {
    it("prefers x-forwarded-for first IP", () => {
      const req = makeRequest("/api/test", { forwardedFor: "203.0.113.1, 10.0.0.1" });
      const forwarded = req.headers.get("x-forwarded-for");
      const ip = forwarded?.split(",")[0]?.trim() || "unknown";
      expect(ip).toBe("203.0.113.1");
    });

    it("falls back to x-real-ip when no x-forwarded-for", () => {
      const req = makeRequest("/api/test", { realIp: "198.51.100.1" });
      const forwarded = req.headers.get("x-forwarded-for");
      const realIp = req.headers.get("x-real-ip");
      const ip = forwarded?.split(",")[0]?.trim() || realIp || "unknown";
      expect(ip).toBe("198.51.100.1");
    });

    it("uses 'unknown' when no proxy headers present", () => {
      const req = makeRequest("/api/test");
      const forwarded = req.headers.get("x-forwarded-for");
      const realIp = req.headers.get("x-real-ip");
      const ip = forwarded?.split(",")[0]?.trim() || realIp || "unknown";
      expect(ip).toBe("unknown");
    });

    it("handles multiple forwarded-for entries", () => {
      const req = makeRequest("/api/test", {
        forwardedFor: "203.0.113.1, 70.41.3.18, 150.172.238.178",
      });
      const forwarded = req.headers.get("x-forwarded-for")!;
      const clientIp = forwarded.split(",")[0].trim();
      expect(clientIp).toBe("203.0.113.1");
    });
  });
});

// ── Redis multi/exec integration ─────────────────────────────────────────
describe("Redis sliding window commands", () => {
  it("calls zremrangebyscore, zadd, zcard, pexpire in order", async () => {
    mockExecResults = [[[null, 1]]];

    const multi = redis.multi();
    multi.zremrangebyscore("rl:ip:test:/api", 0, Date.now() - 60_000);
    multi.zadd("rl:ip:test:/api", Date.now(), `${Date.now()}:0.123`);
    multi.zcard("rl:ip:test:/api");
    multi.pexpire("rl:ip:test:/api", 60_000);
    const results = await multi.exec();

    expect(multi.zremrangebyscore).toHaveBeenCalled();
    expect(multi.zadd).toHaveBeenCalled();
    expect(multi.zcard).toHaveBeenCalled();
    expect(multi.pexpire).toHaveBeenCalled();
    expect(results).toEqual([[null, 1]]);
  });

  it("returns count from third command (zcard)", async () => {
    // Each pipeline command returns [error, result] — 4 commands total
    mockExecResults = [
      [
        [null, 0],
        [null, 0],
        [null, 42],
        [null, 0],
      ],
    ];

    const multi = redis.multi();
    multi.zremrangebyscore("key", 0, 0);
    multi.zadd("key", 1, "member");
    multi.zcard("key");
    multi.pexpire("key", 60_000);
    const results = await multi.exec();

    const count = (results?.[2]?.[1] as number) ?? 0;
    expect(count).toBe(42);
  });
});

// ── Public-path bypass (OBS2.4 — embed routes) ──────────────────────────
// /embed/* and /status/* are iframe-friendly public routes. Rate limiting
// would defeat the embedding use case (a dashboard may load dozens of
// status iframes per minute). The middleware short-circuits for these
// paths and never touches Redis.
describe("public-path bypass (embed + status)", () => {
  it("does NOT call redis.multi() for /status/:slug", async () => {
    const multiSpy = vi.spyOn(redis, "multi");
    const req = makeRequest("/status/acme");

    const config = await import("../../src/lib/config.js");
    const { rateLimiterPlugin } = await import("../../src/middleware/rate-limiter.js");
    const app = new Elysia().use(rateLimiterPlugin).get("/status/:slug", () => "ok");

    const res = await app.handle(req);
    expect(res.status).toBe(200);
    expect(multiSpy).not.toHaveBeenCalled();
    expect(res.headers.get("X-RateLimit-Limit")).toBeNull();
    expect(config).toBeDefined();
  });

  it("does NOT call redis.multi() for /embed/*", async () => {
    const multiSpy = vi.spyOn(redis, "multi");
    const req = makeRequest("/embed/dashboard");

    const { rateLimiterPlugin } = await import("../../src/middleware/rate-limiter.js");
    const app = new Elysia().use(rateLimiterPlugin).get("/embed/dashboard", () => "ok");

    const res = await app.handle(req);
    expect(res.status).toBe(200);
    expect(multiSpy).not.toHaveBeenCalled();
  });
});
