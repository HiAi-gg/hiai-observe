/**
 * Tests for /api/events (list + detail).
 *
 * The events endpoint surfaces individual error events with optional filters
 * (issueId, projectId, pagination). Detail endpoint fetches a single event by
 * id and returns 404 when missing.
 *
 * Coverage:
 *   - Happy path: list with default pagination
 *   - Filter by issueId
 *   - Filter by projectId
 *   - Custom limit
 *   - Empty result set
 *   - Detail by ID (200)
 *   - Detail 404 for missing event
 *   - Auth rejection (no API key → 401)
 */

import { Elysia } from "elysia";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Constants ────────────────────────────────────────────────────────
const EVENT_ID = "770e8400-e29b-41d4-a716-446655440002";
const ISSUE_ID = "550e8400-e29b-41d4-a716-446655440000";
const PROJECT_ID = "660e8400-e29b-41d4-a716-446655440001";

// ── Drizzle chain helpers ────────────────────────────────────────────
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
    "groupBy",
  ]) {
    chain[m] = vi.fn(() => chain);
  }
  chain.then = (resolve: Function, reject?: Function) =>
    Promise.resolve(result).then(resolve, reject ?? ((v) => v as never));
  return chain;
}

// ── Queue-based mock so parallel Promise.all() gets rows + count in order ──
let queue: any[][] = [];
const enqueue = (...results: any[][]) => queue.push(...results);

const dbMock = {
  select: vi.fn(() => {
    const next = queue.shift() ?? [];
    return makeChain(next);
  }),
  insert: vi.fn(() => makeChain([])),
  update: vi.fn(() => makeChain([])),
  delete: vi.fn(() => makeChain(undefined)),
};

vi.mock("../../src/store/db.js", () => ({ db: dbMock }));

// auth — mock resolveApiKey/lookupProject so authGuard falls through to 401
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

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col: any, val: any) => ({ col, val, op: "eq" })),
  and: vi.fn((...args: any[]) => ({ args, op: "and" })),
  desc: vi.fn((col: any) => ({ col, op: "desc" })),
  count: vi.fn(() => ({ op: "count" })),
  gte: vi.fn((col: any, val: any) => ({ col, val, op: "gte" })),
  sql: vi.fn((strings: TemplateStringsArray, ...values: any[]) => ({
    op: "sql",
    strings,
    values,
  })),
}));

// silence logger
vi.mock("../../src/lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { eventsPlugin } = await import("../../src/api/events.js");
const { authGuard } = await import("../../src/middleware/auth.js");

function appWithAuth(): Elysia {
  return new Elysia().onBeforeHandle(authGuard).use(eventsPlugin);
}

beforeEach(() => {
  queue = [];
  dbMock.select.mockClear();
});

// ── Auth rejection ───────────────────────────────────────────────────
describe("GET /api/events (auth)", () => {
  it("returns 401 without API key", async () => {
    const app = appWithAuth();
    const res = await app.handle(new Request("http://localhost/api/events"));
    expect(res.status).toBe(401);
  });
});

// ── List endpoint ────────────────────────────────────────────────────
describe("GET /api/events (list)", () => {
  it("returns events with default pagination (limit=50, offset=0)", async () => {
    const evt1 = {
      id: EVENT_ID,
      issueId: ISSUE_ID,
      projectId: PROJECT_ID,
      message: "boom",
      level: "error",
      createdAt: new Date("2026-01-15"),
    };
    const evt2 = {
      id: "event-2",
      issueId: ISSUE_ID,
      projectId: PROJECT_ID,
      message: "second",
      level: "warning",
      createdAt: new Date("2026-01-14"),
    };

    // Promise.all([rows, count])
    enqueue([evt1, evt2], [{ value: 2 }]);

    const res = await eventsPlugin.handle(new Request("http://localhost/api/events"));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.data).toHaveLength(2);
    expect(body.data[0].id).toBe(EVENT_ID);
    expect(body.total).toBe(2);
    expect(body.limit).toBe(50);
    expect(body.offset).toBe(0);
  });

  it("filters by issueId", async () => {
    enqueue([], [{ value: 0 }]);

    const res = await eventsPlugin.handle(
      new Request(`http://localhost/api/events?issueId=${ISSUE_ID}`),
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.data).toEqual([]);
    expect(body.total).toBe(0);
    expect(body.limit).toBe(50);
    expect(body.offset).toBe(0);
  });

  it("filters by projectId", async () => {
    const evt = {
      id: "event-proj",
      issueId: ISSUE_ID,
      projectId: PROJECT_ID,
      message: "project-scoped",
      level: "info",
      createdAt: new Date("2026-01-15"),
    };

    enqueue([evt], [{ value: 1 }]);

    const res = await eventsPlugin.handle(
      new Request(`http://localhost/api/events?projectId=${PROJECT_ID}`),
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.data).toHaveLength(1);
    expect(body.data[0].projectId).toBe(PROJECT_ID);
    expect(body.total).toBe(1);
  });

  it("respects custom limit", async () => {
    enqueue([], [{ value: 0 }]);

    const res = await eventsPlugin.handle(new Request(`http://localhost/api/events?limit=10`));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.limit).toBe(10);
    expect(body.offset).toBe(0);
    expect(body.data).toEqual([]);
  });

  it("returns empty data when no events match", async () => {
    enqueue([], [{ value: 0 }]);

    const res = await eventsPlugin.handle(new Request("http://localhost/api/events"));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.data).toEqual([]);
    expect(body.total).toBe(0);
    expect(body.limit).toBe(50);
    expect(body.offset).toBe(0);
  });
});

// ── Detail endpoint ──────────────────────────────────────────────────
describe("GET /api/events/:id (detail)", () => {
  it("returns event detail by ID", async () => {
    const evt = {
      id: EVENT_ID,
      issueId: ISSUE_ID,
      projectId: PROJECT_ID,
      message: "Cannot read property 'x' of undefined",
      exceptionType: "TypeError",
      level: "error",
      createdAt: new Date("2026-01-15"),
    };

    enqueue([evt]);

    const res = await eventsPlugin.handle(new Request(`http://localhost/api/events/${EVENT_ID}`));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.id).toBe(EVENT_ID);
    expect(body.issueId).toBe(ISSUE_ID);
    expect(body.message).toBe("Cannot read property 'x' of undefined");
    expect(body.level).toBe("error");
  });

  it("returns 404 when event is not found", async () => {
    enqueue([]);

    const res = await eventsPlugin.handle(new Request(`http://localhost/api/events/${EVENT_ID}`));
    expect(res.status).toBe(404);
    const body = await res.json();

    expect(body.error).toBe("Event not found");
  });
});
