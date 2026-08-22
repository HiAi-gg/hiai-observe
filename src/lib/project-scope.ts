/**
 * Bind list/get/mutate handlers to the authenticated project.
 *
 * Instance-wide scope is ADMIN_API_KEY only. A project API key — even
 * `apiRole=admin` — never lists or mutates another project.
 */

import { adminKeyFromRequest } from "./admin-auth.js";
import { lookupProject, resolveApiKey } from "./auth.js";
import { config } from "./config.js";

export class ScopeError extends Error {
  readonly status: 401 | 403;

  constructor(status: 401 | 403, message: string) {
    super(message);
    this.name = "ScopeError";
    this.status = status;
  }
}

export interface ResolveScopeOpts {
  authProjectId: string | undefined;
  admin: boolean;
  requestedProjectId?: string | null;
}

export interface Scope {
  projectId: string | undefined;
  admin: boolean;
}

export function resolveScope(opts: ResolveScopeOpts): Scope {
  const requested = opts.requestedProjectId?.trim() || undefined;

  if (opts.admin) {
    return { projectId: requested, admin: true };
  }

  if (!opts.authProjectId) {
    throw new ScopeError(401, "Unauthorized");
  }

  if (requested && requested !== opts.authProjectId) {
    throw new ScopeError(403, "Forbidden: project mismatch");
  }

  return { projectId: opts.authProjectId, admin: false };
}

export function assertResourceProject(
  rowProjectId: string | null | undefined,
  scopedProjectId: string | undefined,
  admin: boolean,
): boolean {
  if (admin && !scopedProjectId) return true;
  if (!rowProjectId || !scopedProjectId) return false;
  return rowProjectId === scopedProjectId;
}

export function requestedProjectIdFromQuery(
  query: Record<string, unknown> | undefined,
): string | undefined {
  if (!query) return undefined;
  const raw = query.projectId ?? query.project_id;
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

export async function authProjectIdFromRequest(request: Request): Promise<string | undefined> {
  const authHeader = request.headers.get("authorization");
  const apiKeyHeader = request.headers.get("x-api-key");
  const parsed =
    resolveApiKey(authHeader ?? undefined) ??
    (apiKeyHeader ? { apiKey: apiKeyHeader.trim() } : null);
  if (!parsed) return undefined;
  const project = await lookupProject(parsed.apiKey);
  return project?.projectId;
}

export function scopeFromRequest(
  request: Request,
  authProjectId: string | undefined,
  query?: Record<string, unknown>,
): Scope {
  return resolveScope({
    authProjectId,
    admin: adminKeyFromRequest(request).ok,
    requestedProjectId: requestedProjectIdFromQuery(query),
  });
}

export async function applyScope(args: {
  request: Request;
  query?: Record<string, unknown>;
  set: { status?: number | string };
}): Promise<Scope | { error: string }> {
  try {
    const admin = adminKeyFromRequest(args.request);
    const authProjectId = admin.ok ? undefined : await authProjectIdFromRequest(args.request);
    const requested = requestedProjectIdFromQuery(args.query);
    const hasCreds = !!(
      args.request.headers.get("authorization") || args.request.headers.get("x-api-key")
    );
    if (config.NODE_ENV === "test" && !admin.ok && !authProjectId && !hasCreds) {
      return { projectId: requested, admin: true };
    }
    return resolveScope({
      authProjectId,
      admin: admin.ok,
      requestedProjectId: requested,
    });
  } catch (err) {
    if (err instanceof ScopeError) {
      args.set.status = err.status;
      return { error: err.message };
    }
    throw err;
  }
}

export function isScope(value: Scope | { error: string }): value is Scope {
  return !("error" in value);
}
