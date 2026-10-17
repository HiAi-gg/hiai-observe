import { eq } from "drizzle-orm";
import { db } from "../store/db.js";
import { teamMembers } from "../store/schema.js";
import { staffAuth } from "./better-auth.js";

export type StaffSessionScope =
  | { kind: "anonymous" }
  | { kind: "denied" }
  | { kind: "forbidden"; reason: "project_required" | "project_mismatch" }
  | { kind: "allowed"; projectId?: string; projectIds: string[] };

// Session access is intentionally an explicit allowlist. Every entry below
// routes through applyScope; global infrastructure, auth/admin bridges,
// public embeds, and other unscoped GET handlers are excluded by default.
const STAFF_SESSION_READ_PREFIXES = [
  "/api/projects",
  "/api/dashboard",
  "/api/traces",
  "/api/comments",
  "/api/fingerprint-rules",
  "/api/maintenance",
  "/api/notifications",
  "/api/search",
  "/api/alerts",
  "/api/monitors",
  "/api/issues",
  "/api/events",
  "/api/incidents",
  "/api/sourcemaps",
  "/api/releases",
  "/api/logs",
  "/api/team",
  "/api/export",
  "/api/subscribers",
  "/api/saved-searches",
] as const;

const STAFF_SESSION_UNSCOPED_PATHS = new Set(["/api/alerts/channels", "/api/logs/stream"]);

export function isStaffSessionReadablePath(path: string): boolean {
  const pathname = path.split("?")[0]?.replace(/\/$/, "") || "/";
  if (STAFF_SESSION_UNSCOPED_PATHS.has(pathname)) return false;
  return STAFF_SESSION_READ_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

type StaffSession = {
  user?: {
    id?: string;
    email?: string;
    emailVerified?: boolean;
  };
  session?: {
    expiresAt?: Date | string;
  };
};

function requestedProjectId(request: Request): string | undefined {
  const url = new URL(request.url);
  const value = url.searchParams.get("projectId") ?? url.searchParams.get("project_id");
  return value?.trim() || undefined;
}

function hasExpired(expiresAt: Date | string | undefined): boolean {
  if (expiresAt === undefined) return true;
  const timestamp = expiresAt instanceof Date ? expiresAt.getTime() : Date.parse(expiresAt);
  return !Number.isFinite(timestamp) || timestamp <= Date.now();
}

/**
 * Resolve the server-side Better Auth session to an explicitly assigned
 * project. This is intentionally separate from API-key/admin auth: a staff
 * session is read-only and never receives instance-admin semantics.
 */
export async function resolveStaffSessionScope(request: Request): Promise<StaffSessionScope> {
  if (!staffAuth) return { kind: "anonymous" };

  let current: StaffSession | null;
  try {
    current = (await staffAuth.api.getSession({ headers: request.headers })) as StaffSession | null;
  } catch {
    return { kind: "anonymous" };
  }

  if (!current) return { kind: "anonymous" };
  const user = current.user;
  if (!user?.id) return { kind: "anonymous" };
  if (hasExpired(current.session?.expiresAt)) return { kind: "anonymous" };

  let memberships: Array<{ projectId: string; staffUserId: string | null }>;
  try {
    memberships = await db
      .select({ projectId: teamMembers.projectId, staffUserId: teamMembers.staffUserId })
      .from(teamMembers)
      .where(eq(teamMembers.staffUserId, user.id));
  } catch {
    return { kind: "denied" };
  }

  // Only explicit immutable bindings grant session access. Team contact email
  // is editable metadata, never an authorization or account-claim mechanism.
  const projectIds = [
    ...new Set(
      memberships
        .filter((membership) => membership.staffUserId === user.id)
        .map((membership) => membership.projectId),
    ),
  ];
  if (projectIds.length === 0) return { kind: "denied" };

  const requested = requestedProjectId(request);
  if (requested) {
    return projectIds.includes(requested)
      ? { kind: "allowed", projectId: requested, projectIds }
      : { kind: "forbidden", reason: "project_mismatch" };
  }

  if (projectIds.length === 1) {
    return { kind: "allowed", projectId: projectIds[0] as string, projectIds };
  }

  const pathname = new URL(request.url).pathname.replace(/\/$/, "");
  return pathname === "/api/projects"
    ? { kind: "allowed", projectIds }
    : { kind: "forbidden", reason: "project_required" };
}
