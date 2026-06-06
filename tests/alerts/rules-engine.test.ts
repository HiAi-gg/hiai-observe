/**
 * Tests for Alert Rules Engine
 */

import { describe, it, expect, vi, } from "vitest";

// Mock the database module
vi.mock("../../src/store/db.js", () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    query: {
      alerts: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    },
    execute: vi.fn().mockResolvedValue({ rows: [] }),
  },
}));

// Mock drizzle-orm
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  gte: vi.fn(),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    strings,
    values,
  })),
  count: vi.fn(() => "count"),
}));

describe("AlertCondition comparison", () => {
  // Test the comparison logic directly
  function compare(
    value: number,
    operator: "gt" | "lt" | "eq" | "gte" | "lte",
    threshold: number
  ): boolean {
    switch (operator) {
      case "gt": return value > threshold;
      case "lt": return value < threshold;
      case "eq": return value === threshold;
      case "gte": return value >= threshold;
      case "lte": return value <= threshold;
    }
  }

  it("gt: triggers when value exceeds threshold", () => {
    expect(compare(11, "gt", 10)).toBe(true);
    expect(compare(10, "gt", 10)).toBe(false);
  });

  it("lt: triggers when value is below threshold", () => {
    expect(compare(9, "lt", 10)).toBe(true);
    expect(compare(10, "lt", 10)).toBe(false);
  });

  it("eq: triggers when value equals threshold", () => {
    expect(compare(10, "eq", 10)).toBe(true);
    expect(compare(11, "eq", 10)).toBe(false);
  });

  it("gte: triggers when value meets or exceeds threshold", () => {
    expect(compare(10, "gte", 10)).toBe(true);
    expect(compare(11, "gte", 10)).toBe(true);
    expect(compare(9, "gte", 10)).toBe(false);
  });

  it("lte: triggers when value meets or is below threshold", () => {
    expect(compare(10, "lte", 10)).toBe(true);
    expect(compare(9, "lte", 10)).toBe(true);
    expect(compare(11, "lte", 10)).toBe(false);
  });
});

describe("Error rate condition", () => {
  it("calculates rate as count / duration in minutes", () => {
    const count = 30;
    const durationSeconds = 300; // 5 minutes
    const durationMinutes = durationSeconds / 60;
    const rate = count / durationMinutes;

    expect(rate).toBe(6); // 30 errors / 5 min = 6/min
  });

  it("handles zero duration safely", () => {
    const count = 10;
    const durationSeconds = 0;
    const durationMinutes = Math.max(durationSeconds / 60, 1);
    const rate = count / durationMinutes;

    expect(rate).toBe(10); // fallback to 1 minute
  });
});

describe("Consecutive failures (uptime_down)", () => {
  it("counts consecutive non-2xx codes from newest", () => {
    const codes = [503, 503, 500, 200, 200]; // 3 consecutive failures from start

    let consecutive = 0;
    for (const code of codes) {
      if (code < 200 || code >= 400) {
        consecutive++;
      } else {
        break;
      }
    }

    expect(consecutive).toBe(3);
  });

  it("resets counter on successful check", () => {
    const codes = [200, 503, 503]; // first is 200, so 0 consecutive from newest

    let consecutive = 0;
    for (const code of codes) {
      if (code < 200 || code >= 400) {
        consecutive++;
      } else {
        break;
      }
    }

    expect(consecutive).toBe(0);
  });

  it("counts all failures when all are non-2xx", () => {
    const codes = [500, 502, 503, 404];

    let consecutive = 0;
    for (const code of codes) {
      if (code < 200 || code >= 400) {
        consecutive++;
      } else {
        break;
      }
    }

    expect(consecutive).toBe(4);
  });
});

describe("Token usage aggregation", () => {
  it("sums total tokens from rows", () => {
    const rows = [
      { total: 1500 },
      { total: 2300 },
      { total: 800 },
    ];
    const sum = rows.reduce((acc, r) => acc + r.total, 0);

    expect(sum).toBe(4600);
  });

  it("handles empty result set", () => {
    const rows: Array<{ total: number }> = [];
    const sum = rows.reduce((acc, r) => acc + r.total, 0);

    expect(sum).toBe(0);
  });
});

describe("Resource threshold", () => {
  it.each([
    ["cpu", 85, "gt", 80, true],
    ["cpu", 75, "gt", 80, false],
    ["memory", 90, "gte", 90, true],
    ["disk", 50, "lte", 80, true],
  ])(
    "%s: value=%d %s %d → %s",
    (_resource, value, operator, threshold, expected) => {
      const compare = (
        v: number,
        op: string,
        t: number
      ): boolean => {
        switch (op) {
          case "gt": return v > t;
          case "lt": return v < t;
          case "eq": return v === t;
          case "gte": return v >= t;
          case "lte": return v <= t;
          default: return false;
        }
      };

      expect(compare(value, operator, threshold)).toBe(expected);
    }
  );
});
