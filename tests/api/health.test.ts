import { describe, it, expect, vi } from "vitest";

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
  it("returns ok status", async () => {
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
});
