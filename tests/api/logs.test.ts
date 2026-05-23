import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock db module
vi.mock("../../src/store/db.js", () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
  },
}));

// Mock schema (logs table is in schema.js)
vi.mock("../../src/store/schema.js", () => ({
  logs: {
    containerId: "container_id",
    containerName: "container_name",
    stream: "stream",
    message: "message",
    level: "level",
    timestamp: "timestamp",
    raw: "raw",
  },
}));

import { searchLogs, getLogContainers, clearLogs } from "../../src/store/logs.js";

describe("logs data access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("searchLogs returns result shape", async () => {
    const result = await searchLogs({ container: "test-container", limit: 50 });
    expect(result).toHaveProperty("logs");
    expect(result).toHaveProperty("total");
    expect(result).toHaveProperty("limit", 50);
    expect(result).toHaveProperty("offset", 0);
  });

  it("searchLogs accepts all filter params", async () => {
    const result = await searchLogs({
      container: "c1",
      level: "error",
      search: "timeout",
      from: new Date("2026-01-01"),
      to: new Date("2026-12-31"),
      limit: 25,
      offset: 10,
    });
    expect(result.limit).toBe(25);
    expect(result.offset).toBe(10);
  });

  it("clearLogs returns count", async () => {
    const count = await clearLogs();
    expect(typeof count).toBe("number");
  });

  it("getLogContainers returns result", async () => {
    const containers = await getLogContainers();
    expect(containers).toBeDefined();
  });
});
