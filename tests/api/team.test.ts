/**
 * Tests for /api/team (Team Members CRUD).
 *
 * Team members have a role (owner/admin/member/viewer). Email is unique
 * per project; duplicates within a project return 409.
 * Routes:
 *   GET    /api/team/        — list team members for a project
 *   POST   /api/team/        — add team member
 *   PUT    /api/team/:id     — update name/email/role
 *   DELETE /api/team/:id     — remove team member
 *
 * Coverage:
 *   - Happy path: full CRUD
 *   - Duplicate email within project → 409
 *   - Role validation: only owner/admin/member/viewer allowed
 *   - Email format validation
 *   - 404 for missing member
 *   - 401 without API key
 *   - Pagination: limit/offset (default 100, max 500)
 */

import { Elysia } from "elysia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const MEMBER_ID = "550e8400-e29b-41d4-a716-446655440000";
const PROJECT_ID = "660e8400-e29b-41d4-a716-446655440001";

const mockMember = {
  id: MEMBER_ID,
  projectId: PROJECT_ID,
  name: "Alice Smith",
  email: "alice@example.com",
  role: "admin",
  createdAt: new Date("2026-06-01"),
  updatedAt: new Date("2026-06-01"),
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
  insert: vi.fn(() => createChain([mockMember])),
  update: vi.fn(() => createChain([mockMember])),
  delete: vi.fn(() => createChain(undefined)),
};

vi.mock("../../src/store/db.js", () => ({ db: dbMock }));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col: any, val: any) => ({ col, val, op: "eq" })),
  and: vi.fn((...args: any[]) => ({ args, op: "and" })),
  desc: vi.fn((col: any) => ({ col, op: "desc" })),
  count: vi.fn(() => ({ op: "count" })),
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

const { teamRoutes } = await import("../../src/api/team.js");
const { authGuard } = await import("../../src/middleware/auth.js");

function appWithAuth(): Elysia {
  return new Elysia().onBeforeHandle(authGuard).use(teamRoutes);
}

beforeEach(() => {
  queue = [];
  dbMock.select.mockClear();
  dbMock.insert.mockClear();
  dbMock.update.mockClear();
  dbMock.delete.mockClear();
});

// ── Auth rejection ───────────────────────────────────────────────────
describe("team API (auth)", () => {
  it("returns 401 on GET without API key", async () => {
    const app = appWithAuth();
    const res = await app.handle(new Request("http://localhost/api/team/"));
    expect(res.status).toBe(401);
  });

  it("returns 401 on PUT without API key", async () => {
    const app = appWithAuth();
    const res = await app.handle(
      new Request(`http://localhost/api/team/${MEMBER_ID}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "viewer" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 on DELETE without API key", async () => {
    const app = appWithAuth();
    const res = await app.handle(
      new Request(`http://localhost/api/team/${MEMBER_ID}`, { method: "DELETE" }),
    );
    expect(res.status).toBe(401);
  });
});

// ── POST /api/team/ (add member) ─────────────────────────────────────
describe("POST /api/team/", () => {
  it("adds a team member and returns 201", async () => {
    queue = [[]]; // no duplicate
    dbMock.insert.mockReturnValueOnce(createChain([mockMember]));

    const res = await teamRoutes.handle(
      new Request("http://localhost/api/team/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: PROJECT_ID,
          name: "Alice",
          email: "alice@example.com",
          role: "admin",
        }),
      }),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe(MEMBER_ID);
  });

  it("uses default role 'member' when not specified", async () => {
    queue = [[]];
    dbMock.insert.mockReturnValueOnce(createChain([{ ...mockMember, role: "member" }]));

    const res = await teamRoutes.handle(
      new Request("http://localhost/api/team/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: PROJECT_ID,
          name: "Bob",
          email: "bob@example.com",
        }),
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.role).toBe("member");
  });

  it("returns 409 when email already exists in project", async () => {
    queue = [[{ id: MEMBER_ID }]]; // duplicate exists

    const res = await teamRoutes.handle(
      new Request("http://localhost/api/team/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: PROJECT_ID,
          name: "Alice",
          email: "alice@example.com",
        }),
      }),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already exists/);
  });

  it("returns 422 for invalid email format", async () => {
    const res = await teamRoutes.handle(
      new Request("http://localhost/api/team/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: PROJECT_ID,
          name: "Bad",
          email: "not-an-email",
        }),
      }),
    );
    expect(res.status).toBe(422);
  });

  it("returns 422 for invalid role", async () => {
    const res = await teamRoutes.handle(
      new Request("http://localhost/api/team/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: PROJECT_ID,
          name: "X",
          email: "x@example.com",
          role: "superuser",
        }),
      }),
    );
    expect(res.status).toBe(422);
  });

  it("returns 422 when missing required fields", async () => {
    const res = await teamRoutes.handle(
      new Request("http://localhost/api/team/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: PROJECT_ID }),
      }),
    );
    expect(res.status).toBe(422);
  });
});

// ── GET /api/team/ (list) ────────────────────────────────────────────
describe("GET /api/team/", () => {
  it("returns paginated team members with default limit=100", async () => {
    queue = [[mockMember], [{ total: 1 }]];
    const res = await teamRoutes.handle(
      new Request(`http://localhost/api/team/?projectId=${PROJECT_ID}`),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(MEMBER_ID);
    expect(body.total).toBe(1);
    expect(body.limit).toBe(100);
    expect(body.offset).toBe(0);
  });

  it("respects limit and offset", async () => {
    queue = [[mockMember], [{ total: 200 }]];
    const res = await teamRoutes.handle(
      new Request("http://localhost/api/team/?limit=25&offset=50"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.limit).toBe(25);
    expect(body.offset).toBe(50);
    expect(body.total).toBe(200);
  });

  it("clamps limit to max 500", async () => {
    queue = [[], [{ total: 0 }]];
    const res = await teamRoutes.handle(new Request("http://localhost/api/team/?limit=10000"));
    expect(res.status).toBe(200);
    const body = await res.json();
    // parseLimit caps at 500
    expect(body.limit).toBeLessThanOrEqual(500);
  });
});

// ── PUT /api/team/:id ────────────────────────────────────────────────
describe("PUT /api/team/:id", () => {
  it("updates the role", async () => {
    queue = [[mockMember]]; // existing
    dbMock.update.mockReturnValueOnce(createChain([{ ...mockMember, role: "viewer" }]));

    const res = await teamRoutes.handle(
      new Request(`http://localhost/api/team/${MEMBER_ID}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "viewer" }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.role).toBe("viewer");
  });

  it("updates email when not duplicate", async () => {
    queue = [[mockMember], []]; // existing + no duplicate
    dbMock.update.mockReturnValueOnce(createChain([{ ...mockMember, email: "new@example.com" }]));

    const res = await teamRoutes.handle(
      new Request(`http://localhost/api/team/${MEMBER_ID}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "new@example.com" }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.email).toBe("new@example.com");
  });

  it("returns 409 when updating to duplicate email", async () => {
    const otherMemberId = "different-uuid-different-different-diff";
    queue = [[mockMember], [{ id: otherMemberId }]]; // existing + duplicate (different id)

    const res = await teamRoutes.handle(
      new Request(`http://localhost/api/team/${MEMBER_ID}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "duplicate@example.com" }),
      }),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already exists/);
  });

  it("returns 404 when member does not exist", async () => {
    queue = [[]];
    const res = await teamRoutes.handle(
      new Request(`http://localhost/api/team/${MEMBER_ID}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "admin" }),
      }),
    );
    expect(res.status).toBe(404);
  });
});

// ── DELETE /api/team/:id ─────────────────────────────────────────────
describe("DELETE /api/team/:id", () => {
  it("removes the member and returns { deleted: true }", async () => {
    queue = [[{ id: MEMBER_ID }]];
    const res = await teamRoutes.handle(
      new Request(`http://localhost/api/team/${MEMBER_ID}`, { method: "DELETE" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(true);
  });

  it("returns 404 when member does not exist", async () => {
    queue = [[]];
    const res = await teamRoutes.handle(
      new Request(`http://localhost/api/team/${MEMBER_ID}`, { method: "DELETE" }),
    );
    expect(res.status).toBe(404);
  });
});
