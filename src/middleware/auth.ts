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

// ── In-memory auth cache (API key → projectId) ────────────────────────────
const CACHE_TTL_MS = 60_000; // 60 seconds
const CACHE_MAX = 1_000;
const authCache = new Map<string, { projectId: string; expiresAt: number }>();

function cacheGet(key: string): string | null {
  const entry = authCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    authCache.delete(key);
    return null;
  }
  return entry.projectId;
}

function cacheSet(key: string, projectId: string): void {
  // Evict oldest entries if at capacity
  if (authCache.size >= CACHE_MAX) {
    const oldest = authCache.keys().next().value;
    if (oldest) authCache.delete(oldest);
  }
  authCache.set(key, { projectId, expiresAt: Date.now() + CACHE_TTL_MS });
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

    // Check cache first
    const cached = cacheGet(apiKey);
    if (cached) {
      return { projectId: cached };
    }

    // Cache miss — query DB
    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.apiKey, apiKey))
      .limit(1);

    if (!project) {
      set.status = 401;
      return { error: "Invalid API key" } as never;
    }

    // Cache the result
    cacheSet(apiKey, project.id);

    return { projectId: project.id };
  });
