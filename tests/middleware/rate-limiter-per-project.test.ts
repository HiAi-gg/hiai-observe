/**
 * Tests for per-project rate limit overrides.
 *
 * The rate limiter applies a project-scoped limit on top of the existing
 * IP-based limit when the calling project has a custom `rateLimit`
 * configured. These tests exercise that code path by mocking
 * resolveProjectId and the projects-table lookup so we can flip a
 * project's rate limit on/off without touching the real DB.
 *
 * What we verify:
 *  - When a project has no override, behaviour is identical to global.
 *  - When a project has a custom override, the effective `X-RateLimit-Limit`
 *    header reflects the override.
 *  - The project-scoped Redis key is namespaced by projectId.
 *  - The cache is consulted before the DB (second request within 60s
 *    does not call the DB).
 *  - Cache can be invalidated (PUT /api/projects/:id/rate-limit path).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks MUST be declared before importing the SUT ─────────────────────
type ProjectRow = { rateLimit: number | null; rateLimitWindowMs: number | null };
const projectMap: Map<string, ProjectRow> = new Map();
let mockProjectIdResolver: (req: Request) => Promise<string | undefined> = async () => undefined;
let dbCallCount = 0;

vi.mock("../../src/middleware/auth.js", () => ({
  resolveProjectId: vi.fn(async (request: Request) => mockProjectIdResolver(request)),
  PUBLIC_PATHS: [],
  isPublicPath: () => false,
  authGuard: async () => undefined,
}));

vi.mock("../../src/store/db.js", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn((_cond: unknown) => ({
          limit: vi.fn(async () => {
            dbCallCount++;
            // Return rows for every project in the map. The rate limiter
            // calls .limit(1) so a single project per request is fine —
            // we honour that contract by returning the first match for
            // the currently-resolved project.
            for (const [id, row] of projectMap.entries()) {
              return [{ id, ...row }];
            }
            return [];
          }),
        })),
      })),
    })),
  },
}));

// Redis mock — same shape as the main rate-limiter test
// The rate limiter issues a 4-command pipeline (zremrangebyscore, zadd,
// zcard, pexpire). The mock must return a 4-element result tuple so the
// zcard result lands at index 2 — otherwise checkLimit() reads 0 and
// allows every request through. The helper `bucket(count)` builds the
// canonical 4-element response.
let mockExecResults: Array<Array<[null, unknown]>> = [];
let execCallCount = 0;
const redisCalls: string[] = [];

function bucket(count: number): Array<[null, unknown]> {
  return [
    [null, 0], // zremrangebyscore result
    [null, 1], // zadd result
    [null, count], // zcard result — this is what checkLimit reads
    [null, 1], // pexpire result
  ];
}

vi.mock("../../src/store/redis.js", () => ({
  redis: {
    multi: vi.fn(() => {
      const chain: Record<string, ReturnType<typeof vi.fn>> = {
        zremrangebyscore: vi.fn(function (this: unknown, key: string) {
          redisCalls.push(key);
          return this;
        }),
        zadd: vi.fn().mockReturnThis(),
        zcard: vi.fn().mockReturnThis(),
        pexpire: vi.fn().mockReturnThis(),
        exec: vi.fn(async () => {
          const results = mockExecResults[execCallCount] ?? bucket(0);
          execCallCount++;
          return results;
        }),
      };
      return chain;
    }),
  },
}));

const Elysia = (await import("elysia")).Elysia;
const { rateLimiterPlugin, invalidateProjectRateLimitCache, _clearProjectLimitCacheForTests } =
  await import("../../src/middleware/rate-limiter.js");

// ── Helpers ─────────────────────────────────────────────────────────────
function makeRequest(path: string, opts: { ip?: string; authHeader?: string } = {}): Request {
  const headers = new Headers();
  if (opts.authHeader) headers.set("authorization", opts.authHeader);
  const req = new Request(`http://localhost${path}`, { headers });
  if (opts.ip) {
    (req as unknown as { socket: { remoteAddress: string } }).socket = {
      remoteAddress: opts.ip,
    };
  }
  return req;
}

beforeEach(() => {
  projectMap.clear();
  mockProjectIdResolver = async () => undefined;
  mockExecResults = [];
  execCallCount = 0;
  redisCalls.length = 0;
  dbCallCount = 0;
  _clearProjectLimitCacheForTests();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ── Baseline: no project, no override — global limits apply ─────────────
describe("per-project rate limits — no override", () => {
  it("uses the global /api limit when no project is resolved", async () => {
    mockProjectIdResolver = async () => undefined;
    mockExecResults = [
      // ip check (no auth header -> only ip bucket)
      bucket(5),
    ];

    const app = new Elysia().use(rateLimiterPlugin).get("/api/issues", () => "ok");
    const res = await app.handle(makeRequest("/api/issues", { ip: "10.0.0.1" }));

    expect(res.status).toBe(200);
    // Global /api default is 100. The effective limit is whichever bucket
    // is most restrictive; with only the IP bucket in play, that's 100.
    expect(res.headers.get("X-RateLimit-Limit")).toBe("100");
  });
});

// ── Project override applied ────────────────────────────────────────────
describe("per-project rate limits — override applied", () => {
  it("uses the project override instead of the global /api limit", async () => {
    const projectId = "11111111-1111-1111-1111-111111111111";
    projectMap.set(projectId, { rateLimit: 250, rateLimitWindowMs: 30_000 });
    mockProjectIdResolver = async () => projectId;

    // Order: ip, key, project buckets
    // - IP: count=5 (under 100 default)
    // - key: count=10 (under 200 default)
    // - project: count=10 (under 250 override)
    mockExecResults = [bucket(5), bucket(10), bucket(10)];

    const app = new Elysia().use(rateLimiterPlugin).get("/api/issues", () => "ok");
    const res = await app.handle(
      makeRequest("/api/issues", { ip: "10.0.0.1", authHeader: "Bearer test-key" }),
    );

    expect(res.status).toBe(200);
    // Effective limit is the project override (250) — most restrictive bucket.
    expect(res.headers.get("X-RateLimit-Limit")).toBe("250");
  });

  it("falls back to 60s window when rateLimitWindowMs is null", async () => {
    const projectId = "22222222-2222-2222-2222-222222222222";
    projectMap.set(projectId, { rateLimit: 500, rateLimitWindowMs: null });
    mockProjectIdResolver = async () => projectId;

    mockExecResults = [bucket(1), bucket(1), bucket(1)];

    const app = new Elysia().use(rateLimiterPlugin).get("/api/issues", () => "ok");
    const res = await app.handle(
      makeRequest("/api/issues", { ip: "10.0.0.2", authHeader: "Bearer key" }),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("X-RateLimit-Limit")).toBe("500");
    // 60s default window -> reset header between 1 and 60 seconds
    const reset = Number(res.headers.get("X-RateLimit-Reset"));
    expect(reset).toBeGreaterThan(0);
    expect(reset).toBeLessThanOrEqual(60);
  });

  it("returns 429 when the project bucket is over its limit", async () => {
    const projectId = "33333333-3333-3333-3333-333333333333";
    projectMap.set(projectId, { rateLimit: 5, rateLimitWindowMs: 60_000 });
    mockProjectIdResolver = async () => projectId;

    // Order: ip-bucket, key-bucket (auth header is set), project-bucket.
    // - IP: count=1, under limit
    // - key: count=1, under limit
    // - project: count=6, OVER the project's 5-req limit
    mockExecResults = [bucket(1), bucket(1), bucket(6)];

    const app = new Elysia().use(rateLimiterPlugin).get("/api/issues", () => "ok");
    const res = await app.handle(
      makeRequest("/api/issues", { ip: "10.0.0.3", authHeader: "Bearer key" }),
    );

    expect(res.status).toBe(429);
    // Retry-After uses the project window (60s default)
    expect(res.headers.get("Retry-After")).toBe("60");
  });

  it("namespaces the project-scoped Redis key by projectId", async () => {
    const projectId = "44444444-4444-4444-4444-444444444444";
    projectMap.set(projectId, { rateLimit: 100, rateLimitWindowMs: 60_000 });
    mockProjectIdResolver = async () => projectId;

    // 3 buckets: ip, key, project
    mockExecResults = [bucket(1), bucket(1), bucket(1)];

    const app = new Elysia().use(rateLimiterPlugin).get("/api/issues", () => "ok");
    await app.handle(makeRequest("/api/issues", { ip: "10.0.0.4", authHeader: "Bearer key" }));

    // Three Redis calls per request: ip, key, project.
    // The project key must be namespaced with rl:proj:{projectId}: and
    // include the window size so changing the window produces a fresh
    // bucket.
    const projectKey = redisCalls.find((k) => k.startsWith(`rl:proj:${projectId}:`));
    expect(projectKey).toBeDefined();
    expect(projectKey).toContain("10.0.0.4");
    expect(projectKey).toContain("/api/issues");
    expect(projectKey).toContain(":60000");
  });
});

// ── Cache behaviour ─────────────────────────────────────────────────────
describe("per-project rate limit cache", () => {
  it("does not call the DB on the second request within 60s", async () => {
    const projectId = "55555555-5555-5555-5555-555555555555";
    projectMap.set(projectId, { rateLimit: 200, rateLimitWindowMs: 60_000 });
    mockProjectIdResolver = async () => projectId;

    // 6 Redis calls (3 per request × 2 requests): ip, key, project buckets
    mockExecResults = [bucket(1), bucket(1), bucket(1), bucket(2), bucket(2), bucket(2)];

    const app = new Elysia().use(rateLimiterPlugin).get("/api/issues", () => "ok");
    const req = () => makeRequest("/api/issues", { ip: "10.0.0.5", authHeader: "Bearer key" });

    await app.handle(req());
    const callsAfterFirst = dbCallCount;
    expect(callsAfterFirst).toBe(1);

    await app.handle(req());
    // Second request hits the cache, no new DB call
    expect(dbCallCount).toBe(callsAfterFirst);
  });

  it("invalidateProjectRateLimitCache forces a fresh DB lookup", async () => {
    const projectId = "66666666-6666-6666-6666-666666666666";
    projectMap.set(projectId, { rateLimit: 200, rateLimitWindowMs: 60_000 });
    mockProjectIdResolver = async () => projectId;

    mockExecResults = [bucket(1), bucket(1), bucket(1), bucket(1), bucket(1), bucket(1)];

    const app = new Elysia().use(rateLimiterPlugin).get("/api/issues", () => "ok");
    const req = () => makeRequest("/api/issues", { ip: "10.0.0.6", authHeader: "Bearer key" });

    await app.handle(req());
    expect(dbCallCount).toBe(1);

    invalidateProjectRateLimitCache(projectId);
    await app.handle(req());
    expect(dbCallCount).toBe(2);
  });
});

// ── DB error: fall back to global default (no self-DOS) ────────────────
describe("per-project rate limits — DB error fallback", () => {
  it("falls back to the global default when no project override is set", async () => {
    // The resolver returns a project id that has no row in projectMap
    // (mock returns []). The middleware treats this as "no override" and
    // uses the path-based default. With an auth header, the effective
    // limit is the key-based default for /api (200 req/60s), since the
    // key bucket is the tightest when no project override is in play.
    mockProjectIdResolver = async () => "99999999-9999-9999-9999-999999999999";
    mockExecResults = [bucket(1), bucket(1)];

    const app = new Elysia().use(rateLimiterPlugin).get("/api/issues", () => "ok");
    const res = await app.handle(
      makeRequest("/api/issues", { ip: "10.0.0.7", authHeader: "Bearer key" }),
    );

    expect(res.status).toBe(200);
    // No override found -> key limit (200) is the effective limit, since
    // we are sending an auth header. Without the auth header, the global
    // ip limit (100) would apply.
    expect(res.headers.get("X-RateLimit-Limit")).toBe("200");
  });

  it("uses the global ip limit (100) when no override and no auth header", async () => {
    mockProjectIdResolver = async () => "99999999-9999-9999-9999-999999999999";
    mockExecResults = [bucket(1)];

    const app = new Elysia().use(rateLimiterPlugin).get("/api/issues", () => "ok");
    const res = await app.handle(makeRequest("/api/issues", { ip: "10.0.0.8" }));

    expect(res.status).toBe(200);
    // No override + no auth -> global ip limit (100) is effective
    expect(res.headers.get("X-RateLimit-Limit")).toBe("100");
  });
});
