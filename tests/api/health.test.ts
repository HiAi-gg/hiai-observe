import { describe, it, expect, vi } from "vitest";

// Mock DB and Redis before importing health plugin
vi.mock("../../src/store/db.js", () => ({
  db: { execute: vi.fn().mockResolvedValue([]) },
}));

vi.mock("../../src/store/redis.js", () => ({
  redis: { ping: vi.fn().mockResolvedValue("PONG") },
}));

const { healthPlugin } = await import("../../src/api/health.js");

describe("health endpoint", () => {
  it("returns ok status", async () => {
    const res = await healthPlugin.handle(new Request("http://localhost/health"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.version).toBe("0.1.0");
    expect(typeof body.uptime).toBe("number");
  });
});
