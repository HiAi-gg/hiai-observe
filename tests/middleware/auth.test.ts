/**
 * Tests for Auth Middleware
 * - resolveApiKey(): Bearer, Basic, Sentry DSN, X-API-Key, raw key, invalid
 * - lookupProject(): cache hit, cache miss, cache expiry, DB lookup
 * - Public paths bypass auth
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock Bun.password.verify for bcrypt checks
vi.stubGlobal("Bun", {
  password: {
    verify: vi.fn().mockResolvedValue(true),
    hash: vi.fn().mockResolvedValue("$2b$10$mockedhash"),
  },
});

// Mock DB before importing auth module
vi.mock("../../src/store/db.js", () => {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
  };
  return {
    db: {
      select: vi.fn(() => chain),
    },
  };
});

// Mock Bun.password.verify to return true for test keys
const _originalVerify = globalThis.Bun?.password?.verify;
if (typeof globalThis.Bun === "undefined") (globalThis as any).Bun = {};
(globalThis as any).Bun.password = {
  verify: vi.fn().mockResolvedValue(true),
  hash: vi.fn().mockResolvedValue("$2b$10$fakehash"),
};

const { resolveApiKey } = await import("../../src/lib/auth.js");
const { db } = await import("../../src/store/db.js");

// Access the shared chain mock (returned by db.select())
function getDbChain() {
  return (db.select as ReturnType<typeof vi.fn>)();
}

// ── Public path helper (mirrors middleware logic) ────────────────────────
const PUBLIC_PATHS = [
  "/api/health", // Canonical HiAi ecosystem health endpoint
  "/health", // Legacy alias for backwards compatibility
  "/metrics",
  "/api/status",
  "/api/subscribers/public",
  "/api/badges",
  "/api/openapi.json",
  "/v1/traces",
  "/v1/metrics",
  "/api/logs/stream",
  "/api/observe/logs/stream",
];

function isPublicPath(path: string): boolean {
  return PUBLIC_PATHS.some((p) => path.startsWith(p)) || path === "/";
}

// ── resolveApiKey ────────────────────────────────────────────────────────
describe("resolveApiKey", () => {
  describe("Bearer token", () => {
    it("extracts token from Bearer scheme", () => {
      expect(resolveApiKey("Bearer my-secret-token")).toEqual({ apiKey: "my-secret-token" });
    });

    it("trims whitespace around token", () => {
      expect(resolveApiKey("Bearer   padded-token  ")).toEqual({ apiKey: "padded-token" });
    });

    it("treats 'Bearer ' (trailing space only) as raw key after trim", () => {
      // Source code does raw.trim() first, stripping the trailing space
      // "Bearer " -> trim -> "Bearer" -> doesn't match "Bearer " prefix -> raw key
      const header = `Bearer${" "}`;
      expect(header).toBe("Bearer "); // verify space is present
      expect(resolveApiKey(header)).toEqual({ apiKey: "Bearer" });
    });

    it("treats bare 'Bearer' (no space) as raw key", () => {
      // "Bearer" without trailing space doesn't match the Bearer prefix check
      // and falls through to raw key detection (no spaces)
      expect(resolveApiKey("Bearer")).toEqual({ apiKey: "Bearer" });
    });
  });

  describe("Basic auth", () => {
    it("extracts key from base64 'key:' format", () => {
      const encoded = Buffer.from("my-api-key:").toString("base64");
      expect(resolveApiKey(`Basic ${encoded}`)).toEqual({ apiKey: "my-api-key" });
    });

    it("extracts key from base64 'key:secret' format", () => {
      const encoded = Buffer.from("my-api-key:some-secret").toString("base64");
      expect(resolveApiKey(`Basic ${encoded}`)).toEqual({ apiKey: "my-api-key" });
    });

    it("extracts key when no colon present", () => {
      const encoded = Buffer.from("just-a-key").toString("base64");
      expect(resolveApiKey(`Basic ${encoded}`)).toEqual({ apiKey: "just-a-key" });
    });

    it("returns null for empty decoded key", () => {
      const encoded = Buffer.from(":secret").toString("base64");
      expect(resolveApiKey(`Basic ${encoded}`)).toBeNull();
    });
  });

  describe("Sentry DSN", () => {
    it("extracts sentry_key from Sentry header", () => {
      const header = 'Sentry sentry_key="abc123", sentry_version=7';
      expect(resolveApiKey(header)).toEqual({ apiKey: "abc123" });
    });

    it("extracts sentry_key without quotes", () => {
      const header = "Sentry sentry_key=abc123, sentry_version=7";
      expect(resolveApiKey(header)).toEqual({ apiKey: "abc123" });
    });

    it("returns null when sentry_key is missing", () => {
      expect(resolveApiKey("Sentry sentry_version=7")).toBeNull();
    });
  });

  describe("X-API-Key prefix", () => {
    it("extracts key after X-API-Key prefix", () => {
      expect(resolveApiKey("X-API-Key my-key")).toEqual({ apiKey: "my-key" });
    });

    it("treats bare X-API-Key (no space) as raw key", () => {
      // Without trailing space, doesn't match the X-API-Key prefix check
      expect(resolveApiKey("X-API-Key")).toEqual({ apiKey: "X-API-Key" });
    });
  });

  describe("Raw key", () => {
    it("accepts a plain key with no spaces", () => {
      expect(resolveApiKey("sk_live_abc123")).toEqual({ apiKey: "sk_live_abc123" });
    });
  });

  describe("Invalid formats", () => {
    it("returns null for undefined input", () => {
      expect(resolveApiKey(undefined)).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(resolveApiKey("")).toBeNull();
    });

    it("returns null for unknown prefix with spaces", () => {
      expect(resolveApiKey("Token abc def")).toBeNull();
    });
  });
});

// ── lookupProject ────────────────────────────────────────────────────────
describe("lookupProject", () => {
  let chain: ReturnType<typeof getDbChain>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Advance past any leftover cache entries from previous tests (TTL=60s)
    vi.advanceTimersByTime(120_000);
    chain = getDbChain();
    chain.limit.mockReset();
    chain.limit.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns project on DB hit", async () => {
    chain.limit.mockResolvedValueOnce([
      { id: "proj-1", apiKeyHash: "$2b$10$fakehash", apiKey: null },
    ]);

    const { lookupProject } = await import("../../src/lib/auth.js");
    const result = await lookupProject("new-key-1");

    expect(result).toEqual({ projectId: "proj-1" });
  });

  it("returns null when key not found in DB", async () => {
    chain.limit.mockResolvedValueOnce([]);

    const { lookupProject } = await import("../../src/lib/auth.js");
    const result = await lookupProject("nonexistent-key");

    expect(result).toBeNull();
  });

  it("serves from cache on second lookup (cache hit)", async () => {
    chain.limit.mockResolvedValueOnce([
      { id: "proj-cache", apiKeyHash: "$2b$10$fakehash", apiKey: null },
    ]);

    const { lookupProject } = await import("../../src/lib/auth.js");

    const first = await lookupProject("cache-test-key");
    expect(first).toEqual({ projectId: "proj-cache" });

    const callCountAfterFirst = chain.limit.mock.calls.length;

    // Second call should hit cache — no additional DB call
    const second = await lookupProject("cache-test-key");
    expect(second).toEqual({ projectId: "proj-cache" });
    expect(chain.limit.mock.calls.length).toBe(callCountAfterFirst);
  });

  it("queries DB again after cache expires (60s TTL)", async () => {
    chain.limit.mockResolvedValue([{ id: "proj-expire" }]);

    const { lookupProject } = await import("../../src/lib/auth.js");

    await lookupProject("expire-key");
    const callCountAfterFirst = chain.limit.mock.calls.length;

    // Advance time past TTL
    vi.advanceTimersByTime(61_000);

    await lookupProject("expire-key");
    expect(chain.limit.mock.calls.length).toBe(callCountAfterFirst + 1);
  });
});

// ── Public paths ─────────────────────────────────────────────────────────
describe("isPublicPath", () => {
  it.each([
    "/",
    "/api/health",
    "/api/health/details",
    "/health",
    "/health/details",
    "/metrics",
    "/metrics/prometheus",
    "/api/status",
    "/api/status/overview",
    "/api/subscribers/public",
    "/api/badges",
    "/api/openapi.json",
    "/v1/traces",
    "/v1/traces/batch",
    "/v1/metrics",
    "/v1/metrics/otlp",
    "/api/logs/stream",
    "/api/logs/stream?container=nginx",
    "/api/observe/logs/stream",
  ])("allows public path: %s", (path) => {
    expect(isPublicPath(path)).toBe(true);
  });

  it.each([
    "/api/issues",
    "/api/events",
    "/api/admin/cleanup",
    "/v1/logs",
    "/dashboard",
    "/api/projects",
  ])("blocks protected path: %s", (path) => {
    expect(isPublicPath(path)).toBe(false);
  });
});
