/**
 * Tests for /api/projects (CRUD for project resources).
 *
 * Projects are the top-level tenant scope for hiai-observe. This file covers:
 *   - GET /               list projects (returns apiKeyPreview, never full key)
 *   - POST /              create project (issues plaintext API key ONCE)
 *   - POST /:id/rotate-key   rotate API key (returns new plaintext key ONCE)
 *   - DELETE /:id         delete project (cascades child rows)
 *   - PUT /:id/rate-limit patch per-project rate limit overrides
 *
 * Auth: Authenticated routes go through authGuard which 401s without a key.
 */

import { Elysia } from "elysia";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Constants ────────────────────────────────────────────────────────
const PROJECT_ID = "660e8400-e29b-41d4-a716-446655440001";
const NONEXISTENT_ID = "770e8400-e29b-41d4-a716-446655440000";

// ── Drizzle chain helper ─────────────────────────────────────────────
function makeChain(result: any): any {
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
  ]) {
    chain[m] = vi.fn(() => chain);
  }
  chain.then = (resolve: Function, reject?: Function) =>
    Promise.resolve(result).then(resolve, reject ?? ((v) => v as never));
  return chain;
}

// ── Queue-based mock for parallel queries ────────────────────────────
let queue: any[][] = [];
const enqueue = (...results: any[][]) => queue.push(...results);

const dbMock: any = {
  select: vi.fn(() => {
    const next = queue.shift() ?? [];
    return makeChain(next);
  }),
  selectDistinctOn: vi.fn(() => makeChain([])),
  insert: vi.fn(() => makeChain([])),
  update: vi.fn(() => makeChain([])),
  delete: vi.fn(() => makeChain(undefined)),
  // tx === dbMock so cascade deletes inside the transaction reuse the mocks
  transaction: vi.fn((fn: any) => fn(dbMock)),
};

vi.mock("../../src/store/db.js", () => ({ db: dbMock }));

// ── Auth helpers — keep maskApiKey real; stub resolve/lookup so authGuard
//    falls through to 401, and stub hashApiKey to avoid Bun.password.hash
//    (vitest runs in Node where Bun global is unavailable).
// ──────────────────────────────────────────────────────────────────────
vi.mock("../../src/lib/auth.js", async () => {
  const actual = await vi.importActual<any>("../../src/lib/auth.js");
  return {
    ...actual,
    resolveApiKey: vi.fn(() => null),
    lookupProject: vi.fn(async () => null),
    hashApiKey: vi.fn(async (apiKey: string) => ({
      hash: `$mock-hash$${apiKey.slice(0, 8)}`,
      prefix: apiKey.slice(0, 8),
    })),
  };
});

// ── Drizzle operators used by projects.ts ───────────────────────────
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col: any, val: any) => ({ col, val, op: "eq" })),
  inArray: vi.fn((col: any, vals: any[]) => ({ col, vals, op: "inArray" })),
}));

// ── crypto.randomUUID — deterministic so generated API keys are stable
//    across test runs. Each call bumps a counter and emits a valid UUIDv4
//    with the counter baked into the last 12 hex digits.
// ──────────────────────────────────────────────────────────────────────
let uuidCounter = 0;
vi.mock("node:crypto", async () => {
  const actual = await vi.importActual<any>("node:crypto");
  return {
    ...actual,
    randomUUID: vi.fn(() => {
      uuidCounter += 1;
      const hex = uuidCounter.toString(16).padStart(12, "0");
      return `00000000-0000-4000-8000-${hex}`;
    }),
  };
});

// ── rate-limiter — dynamically imported inside PUT /:id/rate-limit
//    via try/catch, but we stub it explicitly to avoid pulling in redis/config.
// ──────────────────────────────────────────────────────────────────────
vi.mock("../../src/middleware/rate-limiter.js", () => ({
  invalidateProjectRateLimitCache: vi.fn(),
}));

// ── silence logger ───────────────────────────────────────────────────
vi.mock("../../src/lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// auth middleware — use the real authGuard (which falls through to 401 via
// the mocked resolveApiKey)
vi.mock("../../src/middleware/auth.js", async () => {
  const actual = await vi.importActual<any>("../../src/middleware/auth.js");
  return actual;
});

vi.mock("../../src/lib/rbac.js", () => ({
  checkWriteAccess: vi.fn(async () => true),
}));

const { projectsRoutes } = await import("../../src/api/projects.js");
const { authGuard } = await import("../../src/middleware/auth.js");

function appWithAuth(): Elysia {
  return new Elysia().onBeforeHandle(authGuard).use(projectsRoutes);
}

beforeEach(() => {
  queue = [];
  uuidCounter = 0;
  dbMock.select.mockClear();
  dbMock.selectDistinctOn.mockClear();
  dbMock.insert.mockClear();
  dbMock.update.mockClear();
  dbMock.delete.mockClear();
  dbMock.transaction.mockClear();
});

// ── Auth rejection ───────────────────────────────────────────────────
describe("auth", () => {
  it("returns 401 without API key", async () => {
    const app = appWithAuth();
    const res = await app.handle(new Request("http://localhost/api/projects/"));
    expect(res.status).toBe(401);
  });
});

// ── GET /api/projects/ (list) ────────────────────────────────────────
describe("GET /api/projects/", () => {
  it("returns projects with apiKeyPreview but never the full key", async () => {
    enqueue([
      {
        id: PROJECT_ID,
        name: "Acme",
        slug: "acme",
        keyPrefix: "ho_aaaaaa",
        createdAt: new Date("2026-01-01T00:00:00Z"),
      },
    ]);

    const res = await projectsRoutes.handle(new Request("http://localhost/api/projects/"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.projects).toHaveLength(1);
    const p = body.projects[0];
    expect(p.id).toBe(PROJECT_ID);
    expect(p.name).toBe("Acme");
    expect(p.slug).toBe("acme");
    expect(p.keyPrefix).toBe("ho_aaaaaa");
    // Masked preview only — first 8 chars of keyPrefix + "..."
    expect(p.apiKeyPreview).toBe("ho_aaaaaa...");
    // Critical: full key/hash never returned
    expect(p.apiKey).toBeUndefined();
    expect(p.apiKeyHash).toBeUndefined();
  });

  it("returns empty list when no projects exist", async () => {
    enqueue([]);
    const res = await projectsRoutes.handle(new Request("http://localhost/api/projects/"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.projects).toEqual([]);
  });

  it("returns null apiKeyPreview when keyPrefix is missing", async () => {
    enqueue([
      {
        id: PROJECT_ID,
        name: "Legacy",
        slug: "legacy",
        keyPrefix: null,
        createdAt: new Date("2026-01-01T00:00:00Z"),
      },
    ]);
    const res = await projectsRoutes.handle(new Request("http://localhost/api/projects/"));
    const body = await res.json();
    expect(body.projects[0].apiKeyPreview).toBeNull();
  });
});

// ── POST /api/projects/ (create) ─────────────────────────────────────
describe("POST /api/projects/", () => {
  it("creates a project with valid name and returns 201 with new apiKey", async () => {
    dbMock.insert.mockReturnValueOnce(
      makeChain([
        {
          id: PROJECT_ID,
          name: "My Project",
          slug: "my-project",
          keyPrefix: "ho_00000000",
          createdAt: new Date("2026-01-01"),
        },
      ]),
    );

    const res = await projectsRoutes.handle(
      new Request("http://localhost/api/projects/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "My Project" }),
      }),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.project).toBeDefined();
    expect(body.project.name).toBe("My Project");
    // Plaintext key returned once, ho_<32 hex>
    expect(body.apiKey).toMatch(/^ho_[0-9a-f]{32}$/);
    // No hash leak in response
    expect(body.project.apiKeyHash).toBeUndefined();
  });

  it("auto-derives a lowercase, dash-separated slug from the name", async () => {
    dbMock.insert.mockReturnValueOnce(
      makeChain([
        {
          id: PROJECT_ID,
          name: "Hello, World! 2026",
          slug: "hello-world-2026",
          keyPrefix: "ho_00000002",
          createdAt: new Date("2026-01-01"),
        },
      ]),
    );

    const res = await projectsRoutes.handle(
      new Request("http://localhost/api/projects/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Hello, World! 2026" }),
      }),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.project.slug).toBe("hello-world-2026");
  });

  it("returns 422 when name is empty (validation)", async () => {
    const res = await projectsRoutes.handle(
      new Request("http://localhost/api/projects/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "" }),
      }),
    );

    // Elysia validation: t.String({ minLength: 1 }) rejects empty string → 422
    expect(res.status).toBe(422);
  });
});

// ── DELETE /api/projects/:id ─────────────────────────────────────────
describe("DELETE /api/projects/:id", () => {
  it("deletes the project and cascades child rows", async () => {
    // 1st select — project existence check (before transaction)
    enqueue([{ id: PROJECT_ID }]);
    // Inside transaction: inner selects for alerts + monitors return []
    enqueue([], []);
    dbMock.delete.mockReturnValue(makeChain(undefined));

    const res = await projectsRoutes.handle(
      new Request(`http://localhost/api/projects/${PROJECT_ID}`, { method: "DELETE" }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(true);
    // Verify transaction was used and cascade deletes were issued
    expect(dbMock.transaction).toHaveBeenCalled();
    expect(dbMock.delete).toHaveBeenCalled();
  });

  it("returns 404 for missing project", async () => {
    enqueue([]); // existence check returns nothing

    const res = await projectsRoutes.handle(
      new Request(`http://localhost/api/projects/${NONEXISTENT_ID}`, { method: "DELETE" }),
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Project not found");
    // No transaction should run when project is missing
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });
});

// ── POST /api/projects/:id/rotate-key ────────────────────────────────
describe("POST /api/projects/:id/rotate-key", () => {
  it("rotates the API key and returns the new plaintext key once", async () => {
    dbMock.update.mockReturnValueOnce(
      makeChain([
        {
          id: PROJECT_ID,
          keyPrefix: "ho_00000003",
        },
      ]),
    );

    const res = await projectsRoutes.handle(
      new Request(`http://localhost/api/projects/${PROJECT_ID}/rotate-key`, { method: "POST" }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    // Plaintext key returned once, ho_<32 hex>
    expect(body.apiKey).toMatch(/^ho_[0-9a-f]{32}$/);
    // Masked preview: first 8 chars + "..."
    expect(body.apiKeyPreview).toBe(`${body.apiKey.slice(0, 8)}...`);
    expect(body.apiKeyPreview.endsWith("...")).toBe(true);
  });

  it("returns 404 for missing project on rotate-key", async () => {
    dbMock.update.mockReturnValueOnce(makeChain([]));

    const res = await projectsRoutes.handle(
      new Request(`http://localhost/api/projects/${NONEXISTENT_ID}/rotate-key`, {
        method: "POST",
      }),
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Project not found");
  });
});

// ── PUT /api/projects/:id/rate-limit ─────────────────────────────────
describe("PUT /api/projects/:id/rate-limit", () => {
  it("updates rate limit and returns the patched project", async () => {
    enqueue([{ id: PROJECT_ID }]); // existence check
    dbMock.update.mockReturnValueOnce(
      makeChain([
        {
          id: PROJECT_ID,
          name: "Acme",
          slug: "acme",
          rateLimit: 250,
          rateLimitWindowMs: 60_000,
        },
      ]),
    );

    const res = await projectsRoutes.handle(
      new Request(`http://localhost/api/projects/${PROJECT_ID}/rate-limit`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rateLimit: 250 }),
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.project.rateLimit).toBe(250);
    expect(body.project.id).toBe(PROJECT_ID);
  });

  it("returns 404 for missing project on rate-limit update", async () => {
    enqueue([]); // existence check

    const res = await projectsRoutes.handle(
      new Request(`http://localhost/api/projects/${NONEXISTENT_ID}/rate-limit`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rateLimit: 100 }),
      }),
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Project not found");
  });
});
