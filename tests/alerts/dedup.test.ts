/**
 * Tests for Alert Deduplication
 * - shouldFireAlert(): first call -> true, second within cooldown -> false
 * - Cooldown expiry -> true again
 * - clearCooldown() -> resets
 * - getRemainingCooldown()
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Track cooldown keys in mock Redis
const cooldownKeys = new Map<string, number>();

// Mock Redis before importing dedup module
vi.mock("../../src/store/redis.js", () => ({
  redis: {
    set: vi.fn(async (key: string, _value: string, ex?: string, ttl?: number, nx?: string) => {
      if (ex === "EX" && nx === "NX") {
        if (cooldownKeys.has(key)) return null; // key exists -> NX fails
        cooldownKeys.set(key, ttl!);
        return "OK";
      }
      return null;
    }),
    del: vi.fn(async (key: string) => {
      const existed = cooldownKeys.has(key);
      cooldownKeys.delete(key);
      return existed ? 1 : 0;
    }),
    ttl: vi.fn(async (key: string) => {
      if (!cooldownKeys.has(key)) return -2; // key doesn't exist
      return cooldownKeys.get(key)!;
    }),
  },
}));

const { shouldFireAlert, clearCooldown, getRemainingCooldown } = await import(
  "../../src/alerts/dedup.js"
);

beforeEach(() => {
  cooldownKeys.clear();
  vi.clearAllMocks();
});

// ── shouldFireAlert ──────────────────────────────────────────────────────
describe("shouldFireAlert", () => {
  it("returns true on first call (allows firing)", async () => {
    const result = await shouldFireAlert("alert-001");
    expect(result).toBe(true);
  });

  it("returns false on second call within cooldown", async () => {
    await shouldFireAlert("alert-002");
    const result = await shouldFireAlert("alert-002");
    expect(result).toBe(false);
  });

  it("calls Redis SET NX with correct key and TTL", async () => {
    const { redis } = await import("../../src/store/redis.js");
    await shouldFireAlert("alert-003", 600);

    expect(redis.set).toHaveBeenCalledWith(
      "alert:cooldown:alert-003",
      "1",
      "EX",
      600,
      "NX"
    );
  });

  it("uses default 300s cooldown when not specified", async () => {
    const { redis } = await import("../../src/store/redis.js");
    await shouldFireAlert("alert-004");

    expect(redis.set).toHaveBeenCalledWith(
      "alert:cooldown:alert-004",
      "1",
      "EX",
      300,
      "NX"
    );
  });

  it("respects custom cooldown value", async () => {
    const { redis } = await import("../../src/store/redis.js");
    await shouldFireAlert("alert-005", 60);

    expect(redis.set).toHaveBeenCalledWith(
      "alert:cooldown:alert-005",
      "1",
      "EX",
      60,
      "NX"
    );
  });

  it("isolates different alert IDs", async () => {
    await shouldFireAlert("alert-a");
    await shouldFireAlert("alert-b");

    // Both should fire (different keys)
    const { redis } = await import("../../src/store/redis.js");
    expect(redis.set).toHaveBeenCalledTimes(2);
  });
});

// ── Cooldown expiry ──────────────────────────────────────────────────────
describe("cooldown expiry", () => {
  it("allows firing again after cooldown key expires", async () => {
    // First call: fires
    const first = await shouldFireAlert("alert-expire");
    expect(first).toBe(true);

    // Simulate TTL expiry: key disappears from Redis
    cooldownKeys.delete("alert:cooldown:alert-expire");

    // Third call: should fire again (key expired)
    const third = await shouldFireAlert("alert-expire");
    expect(third).toBe(true);
  });
});

// ── clearCooldown ────────────────────────────────────────────────────────
describe("clearCooldown", () => {
  it("deletes the cooldown key from Redis", async () => {
    await shouldFireAlert("alert-clear");
    await clearCooldown("alert-clear");

    const { redis } = await import("../../src/store/redis.js");
    expect(redis.del).toHaveBeenCalledWith("alert:cooldown:alert-clear");
  });

  it("allows alert to fire again after clearing", async () => {
    await shouldFireAlert("alert-clear-2");
    // Second call within cooldown -> deduped
    expect(await shouldFireAlert("alert-clear-2")).toBe(false);

    // Clear cooldown
    await clearCooldown("alert-clear-2");

    // Should fire again
    expect(await shouldFireAlert("alert-clear-2")).toBe(true);
  });

  it("is safe to call on non-existent key", async () => {
    await expect(clearCooldown("nonexistent-alert")).resolves.toBeUndefined();
  });
});

// ── getRemainingCooldown ─────────────────────────────────────────────────
describe("getRemainingCooldown", () => {
  it("returns TTL when key exists", async () => {
    await shouldFireAlert("alert-ttl", 120);
    const remaining = await getRemainingCooldown("alert-ttl");
    expect(remaining).toBe(120);
  });

  it("returns 0 when key does not exist (TTL=-2)", async () => {
    const remaining = await getRemainingCooldown("no-such-alert");
    expect(remaining).toBe(0);
  });

  it("clamps negative TTL to 0", async () => {
    // Simulate Redis returning -1 (key exists but no TTL — edge case)
    const { redis } = await import("../../src/store/redis.js");
    (redis.ttl as ReturnType<typeof vi.fn>).mockResolvedValueOnce(-1);

    const remaining = await getRemainingCooldown("edge-case");
    expect(remaining).toBe(0);
  });

  it("reflects decreasing TTL over time", async () => {
    await shouldFireAlert("alert-decay", 300);

    const remaining1 = await getRemainingCooldown("alert-decay");
    expect(remaining1).toBe(300);

    // Simulate TTL decay: Redis now returns 250
    const { redis } = await import("../../src/store/redis.js");
    (redis.ttl as ReturnType<typeof vi.fn>).mockResolvedValueOnce(250);

    const remaining2 = await getRemainingCooldown("alert-decay");
    expect(remaining2).toBe(250);
  });
});

// ── Redis key format ─────────────────────────────────────────────────────
describe("Redis key format", () => {
  it("uses alert:cooldown:{alertId} prefix", async () => {
    const { redis } = await import("../../src/store/redis.js");
    await shouldFireAlert("my-alert-id");

    const calledKey = (redis.set as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(calledKey).toBe("alert:cooldown:my-alert-id");
  });
});
