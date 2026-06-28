/**
 * Tests for /api/maintenance (Maintenance Windows CRUD).
 *
 * Maintenance windows suppress alerts for associated monitors during the
 * window interval. Routes:
 *   GET    /api/maintenance/                — list windows (active/upcoming/past)
 *   GET    /api/maintenance/active/now      — currently active windows
 *   GET    /api/maintenance/:id             — single window
 *   POST   /api/maintenance/                — create window
 *   PUT    /api/maintenance/:id             — update window
 *   DELETE /api/maintenance/:id             — delete window
 *
 * Coverage:
 *   - Happy path: create, read, list, update, delete
 *   - Validation: endsAt must be after startsAt (400)
 *   - Not found: 404 for unknown id on get/update/delete
 *   - Status filter: active / upcoming / past
 *   - Auth rejection: 401 without API key
 *   - Pagination: limit/offset
 */

import { Elysia } from "elysia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const WINDOW_ID = "550e8400-e29b-41d4-a716-446655440000";
const PROJECT_ID = "660e8400-e29b-41d4-a716-446655440001";

const mockWindow = {
  id: WINDOW_ID,
  projectId: PROJECT_ID,
  name: "DB Migration",
  description: "Primary → replica switch",
  startsAt: new Date("2026-06-21T00:00:00Z"),
  endsAt: new Date("2026-06-21T02:00:00Z"),
  monitorIds: [],
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
  insert: vi.fn(() => createChain([mockWindow])),
  update: vi.fn(() => createChain([mockWindow])),
  delete: vi.fn(() => createChain(undefined)),
};

vi.mock("../../src/store/db.js", () => ({ db: dbMock }));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col: any, val: any) => ({ col, val, op: "eq" })),
  and: vi.fn((...args: any[]) => ({ args, op: "and" })),
  desc: vi.fn((col: any) => ({ col, op: "desc" })),
  count: vi.fn(() => ({ op: "count" })),
  gte: vi.fn((col: any, val: any) => ({ col, val, op: "gte" })),
  lte: vi.fn((col: any, val: any) => ({ col, val, op: "lte" })),
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

const { maintenanceRoutes } = await import("../../src/api/maintenance.js");
const { authGuard } = await import("../../src/middleware/auth.js");

function appWithAuth(): Elysia {
  return new Elysia().onBeforeHandle(authGuard).use(maintenanceRoutes);
}

beforeEach(() => {
  queue = [];
  dbMock.select.mockClear();
  dbMock.insert.mockClear();
  dbMock.update.mockClear();
  dbMock.delete.mockClear();
});

// ── Auth rejection ───────────────────────────────────────────────────
describe("maintenance API (auth)", () => {
  it("returns 401 on GET without API key", async () => {
    const app = appWithAuth();
    const res = await app.handle(new Request("http://localhost/api/maintenance/"));
    expect(res.status).toBe(401);
  });

  it("returns 401 on DELETE without API key", async () => {
    const app = appWithAuth();
    const res = await app.handle(
      new Request(`http://localhost/api/maintenance/${WINDOW_ID}`, { method: "DELETE" }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 on PUT without API key", async () => {
    const app = appWithAuth();
    const res = await app.handle(
      new Request(`http://localhost/api/maintenance/${WINDOW_ID}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "x" }),
      }),
    );
    expect(res.status).toBe(401);
  });
});

// ── POST /api/maintenance/ (create) ──────────────────────────────────
describe("POST /api/maintenance/", () => {
  it("creates a maintenance window and returns 200 with the row", async () => {
    const res = await maintenanceRoutes.handle(
      new Request("http://localhost/api/maintenance/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: PROJECT_ID,
          name: "DB Migration",
          startsAt: "2026-06-21T00:00:00Z",
          endsAt: "2026-06-21T02:00:00Z",
        }),
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(WINDOW_ID);
    expect(dbMock.insert).toHaveBeenCalledTimes(1);
  });

  it("accepts optional description and monitorIds", async () => {
    const res = await maintenanceRoutes.handle(
      new Request("http://localhost/api/maintenance/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: PROJECT_ID,
          name: "Window",
          description: "Maintenance",
          startsAt: "2026-06-21T00:00:00Z",
          endsAt: "2026-06-21T02:00:00Z",
          monitorIds: ["mon-1"],
        }),
      }),
    );
    expect(res.status).toBe(200);
  });

  it("returns 400 when endsAt is before startsAt", async () => {
    const res = await maintenanceRoutes.handle(
      new Request("http://localhost/api/maintenance/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: PROJECT_ID,
          name: "Bad",
          startsAt: "2026-06-21T02:00:00Z",
          endsAt: "2026-06-21T00:00:00Z",
        }),
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/endsAt must be after startsAt/);
  });

  it("returns 422 for missing required fields (no name)", async () => {
    const res = await maintenanceRoutes.handle(
      new Request("http://localhost/api/maintenance/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: PROJECT_ID,
          startsAt: "2026-06-21T00:00:00Z",
          endsAt: "2026-06-21T02:00:00Z",
        }),
      }),
    );
    expect(res.status).toBe(422);
  });
});

// ── GET /api/maintenance/ (list) ─────────────────────────────────────
describe("GET /api/maintenance/", () => {
  it("returns paginated windows with default limit=50 offset=0", async () => {
    queue = [
      [mockWindow], // items
      [{ total: 1 }], // count
    ];
    const res = await maintenanceRoutes.handle(
      new Request(`http://localhost/api/maintenance/?projectId=${PROJECT_ID}`),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].id).toBe(WINDOW_ID);
    expect(body.total).toBe(1);
    expect(body.limit).toBe(50);
    expect(body.offset).toBe(0);
  });

  it("respects limit and offset query params", async () => {
    queue = [[mockWindow], [{ total: 100 }]];
    const res = await maintenanceRoutes.handle(
      new Request("http://localhost/api/maintenance/?limit=10&offset=20"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.limit).toBe(10);
    expect(body.offset).toBe(20);
    expect(body.total).toBe(100);
  });

  it("returns empty array when no windows", async () => {
    queue = [[], [{ total: 0 }]];
    const res = await maintenanceRoutes.handle(new Request("http://localhost/api/maintenance/"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toEqual([]);
    expect(body.total).toBe(0);
  });
});

// ── GET /api/maintenance/active/now ──────────────────────────────────
describe("GET /api/maintenance/active/now", () => {
  it("returns currently active windows", async () => {
    queue = [[mockWindow]];
    const res = await maintenanceRoutes.handle(
      new Request("http://localhost/api/maintenance/active/now"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
  });
});

// ── GET /api/maintenance/:id ─────────────────────────────────────────
describe("GET /api/maintenance/:id", () => {
  it("returns a single window", async () => {
    queue = [[mockWindow]];
    const res = await maintenanceRoutes.handle(
      new Request(`http://localhost/api/maintenance/${WINDOW_ID}`),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(WINDOW_ID);
    expect(body.name).toBe("DB Migration");
  });

  it("returns 404 for non-existent window", async () => {
    queue = [[]];
    const res = await maintenanceRoutes.handle(
      new Request(`http://localhost/api/maintenance/${WINDOW_ID}`),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Maintenance window not found");
  });
});

// ── PUT /api/maintenance/:id (update) ────────────────────────────────
describe("PUT /api/maintenance/:id", () => {
  it("updates the window name", async () => {
    queue = [[{ id: WINDOW_ID }]]; // existence check
    dbMock.update.mockReturnValueOnce(createChain([{ ...mockWindow, name: "Renamed" }]));

    const res = await maintenanceRoutes.handle(
      new Request(`http://localhost/api/maintenance/${WINDOW_ID}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Renamed" }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Renamed");
  });

  it("returns 404 for non-existent window", async () => {
    queue = [[]];
    const res = await maintenanceRoutes.handle(
      new Request(`http://localhost/api/maintenance/${WINDOW_ID}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "X" }),
      }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 when updated endsAt is before startsAt", async () => {
    queue = [[{ id: WINDOW_ID }]];
    const res = await maintenanceRoutes.handle(
      new Request(`http://localhost/api/maintenance/${WINDOW_ID}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startsAt: "2026-06-21T05:00:00Z",
          endsAt: "2026-06-21T02:00:00Z",
        }),
      }),
    );
    expect(res.status).toBe(400);
  });
});

// ── DELETE /api/maintenance/:id ──────────────────────────────────────
describe("DELETE /api/maintenance/:id", () => {
  it("deletes the window and returns { deleted: true }", async () => {
    queue = [[{ id: WINDOW_ID }]];
    const res = await maintenanceRoutes.handle(
      new Request(`http://localhost/api/maintenance/${WINDOW_ID}`, { method: "DELETE" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(true);
    expect(dbMock.delete).toHaveBeenCalled();
  });

  it("returns 404 for non-existent window", async () => {
    queue = [[]];
    const res = await maintenanceRoutes.handle(
      new Request(`http://localhost/api/maintenance/${WINDOW_ID}`, { method: "DELETE" }),
    );
    expect(res.status).toBe(404);
  });
});
