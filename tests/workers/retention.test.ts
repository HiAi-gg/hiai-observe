/**
 * Tests for Retention Worker
 * - Batch deletion (5000-row batches)
 * - Per-table retention config
 * - Admin endpoint requires ADMIN_API_KEY
 */

import { Elysia } from "elysia";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Set admin key before module import
process.env.ADMIN_API_KEY = "test-admin-key";

// ── Mock DB ──────────────────────────────────────────────────────────────
// Drizzle chains are thenable: db.select().from(table) resolves to rows[].
// We use a queue to control what each db.select() call resolves to.

let selectQueue: unknown[][] = [];
let selectIndex = 0;
let executeResults: unknown[] = [];
let executeIndex = 0;

function createThenableChain(rows: unknown[]) {
  const promise = Promise.resolve(rows);
  return Object.assign(promise, {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
  });
}

vi.mock("../../src/store/db.js", () => ({
  db: {
    select: vi.fn(() => {
      const rows = selectQueue[selectIndex] ?? [];
      selectIndex++;
      return createThenableChain(rows);
    }),
    execute: vi.fn(async () => {
      const result = executeResults[executeIndex] ?? [];
      executeIndex++;
      return result;
    }),
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
    })),
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a: unknown, b: unknown) => ({ type: "eq", left: a, right: b })),
  lt: vi.fn(),
  sql: Object.assign(
    vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
      strings,
      values,
    })),
    {
      raw: vi.fn((s: string) => s),
      identifier: vi.fn((name: string) => ({ type: "identifier", name })),
    },
  ),
}));

const { db } = await import("../../src/store/db.js");

beforeEach(() => {
  selectQueue = [];
  selectIndex = 0;
  executeResults = [];
  executeIndex = 0;
  vi.clearAllMocks();
  // Reset module cache so each test re-evaluates `config` from current process.env
  vi.resetModules();
});

// ── Batch deletion ───────────────────────────────────────────────────────
describe("batch deletion", () => {
  it("stops after one batch when deleted < BATCH_SIZE", async () => {
    // 7 tables: each getRetentionDays returns [] (default 30 days)
    selectQueue = Array(7).fill([]);
    // 7 tables: each batchDelete execute returns 100 rows (< 5000)
    executeResults = Array(7).fill(Array(100).fill({ id: "x" }));

    process.env.ADMIN_API_KEY = "test-admin-key";
    const { adminRoutes } = await import("../../src/workers/retention.js");

    // Wrap in full Elysia app so headers are properly forwarded
    const { Elysia } = await import("elysia");
    const testApp = new Elysia().use(adminRoutes);

    const res = await testApp.handle(
      new Request("http://localhost/api/admin/cleanup", {
        method: "POST",
        headers: { Authorization: "Bearer test-admin-key" },
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe("Cleanup complete");
  });

  it("processes multiple batches until deleted < 5000", async () => {
    const fullBatch = Array(5000).fill({ id: "x" });
    const partialBatch = Array(200).fill({ id: "y" });

    // 7 tables: getRetentionDays returns [] (default 30 days)
    selectQueue = Array(7).fill([]);
    // First table: full batch (5000) then partial (200). Others: single partial.
    executeResults = [
      fullBatch, // table 1, batch 1 (5000 → continue)
      partialBatch, // table 1, batch 2 (200 → stop)
      partialBatch, // table 2
      partialBatch, // table 3
      partialBatch, // table 4
      partialBatch, // table 5
      partialBatch, // table 6
      partialBatch, // table 7
    ];

    const { adminRoutes } = await import("../../src/workers/retention.js");
    process.env.ADMIN_API_KEY = "test-admin-key";

    const res = await new Elysia().use(adminRoutes).handle(
      new Request("http://localhost/api/admin/cleanup", {
        method: "POST",
        headers: { Authorization: "Bearer test-admin-key" },
      }),
    );

    expect(res.status).toBe(200);
    // First table used 2 execute calls, others 1 each = 8 total
    expect(db.execute).toHaveBeenCalledTimes(8);
  });

  it("handles zero deletions gracefully", async () => {
    selectQueue = Array(7).fill([]);
    // Each execute returns empty (0 rows deleted → stop immediately)
    executeResults = Array(7).fill([]);

    const { adminRoutes } = await import("../../src/workers/retention.js");
    process.env.ADMIN_API_KEY = "test-admin-key";

    const res = await new Elysia().use(adminRoutes).handle(
      new Request("http://localhost/api/admin/cleanup", {
        method: "POST",
        headers: { Authorization: "Bearer test-admin-key" },
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe("Cleanup complete");
  });
});

// ── Per-table retention config ───────────────────────────────────────────
describe("per-table retention config", () => {
  it("uses default retention (30 days) when no DB config", async () => {
    // GET /retention: db.select().from(retentionConfig) → empty array
    selectQueue = [[]];

    const { adminRoutes } = await import("../../src/workers/retention.js");
    process.env.ADMIN_API_KEY = "test-admin-key";

    const res = await new Elysia().use(adminRoutes).handle(
      new Request("http://localhost/api/admin/retention", {
        headers: { Authorization: "Bearer test-admin-key" },
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.defaultDays).toBe(30);
    expect(body.tables).toHaveLength(7);
    expect(body.tables[0].retentionDays).toBe(30);
  });

  it("returns per-table retention from DB config", async () => {
    const configRows = [
      { tableName: "events", retentionDays: 7 },
      { tableName: "traces", retentionDays: 14 },
    ];
    selectQueue = [configRows];

    const { adminRoutes } = await import("../../src/workers/retention.js");
    process.env.ADMIN_API_KEY = "test-admin-key";

    const res = await new Elysia().use(adminRoutes).handle(
      new Request("http://localhost/api/admin/retention", {
        headers: { Authorization: "Bearer test-admin-key" },
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tables).toHaveLength(7);

    const eventsConfig = body.tables.find((t: { tableName: string }) => t.tableName === "events");
    const tracesConfig = body.tables.find((t: { tableName: string }) => t.tableName === "traces");
    const logsConfig = body.tables.find((t: { tableName: string }) => t.tableName === "logs");

    expect(eventsConfig.retentionDays).toBe(7);
    expect(tracesConfig.retentionDays).toBe(14);
    expect(logsConfig.retentionDays).toBe(30); // falls back to default
  });

  it("lists all 7 tables", async () => {
    selectQueue = [[]];

    const { adminRoutes } = await import("../../src/workers/retention.js");
    process.env.ADMIN_API_KEY = "test-admin-key";

    const res = await new Elysia().use(adminRoutes).handle(
      new Request("http://localhost/api/admin/retention", {
        headers: { Authorization: "Bearer test-admin-key" },
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    const tableNames = body.tables.map((t: { tableName: string }) => t.tableName);
    expect(tableNames).toEqual([
      "events",
      "traces",
      "logs",
      "container_stats",
      "host_stats",
      "uptime_checks",
      "alert_history",
    ]);
  });
});

// ── Admin API key protection ─────────────────────────────────────────────
describe("admin endpoint auth", () => {
  it("returns 401 when Authorization header is missing", async () => {
    const { adminRoutes } = await import("../../src/workers/retention.js");
    process.env.ADMIN_API_KEY = "test-admin-key";

    const res = await new Elysia()
      .use(adminRoutes)
      .handle(new Request("http://localhost/api/admin/cleanup", { method: "POST" }));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain("admin API key");
  });

  it("returns 401 when Authorization key is wrong", async () => {
    const { adminRoutes } = await import("../../src/workers/retention.js");
    process.env.ADMIN_API_KEY = "test-admin-key";

    const res = await new Elysia().use(adminRoutes).handle(
      new Request("http://localhost/api/admin/cleanup", {
        method: "POST",
        headers: { Authorization: "Bearer wrong-key" },
      }),
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Invalid admin API key");
  });

  it("returns 403 when ADMIN_API_KEY is not set", async () => {
    const savedKey = process.env.ADMIN_API_KEY;
    delete process.env.ADMIN_API_KEY;

    const { adminRoutes } = await import("../../src/workers/retention.js");

    // Wrap in full Elysia app so headers are properly forwarded
    const { Elysia } = await import("elysia");
    const testApp = new Elysia().use(adminRoutes);

    const res = await testApp.handle(
      new Request("http://localhost/api/admin/cleanup", {
        method: "POST",
        headers: { Authorization: "Bearer any-key" },
      }),
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("Admin API key not configured");

    if (savedKey) process.env.ADMIN_API_KEY = savedKey;
  });

  it("accepts correct Bearer token", async () => {
    selectQueue = Array(7).fill([]);
    executeResults = Array(7).fill([]);

    process.env.ADMIN_API_KEY = "correct-key";
    const { adminRoutes } = await import("../../src/workers/retention.js");

    const res = await new Elysia().use(adminRoutes).handle(
      new Request("http://localhost/api/admin/cleanup", {
        method: "POST",
        headers: { Authorization: "Bearer correct-key" },
      }),
    );

    expect(res.status).toBe(200);
  });

  it("accepts raw token without Bearer prefix", async () => {
    selectQueue = Array(7).fill([]);
    executeResults = Array(7).fill([]);

    process.env.ADMIN_API_KEY = "raw-token";
    const { adminRoutes } = await import("../../src/workers/retention.js");

    const res = await new Elysia().use(adminRoutes).handle(
      new Request("http://localhost/api/admin/cleanup", {
        method: "POST",
        headers: { Authorization: "raw-token" },
      }),
    );

    expect(res.status).toBe(200);
  });

  it("protects GET /retention endpoint", async () => {
    process.env.ADMIN_API_KEY = "test-key";
    const { adminRoutes } = await import("../../src/workers/retention.js");

    const res = await new Elysia()
      .use(adminRoutes)
      .handle(new Request("http://localhost/api/admin/retention"));

    expect(res.status).toBe(401);
  });
});

// ── PUT /retention/:table ────────────────────────────────────────────────
describe("PUT /api/admin/retention/:table", () => {
  it("creates new config when none exists", async () => {
    // db.select().from(...).where(...).limit(1) → [] (no existing config)
    selectQueue = [[]];

    process.env.ADMIN_API_KEY = "test-key";
    const { adminRoutes } = await import("../../src/workers/retention.js");

    const res = await new Elysia().use(adminRoutes).handle(
      new Request("http://localhost/api/admin/retention/events", {
        method: "PUT",
        headers: {
          Authorization: "Bearer test-key",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ retentionDays: 14 }),
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tableName).toBe("events");
    expect(body.retentionDays).toBe(14);
  });

  it("returns 400 for invalid table name", async () => {
    process.env.ADMIN_API_KEY = "test-key";
    const { adminRoutes } = await import("../../src/workers/retention.js");

    const res = await new Elysia().use(adminRoutes).handle(
      new Request("http://localhost/api/admin/retention/invalid_table", {
        method: "PUT",
        headers: {
          Authorization: "Bearer test-key",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ retentionDays: 7 }),
      }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid table");
  });
});
