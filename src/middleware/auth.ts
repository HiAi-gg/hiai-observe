import type { Context } from "elysia";
import { adminKeyFromRequest } from "../lib/admin-auth.js";
import { lookupProject, resolveApiKey } from "../lib/auth.js";
import { checkWriteAccess } from "../lib/rbac.js";

/**
 * Paths that bypass the Authorization-header middleware check.
 *
 * Endpoints that need auth but accept it via a different mechanism
 * (query param, OTLP headers) live here so the middleware does not
 * reject them — each handler verifies credentials independently.
 *
 * Sentry ingest routes (`/:projectId/store`, `/:projectId/envelope`)
 * are NOT in this list: their handlers call `authorizeProject()`
 * directly, so the middleware must run the standard Authorization-header
 * check to prevent unauthenticated requests from reaching the handler.
 *
 * Matching is exact or `prefix + "/"` — never a raw startsWith of a
 * short token like `/api/admin` that would also skip `/api/administration`.
 */
/** Exact public paths (children are NOT public). */
export const PUBLIC_EXACT = new Set([
  "/",
  "/api/health",
  "/health",
  "/metrics",
  "/api/openapi.json",
]);

/** Prefix public paths: `p` and `p/...` bypass the project-key guard. */
export const PUBLIC_PREFIXES = [
  "/api/status",
  "/status",
  "/embed",
  "/api/subscribers/public",
  "/api/badges",
  "/v1/traces",
  "/v1/metrics",
  "/v1/logs",
  "/ws/logs",
  "/api/admin",
  "/api/tenant",
  "/api/auth",
  "/login",
];

export const PUBLIC_PATHS = [...PUBLIC_EXACT, ...PUBLIC_PREFIXES];

export function isPublicPath(path: string): boolean {
  const pathname = path.split("?")[0] ?? path;
  if (PUBLIC_EXACT.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function shouldSkipAuth(path: string, method: string): boolean {
  return isPublicPath(path) || method === "OPTIONS";
}

export { isPublicPath as pathBypassesProjectGuard };

export async function resolveProjectId(request: Request): Promise<string | undefined> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (shouldSkipAuth(path, request.method)) {
    return undefined;
  }

  const authHeader = request.headers.get("authorization");
  const apiKeyHeader = request.headers.get("x-api-key");

  const parsed =
    resolveApiKey(authHeader ?? undefined) ??
    (apiKeyHeader ? { apiKey: apiKeyHeader.trim() } : null);
  if (!parsed) {
    return undefined;
  }

  const project = await lookupProject(parsed.apiKey);
  return project?.projectId;
}

export async function authGuard({
  request,
  set,
}: {
  request: Request;
  set: Context["set"];
}): Promise<Response | undefined> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (shouldSkipAuth(path, request.method)) {
    return undefined;
  }

  // Instance admin key is a valid alternative to a project API key.
  if (adminKeyFromRequest(request).ok) {
    return undefined;
  }

  const projectId = await resolveProjectId(request);
  if (!projectId) {
    set.status = 401;
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        Pragma: "no-cache",
      },
    });
  }

  if (!(await checkWriteAccess(projectId, request.method))) {
    set.status = 403;
    return new Response(
      JSON.stringify({ error: "Forbidden: write access requires admin or member role" }),
      {
        status: 403,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          Pragma: "no-cache",
        },
      },
    );
  }
}
