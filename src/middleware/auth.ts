import type { Context } from "elysia";
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
 * Truly public paths (no auth at all) are also listed here.
 */
export const PUBLIC_PATHS = [
  // Truly public — no auth required
  "/api/health", // Canonical HiAi ecosystem health endpoint
  "/health", // Legacy alias for backwards compatibility
  "/metrics",
  "/api/status",
  "/status", // Public status HTML page (iframe-friendly for hiai-dashboard)
  "/embed", // Public embed landing + status (auth is per-handler: /embed/dashboard requires API key)
  "/api/subscribers/public",
  "/api/badges",
  "/api/openapi.json",
  // Handler-level auth — bypasses Authorization-header middleware
  "/v1/traces", // OTLP handler: resolveApiKey() + lookupProject()
  "/v1/metrics", // OTLP handler: resolveApiKey() + lookupProject()
  "/api/logs/stream", // SSE handler: ?key=<apikey> query param
  "/api/observe/logs/stream", // Redirects to /api/logs/stream
  "/ws/logs", // WS handler: authenticates via the first "auth" message
  // Server-to-server admin endpoints (see docs/AUTH_BRIDGE.md §"Observe-side
  // implementation"). Each handler enforces ADMIN_API_KEY via requireAdminKey().
  // The global API-key guard must not run here — admin calls use a different
  // shared secret, not a project API key.
  "/api/admin",
  "/api/tenant", // Tenant health summary — admin-key gated at handler level (requireAdminKey)
];

function isPublicPath(path: string): boolean {
  return PUBLIC_PATHS.some((p) => path.startsWith(p)) || path === "/";
}

export { isPublicPath };

function shouldSkipAuth(path: string, method: string): boolean {
  return isPublicPath(path) || method === "OPTIONS";
}

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
