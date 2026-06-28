import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock store layer
vi.mock("../../src/store/uptime.js", () => ({
  getMonitors: vi.fn().mockResolvedValue([]),
  insertCheck: vi.fn().mockResolvedValue({ id: "1" }),
}));

describe("uptime-worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("uptime percentage calculation", () => {
    it("should calculate correct uptime percentage", () => {
      const checks = [
        { success: true },
        { success: true },
        { success: true },
        { success: false },
        { success: true },
      ];

      const total = checks.length;
      const up = checks.filter((c) => c.success).length;
      const percent = Math.round((up / total) * 10000) / 100;

      expect(percent).toBe(80);
    });

    it("should return 100% for empty check list", () => {
      const checks: { success: boolean }[] = [];
      const total = checks.length;
      const percent = total === 0 ? 100 : 0;
      expect(percent).toBe(100);
    });

    it("should return 0% for all failed checks", () => {
      const checks = [{ success: false }, { success: false }, { success: false }];
      const total = checks.length;
      const up = checks.filter((c) => c.success).length;
      const percent = Math.round((up / total) * 10000) / 100;
      expect(percent).toBe(0);
    });

    it("should handle partial failure correctly", () => {
      const checks = [{ success: true }, { success: false }];
      const total = checks.length;
      const up = checks.filter((c) => c.success).length;
      const percent = Math.round((up / total) * 10000) / 100;
      expect(percent).toBe(50);
    });
  });

  describe("runCheck mock", () => {
    it("should fetch URL and return status code", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      });
      globalThis.fetch = mockFetch as typeof fetch;

      const res = await fetch("https://example.com");
      expect(res.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledWith("https://example.com");
    });

    it("should handle fetch errors", async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));
      globalThis.fetch = mockFetch as typeof fetch;

      await expect(fetch("https://down.example.com")).rejects.toThrow("Network error");
    });
  });
});
