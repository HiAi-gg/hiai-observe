import { Elysia } from "elysia";
import { db } from "../store/db.js";
import { projects } from "../store/schema.js";
import { eq } from "drizzle-orm";

const PUBLIC_PATHS = [
  "/health",
  "/metrics",
  "/api/status",  // public status pages
  "/v1/traces",   // OTLP ingestion uses its own auth
  "/v1/metrics",  // OTLP ingestion uses its own auth
];

function isPublicPath(path: string): boolean {
  return PUBLIC_PATHS.some((p) => path.startsWith(p)) || path === "/";
}

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
    if (!authHeader) {
      set.status = 401;
      return { error: "Missing Authorization header" } as never;
    }

    let apiKey: string | undefined;

    // Bearer token
    if (authHeader.startsWith("Bearer ")) {
      apiKey = authHeader.slice(7).trim();
    }
    // X-API-Key header
    else if (authHeader.startsWith("X-API-Key ")) {
      apiKey = authHeader.slice(10).trim();
    }
    // Raw key (no prefix)
    else if (!authHeader.includes(" ")) {
      apiKey = authHeader.trim();
    }

    if (!apiKey) {
      set.status = 401;
      return { error: "Invalid Authorization format" } as never;
    }

    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.apiKey, apiKey))
      .limit(1);

    if (!project) {
      set.status = 401;
      return { error: "Invalid API key" } as never;
    }

    return { projectId: project.id };
  });
