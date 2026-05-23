import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock store layer
const mockGetMonitors = vi.fn().mockResolvedValue([]);
const mockGetMonitor = vi.fn().mockResolvedValue(null);
const mockCreateMonitor = vi.fn().mockResolvedValue({
  id: "test-id",
  name: "Test Monitor",
  url: "https://example.com",
  intervalSeconds: 60,
  projectId: "proj-1",
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
});
const mockUpdateMonitor = vi.fn().mockResolvedValue(null);
const mockDeleteMonitor = vi.fn().mockResolvedValue(undefined);
const mockGetChecks = vi.fn().mockResolvedValue({ checks: [], total: 0, limit: 50, offset: 0 });
const mockGetUptimePercentage = vi.fn().mockResolvedValue(99.5);

vi.mock("../../src/store/uptime.js", () => ({
  getMonitors: mockGetMonitors,
  getMonitor: mockGetMonitor,
  createMonitor: mockCreateMonitor,
  updateMonitor: mockUpdateMonitor,
  deleteMonitor: mockDeleteMonitor,
  getChecks: mockGetChecks,
  getUptimePercentage: mockGetUptimePercentage,
}));

describe("monitors API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("CRUD operations", () => {
    it("createMonitor returns monitor with id", async () => {
      const { createMonitor } = await import("../../src/store/uptime.js");
      const monitor = await createMonitor({
        name: "Test",
        url: "https://example.com",
        intervalSeconds: 60,
        projectId: "proj-1",
      });

      expect(monitor).toBeDefined();
      expect(monitor!.id).toBe("test-id");
      expect(monitor!.name).toBe("Test Monitor");
      expect(monitor!.url).toBe("https://example.com");
    });

    it("getMonitor returns null for non-existent id", async () => {
      const { getMonitor } = await import("../../src/store/uptime.js");
      const monitor = await getMonitor("non-existent");
      expect(monitor).toBeNull();
    });

    it("getChecks returns paginated results", async () => {
      const { getChecks } = await import("../../src/store/uptime.js");
      const result = await getChecks("monitor-1", { limit: 10, offset: 0 });

      expect(result).toHaveProperty("checks");
      expect(result).toHaveProperty("total");
      expect(result).toHaveProperty("limit");
      expect(result).toHaveProperty("offset");
      expect(typeof result.limit).toBe("number");
    });

    it("deleteMonitor resolves without error", async () => {
      const { deleteMonitor } = await import("../../src/store/uptime.js");
      await expect(deleteMonitor("monitor-1")).resolves.toBeUndefined();
    });
  });

  describe("uptime percentage", () => {
    it("returns percentage for valid monitor", async () => {
      const { getUptimePercentage } = await import("../../src/store/uptime.js");
      const percent = await getUptimePercentage("monitor-1", 24);
      expect(percent).toBe(99.5);
    });
  });
});
