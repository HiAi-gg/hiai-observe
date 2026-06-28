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
import { timingSafeEqual } from "node:crypto";
import { config } from "./config.js";

export type AdminKeyCheckResult = { ok: true } | { ok: false; status: number; error: string };

export function requireAdminKey(headers: Record<string, string | undefined>): AdminKeyCheckResult {
  const adminKey = config.ADMIN_API_KEY;
  if (!adminKey) {
    return {
      ok: false,
      status: 403,
      error: "Admin API key not configured. Set ADMIN_API_KEY in .env",
    };
  }

  const auth = headers.authorization;
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : auth;
  if (!token) {
    return { ok: false, status: 401, error: "Missing admin API key" };
  }

  // Constant-time comparison to prevent timing attacks
  try {
    const tokenBuf = Buffer.from(token, "utf-8");
    const keyBuf = Buffer.from(adminKey, "utf-8");
    if (tokenBuf.length !== keyBuf.length || !timingSafeEqual(tokenBuf, keyBuf)) {
      return { ok: false, status: 401, error: "Invalid admin API key" };
    }
  } catch {
    return { ok: false, status: 401, error: "Invalid admin API key" };
  }

  return { ok: true };
}
