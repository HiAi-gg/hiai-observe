import { describe, it, expect } from "vitest";

describe("collectHostStats", () => {
  it("returns HostStats with correct structure", async () => {
    const { collectHostStats } = await import("../../src/monitoring/host-collector.js");
    const stats = await collectHostStats();

    expect(stats).toHaveProperty("cpu_percent");
    expect(typeof stats.cpu_percent).toBe("number");
    expect(stats.cpu_percent).toBeGreaterThanOrEqual(0);
    expect(stats.cpu_percent).toBeLessThanOrEqual(100);

    expect(stats).toHaveProperty("memory_used_mb");
    expect(typeof stats.memory_used_mb).toBe("number");

    expect(stats).toHaveProperty("memory_total_mb");
    expect(typeof stats.memory_total_mb).toBe("number");
    expect(stats.memory_total_mb).toBeGreaterThanOrEqual(0);

    expect(stats).toHaveProperty("memory_available_mb");
    expect(typeof stats.memory_available_mb).toBe("number");

    expect(stats).toHaveProperty("disk_used_gb");
    expect(typeof stats.disk_used_gb).toBe("number");

    expect(stats).toHaveProperty("disk_total_gb");
    expect(typeof stats.disk_total_gb).toBe("number");
    expect(stats.disk_total_gb).toBeGreaterThanOrEqual(0);

    expect(stats).toHaveProperty("load_avg_1m");
    expect(typeof stats.load_avg_1m).toBe("number");
    expect(stats.load_avg_1m).toBeGreaterThanOrEqual(0);

    expect(stats).toHaveProperty("load_avg_5m");
    expect(typeof stats.load_avg_5m).toBe("number");

    expect(stats).toHaveProperty("load_avg_15m");
    expect(typeof stats.load_avg_15m).toBe("number");
  });

  it("has valid memory relationship", async () => {
    const { collectHostStats } = await import("../../src/monitoring/host-collector.js");
    const stats = await collectHostStats();

    if (stats.memory_total_mb > 0) {
      expect(stats.memory_used_mb).toBeLessThanOrEqual(stats.memory_total_mb + 1);
      expect(stats.memory_available_mb).toBeLessThanOrEqual(stats.memory_total_mb + 1);
    }
  });

  it("has valid disk relationship", async () => {
    const { collectHostStats } = await import("../../src/monitoring/host-collector.js");
    const stats = await collectHostStats();

    if (stats.disk_total_gb > 0) {
      expect(stats.disk_used_gb).toBeLessThanOrEqual(stats.disk_total_gb + 1);
    }
  });
});
