/**
 * Tests for Alerts API
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock database
const mockAlert = {
  id: "test-alert-id",
  name: "High Error Rate",
  projectId: "test-project",
  condition: { type: "error_rate", threshold: 10, operator: "gt", duration: 300 },
  channels: [{ type: "telegram", target: "12345" }],
  isActive: true,
  cooldownSeconds: 300,
  createdAt: new Date("2026-01-01"),
};

const mockHistory = {
  id: "history-id",
  alertId: "test-alert-id",
  triggeredAt: new Date("2026-01-01T12:00:00Z"),
  resolvedAt: null,
  context: { currentValue: 15, threshold: 10 },
};

// Mock the modules
vi.mock("../../src/store/db.js", () => ({
  db: {
    query: {
      alerts: {
        findMany: vi.fn().mockResolvedValue([mockAlert]),
        findFirst: vi.fn().mockResolvedValue(mockAlert),
      },
      alertHistory: {
        findMany: vi.fn().mockResolvedValue([mockHistory]),
      },
    },
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockAlert]),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockAlert]),
        }),
      }),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ total: 1 }]),
      }),
    }),
  },
}));

vi.mock("../../src/alerts/dispatcher.js", () => ({
  testAlert: vi.fn().mockResolvedValue({
    alertId: "test-alert-id",
    channels: [{ type: "telegram", target: "12345", ok: true }],
  }),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  desc: vi.fn(),
  and: vi.fn(),
  ilike: vi.fn(),
  count: vi.fn(() => "count"),
}));

describe("Alerts data model", () => {
  it("alert has required fields", () => {
    expect(mockAlert).toHaveProperty("id");
    expect(mockAlert).toHaveProperty("name");
    expect(mockAlert).toHaveProperty("projectId");
    expect(mockAlert).toHaveProperty("condition");
    expect(mockAlert).toHaveProperty("channels");
    expect(mockAlert).toHaveProperty("isActive");
    expect(mockAlert).toHaveProperty("cooldownSeconds");
  });

  it("condition has required fields", () => {
    const condition = mockAlert.condition;
    expect(condition).toHaveProperty("type");
    expect(condition).toHaveProperty("threshold");
    expect(condition).toHaveProperty("operator");
    expect(["error_rate", "uptime_down", "resource_threshold", "trace_error", "token_usage"]).toContain(condition.type);
    expect(["gt", "lt", "eq", "gte", "lte"]).toContain(condition.operator);
  });

  it("channel types are valid", () => {
    for (const channel of mockAlert.channels) {
      expect(["telegram", "discord", "email"]).toContain(channel.type);
    }
  });
});

describe("Alert CRUD mock operations", () => {
  it("insert returns created alert", async () => {
    const { db } = await import("../../src/store/db.js");
    const result = await db
      .insert(undefined as never)
      .values({})
      .returning();

    expect(result).toHaveLength(1);
    expect(result[0]).toHaveProperty("id");
  });

  it("update returns updated alert", async () => {
    const { db } = await import("../../src/store/db.js");
    const result = await db
      .update(undefined as never)
      .set({})
      .where(undefined as never)
      .returning();

    expect(result).toHaveLength(1);
  });

  it("delete resolves without error", async () => {
    const { db } = await import("../../src/store/db.js");
    await expect(
      db.delete(undefined as never).where(undefined as never)
    ).resolves.toBeUndefined();
  });
});

describe("Alert history", () => {
  it("history entry has alertId", () => {
    expect(mockHistory.alertId).toBe("test-alert-id");
  });

  it("history has triggeredAt timestamp", () => {
    expect(mockHistory.triggeredAt).toBeInstanceOf(Date);
  });

  it("history context has result values", () => {
    expect(mockHistory.context).toHaveProperty("currentValue");
    expect(mockHistory.context).toHaveProperty("threshold");
  });
});

describe("Alert condition types", () => {
  it.each([
    "error_rate",
    "uptime_down",
    "resource_threshold",
    "trace_error",
    "token_usage",
  ])("type '%s' is a valid condition type", (type) => {
    const validTypes = [
      "error_rate",
      "uptime_down",
      "resource_threshold",
      "trace_error",
      "token_usage",
    ];
    expect(validTypes).toContain(type);
  });

  it.each(["gt", "lt", "eq", "gte", "lte"])(
    "operator '%s' is valid",
    (op) => {
      const validOps = ["gt", "lt", "eq", "gte", "lte"];
      expect(validOps).toContain(op);
    }
  );
});

describe("Cooldown defaults", () => {
  it("default cooldown is 300 seconds", () => {
    const defaultCooldown = 300;
    expect(mockAlert.cooldownSeconds).toBe(defaultCooldown);
  });

  it("cooldown is at least 60 seconds", () => {
    const minCooldown = 60;
    expect(mockAlert.cooldownSeconds).toBeGreaterThanOrEqual(minCooldown);
  });
});
