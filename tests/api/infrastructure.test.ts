import { describe, expect, it, vi } from "vitest";

const adminKeyFromRequest = vi.fn((request: Request) => {
  if (request.headers.get("authorization") === "Bearer test-admin-key") {
    return { ok: true as const };
  }
  return { ok: false as const, status: 401, error: "Missing admin API key" };
});

vi.mock("../../src/lib/admin-auth.js", () => ({ adminKeyFromRequest }));

const collectDockerStats = vi.fn(async () => [{ id: "c1", name: "api", cpu: 1 }]);
const collectDockerStatsSnapshot = vi.fn(async () => ({
  current: [{ id: "c1", name: "api", cpu: 1 }],
  observedAt: "2026-09-09T17:00:00.000Z",
}));
const collectHostStats = vi.fn(async () => ({ cpu: 10 }));
const collectHostStatsSnapshot = vi.fn(async () => ({
  current: { cpu: 10 },
  observedAt: "2026-09-09T17:00:00.000Z",
}));
vi.mock("../../src/monitoring/docker-collector.js", () => ({
  collectDockerStats,
  collectDockerStatsSnapshot,
}));
vi.mock("../../src/monitoring/host-collector.js", () => ({
  collectHostStats,
  collectHostStatsSnapshot,
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
  it("returns containers with log counts for the instance admin", async () => {
    const res = await infrastructureRoutes.handle(
      new Request("http://localhost/api/infrastructure/containers", {
        headers: { Authorization: "Bearer test-admin-key" },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(1);
    expect(body.containers[0].log_count_24h).toBe(3);
    expect(body).not.toHaveProperty("detail");
  });

  it.each([
    ["anonymous", {}],
    ["project key A", { Authorization: "Bearer project-key-a" }],
    ["staff session", { Cookie: "better-auth.session_token=opaque" }],
  ])("rejects %s before collecting host data", async (_name, headers) => {
    collectDockerStats.mockClear();
    collectHostStats.mockClear();

    const res = await infrastructureRoutes.handle(
      new Request("http://localhost/api/infrastructure/containers", { headers }),
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Missing admin API key" });
    expect(collectDockerStats).not.toHaveBeenCalled();
    expect(collectHostStats).not.toHaveBeenCalled();
  });
});

describe("GET /api/infrastructure/overview collection semantics", () => {
  it("preserves a successful empty container inventory as available", async () => {
    collectDockerStatsSnapshot.mockResolvedValueOnce({
      current: [],
      observedAt: "2026-09-09T17:00:00.000Z",
    });
    collectHostStatsSnapshot.mockResolvedValueOnce({
      current: { cpu: 10 },
      observedAt: "2026-09-09T17:00:01.000Z",
    });

    const res = await infrastructureRoutes.handle(
      new Request("http://localhost/api/infrastructure/overview", {
        headers: { Authorization: "Bearer test-admin-key" },
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      containers: {
        available: true,
        current: [],
        observedAt: "2026-09-09T17:00:00.000Z",
      },
      host: {
        available: true,
        observedAt: "2026-09-09T17:00:01.000Z",
      },
    });
  });

  it("marks a rejected collector unavailable instead of healthy empty", async () => {
    collectDockerStatsSnapshot.mockRejectedValueOnce(new Error("Docker unavailable"));
    collectHostStatsSnapshot.mockResolvedValueOnce({
      current: { cpu: 10 },
      observedAt: "2026-09-09T17:00:01.000Z",
    });

    const res = await infrastructureRoutes.handle(
      new Request("http://localhost/api/infrastructure/overview", {
        headers: { Authorization: "Bearer test-admin-key" },
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      containers: { available: false, current: null, observedAt: null },
      host: { available: true },
    });
  });
});
