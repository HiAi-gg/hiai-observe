/**
 * Shared admin authentication helper for `/api/admin/*` routes.
 *
 * All admin endpoints on the observe side (retention worker control,
 * auth-bridge tenant/project management) share a single, constant-time
 * Bearer-token check against the `ADMIN_API_KEY` env var. Server-to-server
 * calls from hiai-admin-proxy use this key — it is NOT a user credential
 * and must never be exposed to a browser.
 *
 * See `docs/AUTH_BRIDGE.md` §"Observe-side implementation" for the
 * threat model and rotation guidance.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { config } from "./config.js";

export type AdminKeyCheckResult = { ok: true } | { ok: false; status: number; error: string };

function extractAdminToken(headers: Record<string, string | undefined>): string | undefined {
  const auth = headers.authorization ?? headers.Authorization;
  if (auth) {
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : auth.trim();
    if (token) return token;
  }
  const apiKey = headers["x-api-key"] ?? headers["X-Api-Key"];
  return apiKey?.trim() || undefined;
}

function tokensMatch(presented: string, expected: string): boolean {
  // Hash both sides so comparison length is constant (SHA-256 digest)
  // even when the presented token length differs from ADMIN_API_KEY.
  const presentedDigest = createHash("sha256").update(presented, "utf8").digest();
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(presentedDigest, expectedDigest);
}

export function requireAdminKey(headers: Record<string, string | undefined>): AdminKeyCheckResult {
  const adminKey = config.ADMIN_API_KEY;
  if (!adminKey) {
    return {
      ok: false,
      status: 403,
      error: "Admin API key not configured. Set ADMIN_API_KEY in .env",
    };
  }

  const token = extractAdminToken(headers);
  if (!token) {
    return { ok: false, status: 401, error: "Missing admin API key" };
  }

  try {
    if (!tokensMatch(token, adminKey)) {
      return { ok: false, status: 401, error: "Invalid admin API key" };
    }
  } catch {
    return { ok: false, status: 401, error: "Invalid admin API key" };
  }

  return { ok: true };
}

export function adminKeyFromRequest(request: Request): AdminKeyCheckResult {
  return requireAdminKey({
    authorization: request.headers.get("authorization") ?? undefined,
    "x-api-key": request.headers.get("x-api-key") ?? undefined,
  });
}
