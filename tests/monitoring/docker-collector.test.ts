import { describe, it, expect, vi, beforeEach } from "vitest";
import { getConfig, resetConfig } from "../../src/monitoring/config.js";

describe("collectDockerStats", () => {
  beforeEach(() => {
    resetConfig();
  });

  it("returns correct ContainerStats structure", async () => {
    const mockContainers = [
      {
        Id: "abc123def456789",
        Names: ["/test-container"],
        Image: "nginx:latest",
        State: "running",
        Status: "Up 2 hours",
        StartedAt: new Date(Date.now() - 7200_000).toISOString(),
      },
    ];

    const mockStats = {
      cpu_stats: {
        cpu_usage: { total_usage: 200000000 },
        system_cpu_usage: 10000000000,
        online_cpus: 4,
      },
      precpu_stats: {
        cpu_usage: { total_usage: 100000000 },
        system_cpu_usage: 5000000000,
      },
      memory_stats: {
        usage: 268435456,
        limit: 1073741824,
      },
      networks: {
        eth0: { rx_bytes: 1024, tx_bytes: 512 },
      },
      blkio_stats: {
        io_service_bytes_recursive: [
          { op: "read", value: 4096 },
          { op: "write", value: 2048 },
        ],
      },
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn((url: string | URL | Request) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/containers/json")) {
        return Promise.resolve(new Response(JSON.stringify(mockContainers), { status: 200 }));
      }
      if (urlStr.includes("/stats")) {
        return Promise.resolve(new Response(JSON.stringify(mockStats), { status: 200 }));
      }
      return Promise.resolve(new Response("Not Found", { status: 404 }));
    }) as typeof fetch;

    try {
      const { collectDockerStats } = await import("../../src/monitoring/docker-collector.js");
      const result = await collectDockerStats();

      expect(Array.isArray(result)).toBe(true);
      if (result.length > 0) {
        const container = result[0]!;
        expect(container).toHaveProperty("id");
        expect(container).toHaveProperty("name", "test-container");
        expect(container).toHaveProperty("image", "nginx:latest");
        expect(container).toHaveProperty("cpu_percent");
        expect(typeof container.cpu_percent).toBe("number");
        expect(container).toHaveProperty("memory_usage_mb");
        expect(typeof container.memory_usage_mb).toBe("number");
        expect(container).toHaveProperty("memory_limit_mb");
        expect(container).toHaveProperty("network_rx_bytes", 1024);
        expect(container).toHaveProperty("network_tx_bytes", 512);
        expect(container).toHaveProperty("block_read_bytes", 4096);
        expect(container).toHaveProperty("block_write_bytes", 2048);
        expect(container).toHaveProperty("status", "running");
        expect(container).toHaveProperty("uptime_seconds");
        expect(typeof container.uptime_seconds).toBe("number");
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("handles missing Docker socket gracefully", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(() =>
      Promise.reject(new Error("ENOENT: no such file or directory"))
    ) as typeof fetch;

    try {
      const { collectDockerStats } = await import("../../src/monitoring/docker-collector.js");
      await expect(collectDockerStats()).rejects.toThrow();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("config reads from environment", () => {
    const config = getConfig();
    expect(config).toHaveProperty("dockerSocket");
    expect(config).toHaveProperty("collectionIntervalMs");
    expect(config).toHaveProperty("containerFilter");
    expect(config.containerFilter).toHaveProperty("include");
    expect(config.containerFilter).toHaveProperty("exclude");
    expect(typeof config.collectionIntervalMs).toBe("number");
  });
});
