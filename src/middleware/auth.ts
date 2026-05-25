import { Elysia } from "elysia";
import { resolveApiKey, lookupProject } from "../lib/auth.js";

const PUBLIC_PATHS = [
  "/health",
  "/metrics",
  "/api/status",     // public status pages
  "/api/badges",     // public SVG badges (no auth)
  "/api/openapi.json", // public OpenAPI spec (no auth)
  "/v1/traces",      // OTLP ingestion uses its own auth
  "/v1/metrics",     // OTLP ingestion uses its own auth
];

function isPublicPath(path: string): boolean {
  return PUBLIC_PATHS.some((p) => path.startsWith(p)) || path === "/";
}

// ── Auth middleware ────────────────────────────────────────────────────────
export const authMiddleware = new Elysia()
  .derive(async ({ request, set }) => {
    const url = new URL(request.url);
    const path = url.pathname;

    // Skip auth for public paths and OPTIONS (CORS preflight)
    if (isPublicPath(path) || request.method === "OPTIONS") {
      return { projectId: undefined as string | undefined };
    }

    // Sentry-style auth: sentry-ingest handles its own auth
    if (path.startsWith("/api/") && path.includes("/store")) {
      return { projectId: undefined as string | undefined };
    }
    if (path.startsWith("/api/") && path.includes("/envelope")) {
      return { projectId: undefined as string | undefined };
    }

    const authHeader = request.headers.get("authorization");
    const apiKeyHeader = request.headers.get("x-api-key");

    const parsed = resolveApiKey(authHeader ?? undefined) ?? (apiKeyHeader ? { apiKey: apiKeyHeader.trim() } : null);
    if (!parsed) {
      set.status = 401;
      return { error: authHeader ? "Invalid Authorization format" : "Missing Authorization header" } as never;
    }

    const project = await lookupProject(parsed.apiKey);
    if (!project) {
      set.status = 401;
      return { error: "Invalid API key" } as never;
    }

    return { projectId: project.projectId };
  });
