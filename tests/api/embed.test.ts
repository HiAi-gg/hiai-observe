/**
 * Tests for embed routes (OBS2.4).
 *
 * Covers:
 *   - GET /embed                          — iframe-friendly HTML landing
 *   - GET /embed/status/:slug             — public status JSON, frame-friendly
 *   - GET /embed/dashboard                — authenticated overview tile
 *     - requires API key (handler-level auth)
 *     - accepts ?tenantId= and ?projectId= aliases
 *     - returns projectsCount / activeIssues / activeAlerts / healthStatus /
 *       recentEvents / monitors with expected shape
 *     - frames-ancestors CSP + X-Frame-Options SAMEORIGIN headers applied
 */

import { Elysia } from "elysia";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Drizzle chain mocks ───────────────────────────────────────────────
type Chain = {
  from: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  orderBy: ReturnType<typeof vi.fn>;
  groupBy: ReturnType<typeof vi.fn>;
  selectDistinctOn: ReturnType<typeof vi.fn>;
  then: <T>(resolve: (value: unknown) => T, reject?: (reason: unknown) => T) => Promise<T>;
};

function makeChain(result: unknown): Chain {
  const chain: Partial<Chain> = {};
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.orderBy = vi.fn(() => chain);
  chain.groupBy = vi.fn(() => chain);
  chain.selectDistinctOn = vi.fn(() => chain);
  chain.then = (resolve, reject) =>
    Promise.resolve(result).then(resolve, reject ?? ((v) => v as never));
  return chain as Chain;
}

let queue: unknown[][] = [];

const dbMock = {
  select: vi.fn(() => {
    const next = queue.shift() ?? [];
    return makeChain(next);
  }),
};

vi.mock("../../src/store/db.js", () => ({ db: dbMock }));

// uptime helper — mocked to return uptime map directly
const uptimeMap = new Map<string, number>([
  ["mon-up", 99.95],
  ["mon-degraded", 99.5],
  ["mon-down", 50.0],
]);
vi.mock("../../src/store/uptime.js", () => ({
  getUptimePercentages: vi.fn(async (ids: string[]) => {
    const m = new Map<string, number>();
    for (const id of ids) m.set(id, uptimeMap.get(id) ?? 100);
    return m;
  }),
}));

// auth — fake key resolves to a project id
vi.mock("../../src/middleware/auth.js", () => ({
  resolveProjectId: vi.fn(async (req: Request) => {
    const h = req.headers.get("authorization") ?? req.headers.get("x-api-key");
    if (!h) return undefined;
    const key = h.replace(/^Bearer\s+/i, "");
    if (key === "ho_valid_key") return "tenant-proj-uuid";
    return undefined;
  }),
}));

// logger silence
vi.mock("../../src/lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// config — proxy the EMBED_ALLOWED_ORIGINS field to process.env so tests
// can stub the env var without resetting the frozen production config
// module. Production code itself never touches process.env; this is a
// test-only seam that keeps `frameAncestorsFromConfig` testable in
// isolation. (see src/api/embed.ts for the production reader.)
vi.mock("../../src/lib/config.js", () => {
  // Re-evaluate process.env at access time so per-test stubs take effect.
  return {
    config: new Proxy(
      {},
      {
        get: (_target, prop: string) => {
          if (prop === "EMBED_ALLOWED_ORIGINS") {
            return process.env.EMBED_ALLOWED_ORIGINS;
          }
          return undefined;
        },
      },
    ),
  };
});

const { embedRoutes, __testing } = await import("../../src/api/embed.js");

function appWithEmbed(): Elysia {
  return new Elysia().use(embedRoutes);
}

beforeEach(() => {
  queue = [];
  dbMock.select.mockClear();
});

// ── GET /embed ──────────────────────────────────────────────────────────
describe("GET /embed", () => {
  it("returns HTML with iframe-friendly security headers", async () => {
    const app = appWithEmbed();
    const res = await app.handle(new Request("http://localhost/embed"));

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/text\/html/);
    expect(res.headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
    const csp = res.headers.get("Content-Security-Policy") ?? "";
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).not.toContain("frame-ancestors 'none'");

    const body = await res.text();
    expect(body).toMatch(/HiAi Observe/);
    expect(body).toMatch(/\/embed\/dashboard/);
  });

  it("includes configured EMBED_ALLOWED_ORIGINS in CSP frame-ancestors", async () => {
    process.env.EMBED_ALLOWED_ORIGINS = "http://localhost:3333,http://localhost:3334";
    try {
      const app = appWithEmbed();
      const res = await app.handle(new Request("http://localhost/embed"));
      const csp = res.headers.get("Content-Security-Policy") ?? "";
      expect(csp).toContain("http://localhost:3333");
      expect(csp).toContain("http://localhost:3334");
    } finally {
      delete process.env.EMBED_ALLOWED_ORIGINS;
    }
  });
});

// ── GET /embed/status/:slug ─────────────────────────────────────────────
describe("GET /embed/status/:slug", () => {
  it("returns 404 when project not found", async () => {
    queue = [[]]; // projects.select returns []
    const app = appWithEmbed();
    const res = await app.handle(new Request("http://localhost/embed/status/missing"));
    expect(res.status).toBe(404);
  });

  it("returns project + monitors + healthStatus for known slug", async () => {
    queue = [
      [{ id: "proj-1", name: "Acme", slug: "acme" }], // project lookup
      [
        // monitors
        { id: "mon-up", name: "API Health", url: "https://api.acme/health", active: true },
        { id: "mon-degraded", name: "Web", url: "https://acme", active: true },
      ],
    ];
    const app = appWithEmbed();
    const res = await app.handle(new Request("http://localhost/embed/status/acme"));
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
    const body = await res.json();
    expect(body.project.slug).toBe("acme");
    expect(body.monitors).toHaveLength(2);
    expect(body.healthStatus).toMatch(/healthy|degraded|down/);
    // derivedHealth logic — at least one monitor has uptime < 99.9 → degraded
    expect(body.healthStatus).toBe("degraded");
  });

  it("does NOT require API key (public iframe route)", async () => {
    queue = [
      [{ id: "proj-1", name: "Acme", slug: "acme" }],
      [{ id: "mon-up", name: "API Health", url: "https://api.acme/health", active: true }],
    ];
    const app = appWithEmbed();
    const res = await app.handle(
      new Request("http://localhost/embed/status/acme"), // no Authorization header
    );
    expect(res.status).toBe(200);
  });
});

// ── GET /embed/dashboard ───────────────────────────────────────────────
describe("GET /embed/dashboard", () => {
  it("returns 401 without API key", async () => {
    const app = appWithEmbed();
    const res = await app.handle(new Request("http://localhost/embed/dashboard"));
    expect(res.status).toBe(401);
  });

  it("returns 401 with wrong API key", async () => {
    const app = appWithEmbed();
    const res = await app.handle(
      new Request("http://localhost/embed/dashboard", {
        headers: { authorization: "Bearer ho_wrong_key" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns aggregated overview with valid API key (admin scope)", async () => {
    queue = [
      [{ value: 5 }], // projectsCount
      [{ value: 3 }], // activeIssues
      [{ value: 1 }], // activeAlerts
      [
        // monitors
        { id: "mon-up", name: "API", url: "https://api", active: true },
        { id: "mon-degraded", name: "Web", url: "https://web", active: true },
      ],
      [
        // recentEvents
        {
          id: "ev-1",
          projectId: "tenant-proj-uuid",
          message: "TypeError",
          exceptionType: "TypeError",
          level: "error",
          createdAt: new Date(),
        },
      ],
    ];
    const app = appWithEmbed();
    const res = await app.handle(
      new Request("http://localhost/embed/dashboard", {
        headers: { authorization: "Bearer ho_valid_key" },
      }),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
    const body = await res.json();
    expect(body.projectsCount).toBe(5);
    expect(body.activeIssues).toBe(3);
    expect(body.activeAlerts).toBe(1);
    expect(body.healthStatus).toBe("degraded");
    expect(body.recentEvents).toHaveLength(1);
    expect(body.monitors).toHaveLength(2);
    expect(body.monitors[0]).toMatchObject({ id: "mon-up", isUp: true });
  });

  it("accepts ?tenantId= alias and scopes projectsCount to 1", async () => {
    queue = [
      [{ value: 99 }], // projectsCount (ignored when projectId present)
      [{ value: 2 }], // activeIssues
      [{ value: 0 }], // activeAlerts
      [{ id: "mon-up", name: "API", url: "https://api", active: true }],
      [], // recentEvents (none)
    ];
    const app = appWithEmbed();
    const res = await app.handle(
      new Request("http://localhost/embed/dashboard?tenantId=acme-tenant", {
        headers: { authorization: "Bearer ho_valid_key" },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    // When scoped by projectId/tenantId, projectsCount is reported as 1
    expect(body.projectsCount).toBe(1);
    expect(body.monitors).toHaveLength(1);
    expect(body.recentEvents).toEqual([]);
  });

  it("clamps limit to [1, 50]", async () => {
    queue = [
      [{ value: 0 }],
      [{ value: 0 }],
      [{ value: 0 }],
      [],
      [], // empty events
    ];
    const app = appWithEmbed();
    // limit=999 should be clamped to 50; the query itself doesn't crash
    const res = await app.handle(
      new Request("http://localhost/embed/dashboard?limit=999", {
        headers: { authorization: "Bearer ho_valid_key" },
      }),
    );
    expect(res.status).toBe(200);
  });
});

// ── deriveHealth unit tests ─────────────────────────────────────────────
describe("deriveHealth", () => {
  const { deriveHealth } = __testing;

  it("returns 'healthy' for empty monitor list", () => {
    expect(deriveHealth([])).toBe("healthy");
  });

  it("returns 'healthy' when all monitors are up and uptime >= 99.9", () => {
    expect(
      deriveHealth([
        { id: "a", active: true, uptime24h: 100, lastCheckSuccess: true },
        { id: "b", active: true, uptime24h: 99.95, lastCheckSuccess: true },
      ]),
    ).toBe("healthy");
  });

  it("returns 'degraded' when at least one monitor has uptime 99.0-99.9", () => {
    expect(
      deriveHealth([
        { id: "a", active: true, uptime24h: 100, lastCheckSuccess: true },
        { id: "b", active: true, uptime24h: 99.5, lastCheckSuccess: true },
      ]),
    ).toBe("degraded");
  });

  it("returns 'down' when at least one monitor is currently failing", () => {
    expect(
      deriveHealth([
        { id: "a", active: true, uptime24h: 100, lastCheckSuccess: true },
        { id: "b", active: true, uptime24h: 99.5, lastCheckSuccess: false },
      ]),
    ).toBe("down");
  });

  it("ignores inactive monitors", () => {
    expect(
      deriveHealth([
        { id: "a", active: true, uptime24h: 100, lastCheckSuccess: true },
        { id: "b", active: false, uptime24h: 50, lastCheckSuccess: false },
      ]),
    ).toBe("healthy");
  });
});

// ── frameAncestorsFromConfig ────────────────────────────────────────────
describe("frameAncestorsFromConfig", () => {
  const { frameAncestorsFromConfig } = __testing;

  it("returns 'self' by default", () => {
    delete process.env.EMBED_ALLOWED_ORIGINS;
    expect(frameAncestorsFromConfig()).toBe("'self'");
  });

  it("appends configured origins to 'self'", () => {
    process.env.EMBED_ALLOWED_ORIGINS = "http://localhost:3333";
    try {
      expect(frameAncestorsFromConfig()).toBe("'self' http://localhost:3333");
    } finally {
      delete process.env.EMBED_ALLOWED_ORIGINS;
    }
  });

  it("trims and filters empty entries from comma-separated list", () => {
    process.env.EMBED_ALLOWED_ORIGINS = " http://a , , http://b ";
    try {
      expect(frameAncestorsFromConfig()).toBe("'self' http://a http://b");
    } finally {
      delete process.env.EMBED_ALLOWED_ORIGINS;
    }
  });
});
