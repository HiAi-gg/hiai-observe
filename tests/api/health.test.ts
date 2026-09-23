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
const { db } = await import("../../src/store/db.js");
const { redis } = await import("../../src/store/redis.js");

describe("health endpoint", () => {
  it("returns ok status at legacy /health path", async () => {
    const res = await healthPlugin.handle(new Request("http://localhost/health"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.version).toBe(pkg.default.version);
    expect(body.memory).toBeUndefined();
    expect(body.workers).toBeUndefined();
  });

  it("returns ok status at canonical /api/health path (HiAi ecosystem convention)", async () => {
    const res = await healthPlugin.handle(new Request("http://localhost/api/health"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.version).toBe(pkg.default.version);
    expect(body.memory).toBeUndefined();
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

  it("public payload is only status + version (no workers, memory, or secrets)", async () => {
    const res = await healthPlugin.handle(new Request("http://localhost/api/health"));
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["status", "version"]);
    expect(JSON.stringify(body)).not.toMatch(/api[_-]?key/i);
    expect(JSON.stringify(body)).not.toMatch(/password/i);
    expect(body.workers).toBeUndefined();
    expect(body.dependencies).toBeUndefined();
    expect(body.memory).toBeUndefined();
    expect(body.lastError).toBeUndefined();
  });

  it("returns degraded (200) when postgres is down and redis is up", async () => {
    vi.mocked(db.execute).mockRejectedValueOnce(new Error("postgres down"));
    vi.mocked(redis.ping).mockResolvedValueOnce("PONG");

    const res = await healthPlugin.handle(new Request("http://localhost/api/health"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("degraded");
    expect(body.dependencies).toBeUndefined();
  });

  it("returns 503 error when both postgres and redis are down", async () => {
    vi.mocked(db.execute).mockRejectedValueOnce(new Error("postgres down"));
    vi.mocked(redis.ping).mockRejectedValueOnce(new Error("redis down"));

    const canonical = await healthPlugin.handle(new Request("http://localhost/api/health"));
    vi.mocked(db.execute).mockRejectedValueOnce(new Error("postgres down"));
    vi.mocked(redis.ping).mockRejectedValueOnce(new Error("redis down"));
    const legacy = await healthPlugin.handle(new Request("http://localhost/health"));

    expect(canonical.status).toBe(503);
    expect(legacy.status).toBe(503);
    expect((await canonical.json()).status).toBe("error");
    expect((await legacy.json()).status).toBe("error");
  });

  it("GET /api/health/details rejects unauthenticated callers", async () => {
    const res = await healthPlugin.handle(new Request("http://localhost/api/health/details"));
    expect([401, 403]).toContain(res.status);
    const body = (await res.json()) as Record<string, unknown>;
    expect(typeof body.error).toBe("string");
    expect(body.workers).toBeUndefined();
    expect(body.dependencies).toBeUndefined();
    expect(body.memory).toBeUndefined();
    // Env var *names* may appear in the error; secret *values* must not.
    expect(JSON.stringify(body)).not.toMatch(/ho_[a-z0-9]{16,}/i);
    expect(JSON.stringify(body)).not.toMatch(/"[a-f0-9]{32,}"/i);
  });
});

describe("readiness probe", () => {
  it("returns ready at /api/ready and /ready when postgres is up", async () => {
    const canonical = await healthPlugin.handle(new Request("http://localhost/api/ready"));
    const alias = await healthPlugin.handle(new Request("http://localhost/ready"));

    expect(canonical.status).toBe(200);
    expect(alias.status).toBe(200);
    const canonicalBody = (await canonical.json()) as Record<string, unknown>;
    const aliasBody = (await alias.json()) as Record<string, unknown>;
    expect(canonicalBody).toEqual({ status: "ready", version: pkg.default.version });
    expect(aliasBody).toEqual(canonicalBody);
    expect(canonicalBody.dependencies).toBeUndefined();
    expect(canonicalBody.workers).toBeUndefined();
  });

  it("returns 503 not_ready when postgres is down even if redis is up", async () => {
    vi.mocked(db.execute).mockRejectedValueOnce(new Error("postgres down"));
    vi.mocked(redis.ping).mockResolvedValueOnce("PONG");

    const ready = await healthPlugin.handle(new Request("http://localhost/api/ready"));
    expect(ready.status).toBe(503);
    expect(await ready.json()).toEqual({ status: "not_ready", version: pkg.default.version });
  });

  it("stays ready when redis is down and postgres is up", async () => {
    vi.mocked(redis.ping).mockRejectedValueOnce(new Error("redis down"));

    const ready = await healthPlugin.handle(new Request("http://localhost/api/ready"));
    expect(ready.status).toBe(200);
    expect((await ready.json()).status).toBe("ready");
  });
});
