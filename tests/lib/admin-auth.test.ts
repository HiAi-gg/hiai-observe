/**
 * Tests for requireAdminKey() — shared admin auth helper used by retention
 * worker endpoints AND the new auth-bridge admin endpoints (OBS2.3c).
 *
 * Threat model:
 *   - ADMIN_API_KEY is the server-to-server shared secret between observe
 *     and hiai-admin-proxy. It is NOT a user credential.
 *   - Comparison must be constant-time to prevent timing attacks.
 *   - Missing key on server = endpoint disabled (403) — safer than failing open.
 *   - Missing/short/mismatched bearer = 401.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Config is read at module load (Object.freeze), so we mutate process.env
// directly and reset modules before each test to force a fresh import.
// This matches the pattern in tests/workers/retention.test.ts.

async function loadRequireAdminKey(): Promise<
  (headers: Record<string, string | undefined>) => unknown
> {
  const mod = await import("../../src/lib/admin-auth.js");
  return mod.requireAdminKey as (headers: Record<string, string | undefined>) => unknown;
}

describe("requireAdminKey", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.ADMIN_API_KEY = "test-admin-key-1234567890";
  });

  afterEach(() => {
    delete process.env.ADMIN_API_KEY;
    vi.restoreAllMocks();
  });

  describe("when ADMIN_API_KEY is not configured", () => {
    beforeEach(() => {
      delete process.env.ADMIN_API_KEY;
    });

    it("returns 403 (endpoint disabled, fail closed)", async () => {
      const requireAdminKey = await loadRequireAdminKey();
      const result = requireAdminKey({});
      expect(result).toEqual({
        ok: false,
        status: 403,
        error: "Admin API key not configured. Set ADMIN_API_KEY in .env",
      });
    });

    it("rejects even with a bearer token", async () => {
      const requireAdminKey = await loadRequireAdminKey();
      const result = requireAdminKey({ authorization: "Bearer whatever" });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.status).toBe(403);
    });
  });

  describe("when ADMIN_API_KEY is configured", () => {
    it("accepts the correct bearer token", async () => {
      const requireAdminKey = await loadRequireAdminKey();
      const result = requireAdminKey({ authorization: "Bearer test-admin-key-1234567890" });
      expect(result).toEqual({ ok: true });
    });

    it("rejects missing authorization header (401)", async () => {
      const requireAdminKey = await loadRequireAdminKey();
      const result = requireAdminKey({});
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(401);
        expect(result.error).toMatch(/missing/i);
      }
    });

    it("rejects an empty bearer token (401)", async () => {
      const requireAdminKey = await loadRequireAdminKey();
      const result = requireAdminKey({ authorization: "Bearer " });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.status).toBe(401);
    });

    it("rejects an incorrect bearer token (401)", async () => {
      const requireAdminKey = await loadRequireAdminKey();
      const result = requireAdminKey({ authorization: "Bearer wrong-key-1234567890" });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(401);
        expect(result.error).toMatch(/invalid/i);
      }
    });

    it("rejects a same-length but different token (timing-safe)", async () => {
      const requireAdminKey = await loadRequireAdminKey();
      const wrong = "X".repeat("test-admin-key-1234567890".length);
      const result = requireAdminKey({ authorization: `Bearer ${wrong}` });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.status).toBe(401);
    });

    it("rejects a same-length token differing in only one char (timing-safe)", async () => {
      const requireAdminKey = await loadRequireAdminKey();
      const tweaked = "test-admin-key-123456789".concat("X");
      const result = requireAdminKey({ authorization: `Bearer ${tweaked}` });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.status).toBe(401);
    });

    it("accepts the raw token without Bearer prefix (back-compat)", async () => {
      const requireAdminKey = await loadRequireAdminKey();
      const result = requireAdminKey({ authorization: "test-admin-key-1234567890" });
      expect(result).toEqual({ ok: true });
    });
  });
});
