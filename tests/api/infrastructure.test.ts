import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/monitoring/docker-collector.js", () => ({
  collectDockerStats: vi.fn(async () => [{ id: "c1", name: "api", cpu: 1 }]),
}));
vi.mock("../../src/monitoring/host-collector.js", () => ({
  collectHostStats: vi.fn(async () => ({ cpu: 10 })),
}));
vi.mock("../../src/store/infra.js", () => ({
  getContainerLogCounts: vi.fn(async () => new Map([["c1", 3]])),
  getContainerStatsByContainer: vi.fn(async () => []),
  getGpuStatsHistory: vi.fn(async () => []),
  getHostStatsHistory: vi.fn(async () => []),
  getLatestContainerStats: vi.fn(async () => []),
  getLatestGpuStats: vi.fn(async () => []),
  getLatestHostStats: vi.fn(async () => null),
  listHosts: vi.fn(async () => ["local"]),
}));

const { infrastructureRoutes } = await import("../../src/api/infrastructure.js");

describe("GET /api/infrastructure/containers", () => {
  it("returns containers with log counts", async () => {
    const res = await infrastructureRoutes.handle(
      new Request("http://localhost/api/infrastructure/containers"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(1);
    expect(body.containers[0].log_count_24h).toBe(3);
    expect(body).not.toHaveProperty("detail");
  });
});
