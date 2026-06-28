import { beforeEach, describe, expect, it, vi } from "vitest";

const ALERT_ID = "550e8400-e29b-41d4-a716-446655440000";
const PROJECT_ID = "660e8400-e29b-41d4-a716-446655440001";

// ── Mock data ─────────────────────────────────────────────────────────
const mockAlert = {
  id: ALERT_ID,
  projectId: PROJECT_ID,
  name: "High Error Rate",
  severity: "warning",
  condition: { type: "error_rate", threshold: 10, operator: "gt", duration: 300 },
  channels: [{ type: "telegram", target: "12345" }],
  isActive: true,
  cooldownSeconds: 300,
  escalationMinutes: null,
  lastTriggered: null,
  createdAt: new Date("2026-01-01"),
};

const mockHistoryEntry = {
  id: "history-1",
  alertId: ALERT_ID,
  triggeredAt: new Date("2026-01-15T12:00:00Z"),
  resolvedAt: null,
  context: { currentValue: 15, threshold: 10 },
};

// ── Create a reusable chainable mock helper ───────────────────────────
function createChain(result: any) {
  const chain: any = {};
  const methods = [
    "from",
    "where",
    "orderBy",
    "limit",
    "offset",
    "returning",
    "set",
    "values",
    "for",
    "delete",
    "groupBy",
  ];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.then = (resolve: Function, reject?: Function) =>
    Promise.resolve(result).then(resolve, reject);
  return chain;
}

// ── Mock db ───────────────────────────────────────────────────────────
vi.mock("../../src/store/db.js", () => {
  const db: any = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn((fn: any) => fn(db)), // tx === db so mock chains apply inside transactions
  };
  return { db };
});

// ── Mock schema ───────────────────────────────────────────────────────
vi.mock("../../src/store/schema.js", () => ({
  alerts: {
    id: "id",
    projectId: "project_id",
    name: "name",
    isActive: "is_active",
    createdAt: "created_at",
    condition: "condition",
    channels: "channels",
    cooldownSeconds: "cooldown_seconds",
    severity: "severity",
    lastTriggered: "last_triggered",
    escalationMinutes: "escalation_minutes",
  },
  alertHistory: {
    id: "id",
    alertId: "alert_id",
    triggeredAt: "triggered_at",
    resolvedAt: "resolved_at",
    context: "context",
  },
}));

// ── Mock drizzle-orm ─────────────────────────────────────────────────
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col: any, val: any) => ({ col, val, op: "eq" })),
  and: vi.fn((...args: any[]) => ({ args, op: "and" })),
  ilike: vi.fn((col: any, val: any) => ({ col, val, op: "ilike" })),
  desc: vi.fn((col: any) => ({ col, op: "desc" })),
  count: vi.fn(() => ({ op: "count" })),
}));

// ── Mock dispatcher ──────────────────────────────────────────────────
vi.mock("../../src/alerts/dispatcher.js", () => ({
  testAlert: vi.fn().mockResolvedValue({
    alertId: "550e8400-e29b-41d4-a716-446655440000",
    channels: [{ type: "telegram", target: "12345", ok: true }],
  }),
}));

// ── Capture mocked modules ───────────────────────────────────────────
const dbModule = await import("../../src/store/db.js");
const dispatcherModule = await import("../../src/alerts/dispatcher.js");

// ── Import routes AFTER mocks ─────────────────────────────────────────
const { alertsRoutes } = await import("../../src/api/alerts.js");

// ── Helper: set up db.select to return results in sequence ───────────
function mockSelectSequence(results: any[]) {
  let callIdx = 0;
  vi.mocked(dbModule.db.select).mockImplementation(() => {
    const idx = callIdx++;
    return createChain(results[Math.min(idx, results.length - 1)]);
  });
}

function mockInsert(returningValue: any) {
  vi.mocked(dbModule.db.insert).mockReturnValue(createChain([returningValue]) as any);
}

function mockUpdate(returningValue: any[] = []) {
  vi.mocked(dbModule.db.update).mockReturnValue(createChain(returningValue) as any);
}

function mockDelete() {
  vi.mocked(dbModule.db.delete).mockReturnValue(createChain(undefined) as any);
}

describe("alerts API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Restore default testAlert behavior
    vi.mocked(dispatcherModule.testAlert).mockResolvedValue({
      alertId: ALERT_ID,
      channels: [{ type: "telegram", target: "12345", ok: true }],
    });
  });

  describe("POST /api/alerts/ (create)", () => {
    it("creates alert and returns 200 with data", async () => {
      mockInsert(mockAlert);

      const res = await alertsRoutes.handle(
        new Request("http://localhost/api/alerts/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "High Error Rate",
            projectId: PROJECT_ID,
            condition: {
              type: "error_rate",
              threshold: 10,
              operator: "gt",
              duration: 300,
            },
            channels: [{ type: "telegram", target: "12345" }],
          }),
        }),
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe(ALERT_ID);
      expect(body.name).toBe("High Error Rate");
    });

    it("uses default cooldown when not specified", async () => {
      mockInsert({ ...mockAlert, cooldownSeconds: 300 });

      const res = await alertsRoutes.handle(
        new Request("http://localhost/api/alerts/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Test Alert",
            projectId: PROJECT_ID,
            condition: {
              type: "error_rate",
              threshold: 10,
              operator: "gt",
            },
            channels: [{ type: "telegram", target: "12345" }],
          }),
        }),
      );

      expect(res.status).toBe(200);
    });
  });

  describe("GET /api/alerts/ (list)", () => {
    it("returns paginated alerts", async () => {
      // First select = items, second select = count
      mockSelectSequence([[mockAlert], [{ total: 1 }]]);

      const res = await alertsRoutes.handle(new Request("http://localhost/api/alerts/"));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.items).toHaveLength(1);
      expect(body.items[0].id).toBe(ALERT_ID);
      expect(body.total).toBe(1);
      expect(body.limit).toBe(50);
      expect(body.offset).toBe(0);
    });

    it("accepts query filters", async () => {
      mockSelectSequence([[mockAlert], [{ total: 1 }]]);

      const res = await alertsRoutes.handle(
        new Request(
          `http://localhost/api/alerts/?projectId=${PROJECT_ID}&search=Error&limit=10&offset=5`,
        ),
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.limit).toBe(10);
      expect(body.offset).toBe(5);
    });
  });

  describe("GET /api/alerts/:id (detail)", () => {
    it("returns alert with history", async () => {
      // First select = alert, second select = history
      mockSelectSequence([[mockAlert], [mockHistoryEntry]]);

      const res = await alertsRoutes.handle(new Request(`http://localhost/api/alerts/${ALERT_ID}`));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe(ALERT_ID);
      expect(body.name).toBe("High Error Rate");
      expect(body.history).toHaveLength(1);
      expect(body.history[0].id).toBe("history-1");
    });

    it("returns 404 for non-existent alert", async () => {
      mockSelectSequence([[]]);

      const res = await alertsRoutes.handle(new Request(`http://localhost/api/alerts/${ALERT_ID}`));

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Alert not found");
    });
  });

  describe("PUT /api/alerts/:id (update)", () => {
    it("updates alert name", async () => {
      const updated = { ...mockAlert, name: "Updated Alert Name" };
      // select for existence check, then update
      mockSelectSequence([[{ id: ALERT_ID }]]);
      mockUpdate([updated]);

      const res = await alertsRoutes.handle(
        new Request(`http://localhost/api/alerts/${ALERT_ID}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Updated Alert Name" }),
        }),
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.name).toBe("Updated Alert Name");
    });

    it("updates alert active status", async () => {
      const updated = { ...mockAlert, isActive: false };
      mockSelectSequence([[{ id: ALERT_ID }]]);
      mockUpdate([updated]);

      const res = await alertsRoutes.handle(
        new Request(`http://localhost/api/alerts/${ALERT_ID}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: false }),
        }),
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.isActive).toBe(false);
    });

    it("returns 404 for non-existent alert", async () => {
      mockSelectSequence([[]]);

      const res = await alertsRoutes.handle(
        new Request(`http://localhost/api/alerts/${ALERT_ID}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Updated" }),
        }),
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Alert not found");
    });
  });

  describe("DELETE /api/alerts/:id", () => {
    it("deletes alert and cascades to history", async () => {
      // select for existence check
      mockSelectSequence([[{ id: ALERT_ID }]]);
      mockDelete();

      const res = await alertsRoutes.handle(
        new Request(`http://localhost/api/alerts/${ALERT_ID}`, {
          method: "DELETE",
        }),
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.deleted).toBe(true);

      // Should delete history first, then alert
      expect(dbModule.db.delete).toHaveBeenCalledTimes(2);
    });

    it("returns 404 for non-existent alert", async () => {
      mockSelectSequence([[]]);

      const res = await alertsRoutes.handle(
        new Request(`http://localhost/api/alerts/${ALERT_ID}`, {
          method: "DELETE",
        }),
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Alert not found");
    });
  });

  describe("POST /api/alerts/:id/test (dispatch test)", () => {
    it("sends test alert and returns result", async () => {
      // select returns the alert
      mockSelectSequence([[mockAlert]]);

      const res = await alertsRoutes.handle(
        new Request(`http://localhost/api/alerts/${ALERT_ID}/test`, {
          method: "POST",
        }),
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.alertId).toBe(ALERT_ID);
      expect(body.channels).toHaveLength(1);
      expect(body.channels[0].ok).toBe(true);

      // Verify testAlert was called with the right rule
      expect(dispatcherModule.testAlert).toHaveBeenCalledTimes(1);
      const calledRule = vi.mocked(dispatcherModule.testAlert).mock.calls[0][0];
      expect(calledRule.id).toBe(ALERT_ID);
      expect(calledRule.name).toBe("High Error Rate");
    });

    it("returns 404 for non-existent alert", async () => {
      mockSelectSequence([[]]);

      const res = await alertsRoutes.handle(
        new Request(`http://localhost/api/alerts/${ALERT_ID}/test`, {
          method: "POST",
        }),
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Alert not found");
    });
  });

  describe("GET /api/alerts/history", () => {
    it("returns alert history", async () => {
      // First select = items, second select = count
      mockSelectSequence([[mockHistoryEntry], [{ total: 1 }]]);

      const res = await alertsRoutes.handle(
        new Request(`http://localhost/api/alerts/history?alertId=${ALERT_ID}`),
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.items).toHaveLength(1);
      expect(body.items[0].alertId).toBe(ALERT_ID);
    });
  });

  describe("GET /api/alerts/channels", () => {
    it("returns available notification channels", async () => {
      const res = await alertsRoutes.handle(new Request("http://localhost/api/alerts/channels"));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.channels).toBeDefined();
      expect(body.channels.length).toBeGreaterThanOrEqual(3);

      const types = body.channels.map((c: any) => c.type);
      expect(types).toContain("telegram");
      expect(types).toContain("discord");
      expect(types).toContain("email");
    });
  });
});
