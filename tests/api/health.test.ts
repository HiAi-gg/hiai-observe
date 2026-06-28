import { describe, expect, it, vi } from "vitest";

// Mock DB and Redis before importing health plugin
vi.mock("../../src/store/db.js", () => ({
  db: { execute: vi.fn().mockResolvedValue([]) },
}));

vi.mock("../../src/store/redis.js", () => ({
  redis: { ping: vi.fn().mockResolvedValue("PONG") },
}));

const { healthPlugin } = await import("../../src/api/health.js");
const pkg = await import("../../package.json");

describe("health endpoint", () => {
  it("returns ok status at legacy /health path", async () => {
    const res = await healthPlugin.handle(new Request("http://localhost/health"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("ok");
    // Derive from package.json so version bumps don't break this test
    expect(body.version).toBe(pkg.default.version);
    expect(typeof body.uptime).toBe("string");
    expect(typeof body.uptimeSeconds).toBe("number");
    expect(body.memory).toBeDefined();
    expect(typeof body.memory.rss).toBe("string");
  });

  it("returns ok status at canonical /api/health path (HiAi ecosystem convention)", async () => {
    const res = await healthPlugin.handle(new Request("http://localhost/api/health"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.version).toBe(pkg.default.version);
    expect(typeof body.uptime).toBe("string");
    expect(typeof body.uptimeSeconds).toBe("number");
    expect(body.memory).toBeDefined();
    expect(typeof body.memory.rss).toBe("string");
  });

  it("/api/health and /health return identical payloads (alias contract)", async () => {
    const canonical = await healthPlugin.handle(new Request("http://localhost/api/health"));
    const legacy = await healthPlugin.handle(new Request("http://localhost/health"));

    expect(canonical.status).toBe(legacy.status);
    const canonicalBody = await canonical.json();
    const legacyBody = await legacy.json();
    // uptimeSeconds can drift by a millisecond between calls; compare everything else
    expect({ ...canonicalBody, uptimeSeconds: 0 }).toEqual({
      ...legacyBody,
      uptimeSeconds: 0,
    });
  });
});
