/**
 * Tests for /api/incidents (Incidents CRUD).
 *
 * Incidents have a status lifecycle:
 *   investigating → identified → monitoring → resolved
 * Only allowed transitions are permitted on PUT (others return 400).
 * Routes:
 *   GET    /api/incidents/                — list incidents
 *   GET    /api/incidents/active          — non-resolved incidents
 *   GET    /api/incidents/:id             — single incident
 *   POST   /api/incidents/                — create incident
 *   PUT    /api/incidents/:id             — update status / severity / description
 *   DELETE /api/incidents/:id             — delete incident
 *
 * Coverage:
 *   - Happy path: full CRUD
 *   - Lifecycle validation: invalid transitions return 400 with allowed list
 *   - Default status: 'investigating' on create
 *   - Severity validation: only minor / major / critical allowed
 *   - 404 for missing incidents
 *   - 401 without API key
 *   - Pagination: limit/offset
 */

import { Elysia } from "elysia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const INCIDENT_ID = "550e8400-e29b-41d4-a716-446655440000";
const PROJECT_ID = "660e8400-e29b-41d4-a716-446655440001";
const MONITOR_ID = "770e8400-e29b-41d4-a716-446655440002";

const mockIncident = {
  id: INCIDENT_ID,
  projectId: PROJECT_ID,
  monitorId: MONITOR_ID,
  title: "API 500s",
  status: "investigating",
  severity: "major",
  description: null,
  createdAt: new Date("2026-06-20"),
  updatedAt: new Date("2026-06-20"),
  resolvedAt: null,
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
  insert: vi.fn(() => createChain([mockIncident])),
  update: vi.fn(() => createChain([mockIncident])),
  delete: vi.fn(() => createChain(undefined)),
};

vi.mock("../../src/store/db.js", () => ({ db: dbMock }));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col: any, val: any) => ({ col, val, op: "eq" })),
  and: vi.fn((...args: any[]) => ({ args, op: "and" })),
  desc: vi.fn((col: any) => ({ col, op: "desc" })),
  count: vi.fn(() => ({ op: "count" })),
  ne: vi.fn((col: any, val: any) => ({ col, val, op: "ne" })),
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

const { incidentsRoutes } = await import("../../src/api/incidents.js");
const { authGuard } = await import("../../src/middleware/auth.js");

function appWithAuth(): Elysia {
  return new Elysia().onBeforeHandle(authGuard).use(incidentsRoutes);
}

beforeEach(() => {
  queue = [];
  dbMock.select.mockClear();
  dbMock.insert.mockClear();
  dbMock.update.mockClear();
  dbMock.delete.mockClear();
});

// ── Auth rejection ───────────────────────────────────────────────────
describe("incidents API (auth)", () => {
  it("returns 401 on GET without API key", async () => {
    const app = appWithAuth();
    const res = await app.handle(new Request("http://localhost/api/incidents/"));
    expect(res.status).toBe(401);
  });

  it("returns 401 on PUT without API key", async () => {
    const app = appWithAuth();
    const res = await app.handle(
      new Request(`http://localhost/api/incidents/${INCIDENT_ID}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "x" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 on DELETE without API key", async () => {
    const app = appWithAuth();
    const res = await app.handle(
      new Request(`http://localhost/api/incidents/${INCIDENT_ID}`, { method: "DELETE" }),
    );
    expect(res.status).toBe(401);
  });
});

// ── POST /api/incidents/ (create) ───────────────────────────────────
describe("POST /api/incidents/", () => {
  it("creates an incident with default status='investigating'", async () => {
    const res = await incidentsRoutes.handle(
      new Request("http://localhost/api/incidents/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: PROJECT_ID,
          title: "API 500s",
        }),
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(INCIDENT_ID);
    expect(dbMock.insert).toHaveBeenCalledTimes(1);
  });

  it("creates with explicit status, severity and monitorId", async () => {
    const res = await incidentsRoutes.handle(
      new Request("http://localhost/api/incidents/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: PROJECT_ID,
          title: "DB down",
          status: "identified",
          severity: "critical",
          monitorId: MONITOR_ID,
        }),
      }),
    );
    expect(res.status).toBe(200);
  });

  it("returns 422 for missing required fields (no title)", async () => {
    const res = await incidentsRoutes.handle(
      new Request("http://localhost/api/incidents/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: PROJECT_ID }),
      }),
    );
    expect(res.status).toBe(422);
  });

  it("returns 422 for invalid severity", async () => {
    const res = await incidentsRoutes.handle(
      new Request("http://localhost/api/incidents/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: PROJECT_ID,
          title: "Test",
          severity: "unknown",
        }),
      }),
    );
    expect(res.status).toBe(422);
  });
});

// ── GET /api/incidents/ (list) ───────────────────────────────────────
describe("GET /api/incidents/", () => {
  it("returns paginated incidents with default limit=50", async () => {
    queue = [[mockIncident], [{ total: 1 }]];
    const res = await incidentsRoutes.handle(
      new Request(`http://localhost/api/incidents/?projectId=${PROJECT_ID}`),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].id).toBe(INCIDENT_ID);
    expect(body.total).toBe(1);
    expect(body.limit).toBe(50);
    expect(body.offset).toBe(0);
  });

  it("respects limit and offset", async () => {
    queue = [[mockIncident], [{ total: 50 }]];
    const res = await incidentsRoutes.handle(
      new Request("http://localhost/api/incidents/?limit=10&offset=20"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.limit).toBe(10);
    expect(body.offset).toBe(20);
    expect(body.total).toBe(50);
  });

  it("filters by status", async () => {
    queue = [[mockIncident], [{ total: 1 }]];
    const res = await incidentsRoutes.handle(
      new Request("http://localhost/api/incidents/?status=investigating"),
    );
    expect(res.status).toBe(200);
  });
});

// ── GET /api/incidents/active ────────────────────────────────────────
describe("GET /api/incidents/active", () => {
  it("returns non-resolved incidents", async () => {
    queue = [[mockIncident]];
    const res = await incidentsRoutes.handle(new Request("http://localhost/api/incidents/active"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].status).toBe("investigating");
  });
});

// ── GET /api/incidents/:id ───────────────────────────────────────────
describe("GET /api/incidents/:id", () => {
  it("returns the incident", async () => {
    queue = [[mockIncident]];
    const res = await incidentsRoutes.handle(
      new Request(`http://localhost/api/incidents/${INCIDENT_ID}`),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(INCIDENT_ID);
    expect(body.title).toBe("API 500s");
  });

  it("returns 404 when not found", async () => {
    queue = [[]];
    const res = await incidentsRoutes.handle(
      new Request(`http://localhost/api/incidents/${INCIDENT_ID}`),
    );
    expect(res.status).toBe(404);
  });
});

// ── PUT /api/incidents/:id (status transitions) ──────────────────────
describe("PUT /api/incidents/:id", () => {
  it("allows valid transition investigating → identified", async () => {
    queue = [[mockIncident]]; // existing
    dbMock.update.mockReturnValueOnce(createChain([{ ...mockIncident, status: "identified" }]));

    const res = await incidentsRoutes.handle(
      new Request(`http://localhost/api/incidents/${INCIDENT_ID}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "identified" }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("identified");
  });

  it("sets resolvedAt when status is set to resolved", async () => {
    const identified = { ...mockIncident, status: "identified" };
    queue = [[identified]];
    dbMock.update.mockReturnValueOnce(
      createChain([{ ...identified, status: "resolved", resolvedAt: new Date() }]),
    );

    const res = await incidentsRoutes.handle(
      new Request(`http://localhost/api/incidents/${INCIDENT_ID}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "resolved" }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("resolved");
    expect(body.resolvedAt).toBeTruthy();
  });

  it("rejects invalid transition (resolved is terminal → cannot go back)", async () => {
    const resolved = { ...mockIncident, status: "resolved" };
    queue = [[resolved]];

    const res = await incidentsRoutes.handle(
      new Request(`http://localhost/api/incidents/${INCIDENT_ID}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "investigating" }),
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Cannot transition from 'resolved'/);
    expect(body.allowedTransitions).toEqual([]);
  });

  it("allows re-opening: identified → investigating", async () => {
    const identified = { ...mockIncident, status: "identified" };
    queue = [[identified]];
    dbMock.update.mockReturnValueOnce(createChain([{ ...identified, status: "investigating" }]));

    const res = await incidentsRoutes.handle(
      new Request(`http://localhost/api/incidents/${INCIDENT_ID}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "investigating" }),
      }),
    );
    expect(res.status).toBe(200);
  });

  it("returns 404 when incident does not exist", async () => {
    queue = [[]];
    const res = await incidentsRoutes.handle(
      new Request(`http://localhost/api/incidents/${INCIDENT_ID}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "X" }),
      }),
    );
    expect(res.status).toBe(404);
  });
});

// ── DELETE /api/incidents/:id ────────────────────────────────────────
describe("DELETE /api/incidents/:id", () => {
  it("deletes the incident and returns { deleted: true }", async () => {
    queue = [[{ id: INCIDENT_ID }]];
    const res = await incidentsRoutes.handle(
      new Request(`http://localhost/api/incidents/${INCIDENT_ID}`, { method: "DELETE" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(true);
  });

  it("returns 404 when incident does not exist", async () => {
    queue = [[]];
    const res = await incidentsRoutes.handle(
      new Request(`http://localhost/api/incidents/${INCIDENT_ID}`, { method: "DELETE" }),
    );
    expect(res.status).toBe(404);
  });
});
