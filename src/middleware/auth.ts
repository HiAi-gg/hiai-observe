import type { Context } from "elysia";
import { resolveApiKey, lookupProject } from "../lib/auth.js";
import { checkWriteAccess } from "../lib/rbac.js";

/**
 * Paths that bypass the Authorization-header middleware check.
 *
 * Endpoints that need auth but accept it via a different mechanism
 * (query param, OTLP headers, Sentry envelope) live here so the
 * middleware does not reject them — each handler verifies credentials
 * independently.
 *
 * Truly public paths (no auth at all) are also listed here.
 */
export const PUBLIC_PATHS = [
  // Truly public — no auth required
  "/health",
  "/metrics",
  "/api/status",
  "/api/subscribers/public",
  "/api/badges",
  "/api/openapi.json",
  // Handler-level auth — bypasses Authorization-header middleware
  "/v1/traces",        // OTLP handler: resolveApiKey() + lookupProject()
  "/v1/metrics",       // OTLP handler: resolveApiKey() + lookupProject()
  "/api/logs/stream",  // SSE handler: ?key=<apikey> query param
  "/api/observe/logs/stream", // Redirects to /api/logs/stream
];

function isPublicPath(path: string): boolean {
  return PUBLIC_PATHS.some((p) => path.startsWith(p)) || path === "/";
}

function isSentryPath(path: string): boolean {
  return /^\/api\/[^/]+\/(store|envelope)(\/|$)/.test(path);
}

function shouldSkipAuth(path: string, method: string): boolean {
  return isPublicPath(path) || method === "OPTIONS" || isSentryPath(path);
}

export async function resolveProjectId(request: Request): Promise<string | undefined> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (shouldSkipAuth(path, request.method)) {
    return undefined;
  }

  const authHeader = request.headers.get("authorization");
  const apiKeyHeader = request.headers.get("x-api-key");

  const parsed = resolveApiKey(authHeader ?? undefined) ?? (apiKeyHeader ? { apiKey: apiKeyHeader.trim() } : null);
  if (!parsed) {
    return undefined;
  }

  const project = await lookupProject(parsed.apiKey);
  return project?.projectId;
}

export async function authGuard({ request, set }: { request: Request; set: Context["set"] }): Promise<Response | undefined> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (shouldSkipAuth(path, request.method)) {
    return undefined;
  }

  const projectId = await resolveProjectId(request);
  if (!projectId) {
    set.status = 401;
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!(await checkWriteAccess(projectId, request.method))) {
    set.status = 403;
    return new Response(JSON.stringify({ error: "Forbidden: write access requires admin or member role" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
}
