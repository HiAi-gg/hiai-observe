/**
 * Tests for /api/releases (Releases CRUD + Health).
 *
 * Releases track deployments. The health endpoint aggregates new-issue
 * count and error rate from the release deploy time forward to derive a
 * green/yellow/red health score.
 * Routes:
 *   GET    /api/releases/                — list releases
 *   GET    /api/releases/:id             — single release
 *   POST   /api/releases/                — create release (returns 201)
 *   PUT    /api/releases/:id             — update version/environment/deployedAt
 *   GET    /api/releases/:id/health      — release health aggregation
 *   DELETE /api/releases/:id             — delete release
 *
 * Coverage:
 *   - Happy path: full CRUD
 *   - Health: green/yellow/red derived from newIssuesRate threshold
 *   - Validation: environment must be one of production/staging/development
 *   - 201 on create, 200 on update/get/delete
 *   - 404 for missing release
 *   - 401 without API key
 *   - Pagination: limit/offset
 */

import { Elysia } from "elysia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const RELEASE_ID = "550e8400-e29b-41d4-a716-446655440000";
const PROJECT_ID = "660e8400-e29b-41d4-a716-446655440001";

const mockRelease = {
  id: RELEASE_ID,
  projectId: PROJECT_ID,
  version: "1.2.3",
  environment: "production",
  deployedAt: new Date("2026-06-20T00:00:00Z"),
  createdAt: new Date("2026-06-20"),
};

function createChain(result: any) {
  const chain: any = {};
  for (const m of [
    "from",
    "where",
    "orderBy",
    "limit",
    "offset",
    "returning",
    "set",
    "values",
    "delete",
    "groupBy",
  ]) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.then = (resolve: Function, reject?: Function) =>
    Promise.resolve(result).then(resolve, reject);
  return chain;
}

let queue: any[][] = [];
const dbMock = {
  select: vi.fn(() => {
    const next = queue.shift() ?? [];
    return createChain(next);
  }),
  insert: vi.fn(() => createChain([mockRelease])),
  update: vi.fn(() => createChain([mockRelease])),
  delete: vi.fn(() => createChain(undefined)),
};

vi.mock("../../src/store/db.js", () => ({ db: dbMock }));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col: any, val: any) => ({ col, val, op: "eq" })),
  and: vi.fn((...args: any[]) => ({ args, op: "and" })),
  desc: vi.fn((col: any) => ({ col, op: "desc" })),
  count: vi.fn(() => ({ op: "count" })),
  gte: vi.fn((col: any, val: any) => ({ col, val, op: "gte" })),
}));

vi.mock("../../src/lib/auth.js", () => ({
  resolveApiKey: vi.fn(() => null),
  lookupProject: vi.fn(async () => null),
}));

vi.mock("../../src/lib/rbac.js", () => ({
  checkWriteAccess: vi.fn(async () => true),
}));

vi.mock("../../src/middleware/auth.js", async () => {
  const actual = await vi.importActual<any>("../../src/middleware/auth.js");
  return actual;
});

vi.mock("../../src/lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { releasesRoutes } = await import("../../src/api/releases.js");
const { authGuard } = await import("../../src/middleware/auth.js");

function appWithAuth(): Elysia {
  return new Elysia().onBeforeHandle(authGuard).use(releasesRoutes);
}

beforeEach(() => {
  queue = [];
  dbMock.select.mockClear();
  dbMock.insert.mockClear();
  dbMock.update.mockClear();
  dbMock.delete.mockClear();
});

// ── Auth rejection ───────────────────────────────────────────────────
describe("releases API (auth)", () => {
  it("returns 401 on GET without API key", async () => {
    const app = appWithAuth();
    const res = await app.handle(new Request("http://localhost/api/releases/"));
    expect(res.status).toBe(401);
  });

  it("returns 401 on PUT without API key", async () => {
    const app = appWithAuth();
    const res = await app.handle(
      new Request(`http://localhost/api/releases/${RELEASE_ID}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: "1.2.4" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 on GET /:id/health without API key", async () => {
    const app = appWithAuth();
    const res = await app.handle(new Request(`http://localhost/api/releases/${RELEASE_ID}/health`));
    expect(res.status).toBe(401);
  });
});

// ── POST /api/releases/ (create) ─────────────────────────────────────
describe("POST /api/releases/", () => {
  it("creates a release and returns 201", async () => {
    const res = await releasesRoutes.handle(
      new Request("http://localhost/api/releases/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: PROJECT_ID,
          version: "1.2.3",
        }),
      }),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe(RELEASE_ID);
    expect(body.version).toBe("1.2.3");
    expect(dbMock.insert).toHaveBeenCalledTimes(1);
  });

  it("accepts environment and deployedAt", async () => {
    const res = await releasesRoutes.handle(
      new Request("http://localhost/api/releases/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: PROJECT_ID,
          version: "1.0.0",
          environment: "staging",
          deployedAt: "2026-06-20T00:00:00Z",
        }),
      }),
    );
    expect(res.status).toBe(201);
  });

  it("returns 422 for missing required fields", async () => {
    const res = await releasesRoutes.handle(
      new Request("http://localhost/api/releases/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: PROJECT_ID }),
      }),
    );
    expect(res.status).toBe(422);
  });

  it("returns 422 for invalid environment value", async () => {
    const res = await releasesRoutes.handle(
      new Request("http://localhost/api/releases/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: PROJECT_ID,
          version: "1.0.0",
          environment: "qa", // not in allowed enum
        }),
      }),
    );
    expect(res.status).toBe(422);
  });
});

// ── GET /api/releases/ (list) ────────────────────────────────────────
describe("GET /api/releases/", () => {
  it("returns paginated releases with default limit=50", async () => {
    queue = [[mockRelease], [{ total: 1 }]];
    const res = await releasesRoutes.handle(
      new Request(`http://localhost/api/releases/?projectId=${PROJECT_ID}`),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(RELEASE_ID);
    expect(body.total).toBe(1);
    expect(body.limit).toBe(50);
    expect(body.offset).toBe(0);
  });

  it("respects limit and offset", async () => {
    queue = [[mockRelease], [{ total: 100 }]];
    const res = await releasesRoutes.handle(
      new Request("http://localhost/api/releases/?limit=25&offset=10"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.limit).toBe(25);
    expect(body.offset).toBe(10);
    expect(body.total).toBe(100);
  });

  it("filters by environment", async () => {
    queue = [[mockRelease], [{ total: 1 }]];
    const res = await releasesRoutes.handle(
      new Request("http://localhost/api/releases/?environment=production"),
    );
    expect(res.status).toBe(200);
  });
});

// ── GET /api/releases/:id ────────────────────────────────────────────
describe("GET /api/releases/:id", () => {
  it("returns the release", async () => {
    queue = [[mockRelease]];
    const res = await releasesRoutes.handle(
      new Request(`http://localhost/api/releases/${RELEASE_ID}`),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(RELEASE_ID);
    expect(body.version).toBe("1.2.3");
  });

  it("returns 404 when not found", async () => {
    queue = [[]];
    const res = await releasesRoutes.handle(
      new Request(`http://localhost/api/releases/${RELEASE_ID}`),
    );
    expect(res.status).toBe(404);
  });
});

// ── PUT /api/releases/:id ────────────────────────────────────────────
describe("PUT /api/releases/:id", () => {
  it("updates the version", async () => {
    queue = [[mockRelease]];
    dbMock.update.mockReturnValueOnce(createChain([{ ...mockRelease, version: "1.2.4" }]));

    const res = await releasesRoutes.handle(
      new Request(`http://localhost/api/releases/${RELEASE_ID}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: "1.2.4" }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.version).toBe("1.2.4");
  });

  it("updates deployedAt", async () => {
    queue = [[mockRelease]];
    dbMock.update.mockReturnValueOnce(createChain([mockRelease]));

    const res = await releasesRoutes.handle(
      new Request(`http://localhost/api/releases/${RELEASE_ID}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deployedAt: "2026-06-20T12:00:00Z" }),
      }),
    );
    expect(res.status).toBe(200);
  });

  it("returns 400 when no valid fields provided", async () => {
    queue = [[mockRelease]];
    const res = await releasesRoutes.handle(
      new Request(`http://localhost/api/releases/${RELEASE_ID}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unrelatedField: "x" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when release not found", async () => {
    queue = [[]];
    const res = await releasesRoutes.handle(
      new Request(`http://localhost/api/releases/${RELEASE_ID}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: "1.2.4" }),
      }),
    );
    expect(res.status).toBe(404);
  });
});

// ── GET /api/releases/:id/health ─────────────────────────────────────
describe("GET /api/releases/:id/health", () => {
  it("returns healthScore=green for low new-issue rate (<5/hr)", async () => {
    const oldRelease = {
      ...mockRelease,
      deployedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    };
    queue = [
      [oldRelease], // release lookup
      [{ total: 24 }], // newIssuesCount (24/hr over 1 hour window)
      [{ total: 100 }], // totalEvents
    ];

    const res = await releasesRoutes.handle(
      new Request(`http://localhost/api/releases/${RELEASE_ID}/health`),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.healthScore).toBe("green");
    expect(body.releaseId).toBe(RELEASE_ID);
    expect(body.version).toBe("1.2.3");
    expect(body.environment).toBe("production");
    expect(typeof body.newIssuesCount).toBe("number");
    expect(typeof body.errorRate).toBe("number");
  });

  it("returns healthScore=yellow for moderate new-issue rate (5-20/hr)", async () => {
    const oldRelease = {
      ...mockRelease,
      deployedAt: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
    };
    queue = [[oldRelease], [{ total: 10 }], [{ total: 200 }]];

    const res = await releasesRoutes.handle(
      new Request(`http://localhost/api/releases/${RELEASE_ID}/health`),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    // 10 issues / 1hr = 10/hr → yellow
    expect(body.healthScore).toBe("yellow");
  });

  it("returns healthScore=red for high new-issue rate (>=20/hr)", async () => {
    const oldRelease = {
      ...mockRelease,
      deployedAt: new Date(Date.now() - 60 * 60 * 1000),
    };
    queue = [[oldRelease], [{ total: 25 }], [{ total: 500 }]];

    const res = await releasesRoutes.handle(
      new Request(`http://localhost/api/releases/${RELEASE_ID}/health`),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.healthScore).toBe("red");
  });

  it("returns 404 when release not found", async () => {
    queue = [[]];
    const res = await releasesRoutes.handle(
      new Request(`http://localhost/api/releases/${RELEASE_ID}/health`),
    );
    expect(res.status).toBe(404);
  });
});

// ── DELETE /api/releases/:id ─────────────────────────────────────────
describe("DELETE /api/releases/:id", () => {
  it("deletes and returns { deleted: true }", async () => {
    queue = [[{ id: RELEASE_ID }]];
    const res = await releasesRoutes.handle(
      new Request(`http://localhost/api/releases/${RELEASE_ID}`, { method: "DELETE" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(true);
  });

  it("returns 404 when release not found", async () => {
    queue = [[]];
    const res = await releasesRoutes.handle(
      new Request(`http://localhost/api/releases/${RELEASE_ID}`, { method: "DELETE" }),
    );
    expect(res.status).toBe(404);
  });
});
