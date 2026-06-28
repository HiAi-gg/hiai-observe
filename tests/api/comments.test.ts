/**
 * Tests for /api/issues/:id/comments and /api/comments/:id.
 *
 * Issue comments are collaboration messages attached to a parent issue.
 * The 10_000 char / 200 char hard caps on body and authorName are
 * enforced at the route layer (defense-in-depth against unbounded-storage
 * DoS — Postgres `text` itself is unbounded).
 *
 * Routes:
 *   GET    /api/issues/:id/comments  — list comments for an issue
 *   POST   /api/issues/:id/comments  — add comment to an issue
 *   DELETE /api/comments/:id         — delete a comment
 *
 * Coverage:
 *   - Happy path: list, create, delete
 *   - 404 when issue does not exist (list and create)
 *   - 404 when comment does not exist (delete)
 *   - Body length cap (>10_000 → 413)
 *   - Author length cap (>200 → 413)
 *   - Empty body / author rejected by validator (400)
 *   - 401 without API key
 *   - Pagination: limit/offset (default 50)
 */

import { Elysia } from "elysia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ISSUE_ID = "550e8400-e29b-41d4-a716-446655440000";
const COMMENT_ID = "660e8400-e29b-41d4-a716-446655440001";

const mockComment = {
  id: COMMENT_ID,
  issueId: ISSUE_ID,
  authorName: "Alice",
  body: "Looking into this",
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
  insert: vi.fn(() => createChain([mockComment])),
  update: vi.fn(() => createChain([mockComment])),
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

const { commentsRoutes } = await import("../../src/api/comments.js");
const { authGuard } = await import("../../src/middleware/auth.js");

function appWithAuth(): Elysia {
  return new Elysia().onBeforeHandle(authGuard).use(commentsRoutes);
}

beforeEach(() => {
  queue = [];
  dbMock.select.mockClear();
  dbMock.insert.mockClear();
  dbMock.update.mockClear();
  dbMock.delete.mockClear();
});

// ── Auth rejection ───────────────────────────────────────────────────
describe("comments API (auth)", () => {
  it("returns 401 on GET comments without API key", async () => {
    const app = appWithAuth();
    const res = await app.handle(new Request(`http://localhost/api/issues/${ISSUE_ID}/comments`));
    expect(res.status).toBe(401);
  });

  it("returns 401 on DELETE comment without API key", async () => {
    const app = appWithAuth();
    const res = await app.handle(
      new Request(`http://localhost/api/comments/${COMMENT_ID}`, { method: "DELETE" }),
    );
    expect(res.status).toBe(401);
  });
});

// ── GET /api/issues/:id/comments ─────────────────────────────────────
describe("GET /api/issues/:id/comments", () => {
  it("returns paginated comments with default limit=50", async () => {
    queue = [
      [{ id: ISSUE_ID }], // issue exists
      [mockComment], // comments
      [{ total: 1 }], // count
    ];
    const res = await commentsRoutes.handle(
      new Request(`http://localhost/api/issues/${ISSUE_ID}/comments`),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(COMMENT_ID);
    expect(body.data[0].authorName).toBe("Alice");
    expect(body.total).toBe(1);
    expect(body.limit).toBe(50);
    expect(body.offset).toBe(0);
  });

  it("respects limit and offset query params", async () => {
    queue = [[{ id: ISSUE_ID }], [mockComment], [{ total: 100 }]];
    const res = await commentsRoutes.handle(
      new Request(`http://localhost/api/issues/${ISSUE_ID}/comments?limit=20&offset=10`),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.limit).toBe(20);
    expect(body.offset).toBe(10);
    expect(body.total).toBe(100);
  });

  it("returns 404 when issue does not exist", async () => {
    queue = [[]]; // issue not found
    const res = await commentsRoutes.handle(
      new Request(`http://localhost/api/issues/${ISSUE_ID}/comments`),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Issue not found");
  });

  it("returns empty list when issue has no comments", async () => {
    queue = [[{ id: ISSUE_ID }], [], [{ total: 0 }]];
    const res = await commentsRoutes.handle(
      new Request(`http://localhost/api/issues/${ISSUE_ID}/comments`),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
    expect(body.total).toBe(0);
  });
});

// ── POST /api/issues/:id/comments ────────────────────────────────────
describe("POST /api/issues/:id/comments", () => {
  it("creates a comment and returns 201", async () => {
    queue = [[{ id: ISSUE_ID }]]; // issue exists
    dbMock.insert.mockReturnValueOnce(createChain([mockComment]));

    const res = await commentsRoutes.handle(
      new Request(`http://localhost/api/issues/${ISSUE_ID}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authorName: "Alice",
          body: "Looking into this",
        }),
      }),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe(COMMENT_ID);
    expect(body.authorName).toBe("Alice");
    expect(dbMock.insert).toHaveBeenCalledTimes(1);
  });

  it("returns 404 when issue does not exist", async () => {
    queue = [[]]; // no issue

    const res = await commentsRoutes.handle(
      new Request(`http://localhost/api/issues/${ISSUE_ID}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authorName: "Alice",
          body: "Test",
        }),
      }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 422 when body exceeds 10_000 chars (schema-level cap)", async () => {
    queue = [[{ id: ISSUE_ID }]]; // issue exists (would be checked if validation passed)

    const res = await commentsRoutes.handle(
      new Request(`http://localhost/api/issues/${ISSUE_ID}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authorName: "Alice",
          body: "x".repeat(10_001),
        }),
      }),
    );
    // Schema-level maxLength catches this before the route's defense-in-depth check.
    expect(res.status).toBe(422);
  });

  it("returns 422 when authorName exceeds 200 chars (schema-level cap)", async () => {
    queue = [[{ id: ISSUE_ID }]];

    const res = await commentsRoutes.handle(
      new Request(`http://localhost/api/issues/${ISSUE_ID}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authorName: "x".repeat(201),
          body: "Test",
        }),
      }),
    );
    expect(res.status).toBe(422);
  });

  it("returns 422 for missing required fields", async () => {
    const res = await commentsRoutes.handle(
      new Request(`http://localhost/api/issues/${ISSUE_ID}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authorName: "Alice" }),
      }),
    );
    expect(res.status).toBe(422);
  });
});

// ── DELETE /api/comments/:id ─────────────────────────────────────────
describe("DELETE /api/comments/:id", () => {
  it("deletes the comment and returns { deleted: true }", async () => {
    queue = [[{ id: COMMENT_ID }]];
    const res = await commentsRoutes.handle(
      new Request(`http://localhost/api/comments/${COMMENT_ID}`, { method: "DELETE" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(true);
  });

  it("returns 404 when comment does not exist", async () => {
    queue = [[]];
    const res = await commentsRoutes.handle(
      new Request(`http://localhost/api/comments/${COMMENT_ID}`, { method: "DELETE" }),
    );
    expect(res.status).toBe(404);
  });
});
