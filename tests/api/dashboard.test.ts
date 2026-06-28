/**
 * Tests for /api/dashboard (aggregation endpoint).
 *
 * The dashboard endpoint aggregates error counts, trace counts, recent issues,
 * active monitors, active alerts, hourly buckets, and recent events into a
 * single overview response. It is the primary OBS2.4 contract that
 * hiai-admin / hiai-dashboard consume for the operator overview tile.
 *
 * Coverage:
 *   - Happy path: returns the canonical aggregated payload
 *   - Project-scoped (projectId filter)
 *   - Tenant alias (tenantId) accepted as alternative to projectId
 *   - Health status derivation (healthy / degraded / down / no-monitor)
 *   - Uptime helper integration
 *   - Auth rejection (no API key → 401)
 *   - Bucket fill for sparkline data (24 hourly buckets always returned)
 */

import { Elysia } from "elysia";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Constants ────────────────────────────────────────────────────────
const PROJECT_ID = "660e8400-e29b-41d4-a716-446655440001";
const MONITOR_UP = "mon-up";
const MONITOR_DEGRADED = "mon-degraded";
const MONITOR_DOWN = "mon-down";

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
  // selectDistinctOn is called on db directly, not on the chain
  chain.then = (resolve: Function, reject?: Function) =>
    Promise.resolve(result).then(resolve, reject ?? ((v) => v as never));
  return chain;
}

// ── Queue-based mock so parallel Promise.all() in dashboard gets 10 distinct results ──
let queue: any[][] = [];
const enqueue = (...results: any[][]) => queue.push(...results);

const dbMock = {
  select: vi.fn(() => {
    const next = queue.shift() ?? [];
    return makeChain(next);
  }),
  selectDistinctOn: vi.fn(() => {
    const next = queue.shift() ?? [];
    return makeChain(next);
  }),
  insert: vi.fn(() => makeChain([])),
  update: vi.fn(() => makeChain([])),
  delete: vi.fn(() => makeChain(undefined)),
};

vi.mock("../../src/store/db.js", () => ({ db: dbMock }));

// uptime helper — return deterministic uptime map
const uptimeMap = new Map<string, number>([
  [MONITOR_UP, 99.95],
  [MONITOR_DEGRADED, 99.5],
  [MONITOR_DOWN, 50.0],
]);
vi.mock("../../src/store/uptime.js", () => ({
  getUptimePercentages: vi.fn(async (ids: string[]) => {
    const m = new Map<string, number>();
    for (const id of ids) m.set(id, uptimeMap.get(id) ?? 100);
    return m;
  }),
}));

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

const { dashboardRoutes } = await import("../../src/api/dashboard.js");
const { authGuard } = await import("../../src/middleware/auth.js");

function appWithAuth(): Elysia {
  return new Elysia().onBeforeHandle(authGuard).use(dashboardRoutes);
}

beforeEach(() => {
  queue = [];
  dbMock.select.mockClear();
  dbMock.selectDistinctOn.mockClear();
});

// ── Auth rejection ───────────────────────────────────────────────────
describe("GET /api/dashboard (auth)", () => {
  it("returns 401 without API key", async () => {
    const app = appWithAuth();
    const res = await app.handle(new Request("http://localhost/api/dashboard/"));
    expect(res.status).toBe(401);
  });
});

// ── Happy path ───────────────────────────────────────────────────────
describe("GET /api/dashboard/ (direct plugin)", () => {
  it("returns aggregated overview with zero data when DB is empty", async () => {
    // The dashboard handler runs Promise.all over 9 select calls then
    // a 10th selectDistinctOn for activeContainers. Queue them in any order
    // — the handler reads results independently from each Promise.
    enqueue(
      [{ value: 0 }], // 1: errorCount24h
      [{ value: 0 }], // 2: traceCount24h
      [], // 3: recentIssues
      [], // 4: monitors
      [{ value: 0 }], // 5: activeAlerts
      [], // 6: errorBuckets
      [], // 7: traceBuckets
      [], // 8: recentEvents
      [{ value: 0 }], // 9: projectsCount
      [], // 10: latestContainers (selectDistinctOn)
    );

    const res = await dashboardRoutes.handle(new Request("http://localhost/api/dashboard/"));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.projectsCount).toBe(0);
    expect(body.activeIssues).toBe(0);
    expect(body.activeAlerts).toBe(0);
    expect(body.errorCount24h).toBe(0);
    expect(body.traceCount24h).toBe(0);
    expect(body.uptimePercent).toBe(100); // no monitors → default healthy
    expect(body.healthStatus).toBe("healthy");
    expect(body.monitors).toEqual([]);
    expect(body.monitorStatuses).toEqual([]);
    expect(body.recentIssues).toEqual([]);
    expect(body.recentEvents).toEqual([]);
  });

  it("returns full payload shape with populated data", async () => {
    const now = new Date();
    const recentIssue = {
      id: "issue-1",
      title: "TypeError",
      type: "error",
      count: 5,
      status: "unresolved",
      lastSeen: now,
    };
    const monitorUp = { id: MONITOR_UP, name: "API", url: "https://api/", active: true };
    const monitorDown = { id: MONITOR_DOWN, name: "Web", url: "https://web/", active: true };

    enqueue(
      [{ value: 42 }], // 1: errorCount24h
      [{ value: 100 }], // 2: traceCount24h
      [recentIssue], // 3: recentIssues
      [monitorUp, monitorDown], // 4: monitors
      [{ value: 3 }], // 5: activeAlerts
      [], // 6: errorBuckets
      [], // 7: traceBuckets
      [
        {
          id: "evt-1",
          projectId: PROJECT_ID,
          message: "boom",
          level: "error",
          createdAt: now,
        },
      ], // 8: recentEvents
      [{ value: 1 }], // 9: projectsCount
      [{ containerId: "c1", status: "running" }], // 10: latestContainers
    );

    const res = await dashboardRoutes.handle(new Request("http://localhost/api/dashboard/"));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.projectsCount).toBe(1);
    expect(body.activeIssues).toBe(1);
    expect(body.activeAlerts).toBe(3);
    expect(body.errorCount24h).toBe(42);
    expect(body.traceCount24h).toBe(100);
    expect(body.activeContainers).toBe(1);
    expect(body.recentIssues).toHaveLength(1);
    expect(body.recentEvents).toHaveLength(1);
    expect(body.monitors).toHaveLength(2);
    expect(body.monitors[0].id).toBe(MONITOR_UP);
    expect(body.monitors[0].uptime24h).toBe(99.95);
    expect(body.monitors[0].isUp).toBe(true);
    expect(body.monitorStatuses).toHaveLength(2);
  });

  it("derives healthStatus=degraded when one monitor has uptime < 99.9%", async () => {
    enqueue(
      [{ value: 0 }],
      [{ value: 0 }],
      [],
      [{ id: MONITOR_DEGRADED, name: "Degraded", url: "https://x", active: true }],
      [{ value: 0 }],
      [],
      [],
      [],
      [{ value: 1 }],
      [],
    );

    const res = await dashboardRoutes.handle(new Request("http://localhost/api/dashboard/"));
    const body = await res.json();
    expect(body.healthStatus).toBe("degraded");
  });

  it("derives healthStatus=down when a monitor has uptime < 99.0%", async () => {
    enqueue(
      [{ value: 0 }],
      [{ value: 0 }],
      [],
      [{ id: MONITOR_DOWN, name: "Down", url: "https://x", active: true }],
      [{ value: 0 }],
      [],
      [],
      [],
      [{ value: 1 }],
      [],
    );

    const res = await dashboardRoutes.handle(new Request("http://localhost/api/dashboard/"));
    const body = await res.json();
    expect(body.healthStatus).toBe("down");
  });

  it("returns 24 hourly buckets each for errors and traces (zero-fills missing)", async () => {
    enqueue([{ value: 1 }], [{ value: 1 }], [], [], [{ value: 0 }], [], [], [], [{ value: 0 }], []);

    const res = await dashboardRoutes.handle(new Request("http://localhost/api/dashboard/"));
    const body = await res.json();

    expect(body.errorBuckets).toHaveLength(24);
    expect(body.traceBuckets).toHaveLength(24);
    for (const b of body.errorBuckets) {
      expect(b).toHaveProperty("hour");
      expect(b).toHaveProperty("count");
      expect(b.count).toBe(0);
    }
  });

  it("accepts tenantId alias for projectId", async () => {
    enqueue([{ value: 0 }], [{ value: 0 }], [], [], [{ value: 0 }], [], [], [], [{ value: 1 }], []);

    const res = await dashboardRoutes.handle(
      new Request("http://localhost/api/dashboard/?tenantId=acme"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    // When projectId/tenantId is set, projectsCount is normalized to 1
    expect(body.projectsCount).toBe(1);
  });

  it("accepts explicit projectId query parameter", async () => {
    enqueue([{ value: 0 }], [{ value: 0 }], [], [], [{ value: 0 }], [], [], [], [{ value: 1 }], []);

    const res = await dashboardRoutes.handle(
      new Request(`http://localhost/api/dashboard/?projectId=${PROJECT_ID}`),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.projectsCount).toBe(1);
  });
});
