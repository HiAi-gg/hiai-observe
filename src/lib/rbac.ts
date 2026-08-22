import { eq } from "drizzle-orm";
import { db } from "../store/db.js";
import { projects } from "../store/schema.js";

export type ApiRole = "admin" | "member" | "readonly";

const ROLE_PERMISSIONS: Record<ApiRole, string[]> = {
  admin: ["read", "write", "delete", "manage"],
  member: ["read", "write", "delete"],
  readonly: ["read"],
};

const MUTATION_METHODS = new Set(["POST", "PUT", "DELETE", "PATCH"]);

export async function getApiRole(projectId: string): Promise<ApiRole> {
  const rows = await db
    .select({ apiRole: projects.apiRole })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  return rows[0]?.apiRole ?? "member";
}

function hasPermission(role: ApiRole, action: string): boolean {
  const perms = ROLE_PERMISSIONS[role] ?? [];
  return perms.includes(action);
}

export async function checkWriteAccess(projectId: string, method: string): Promise<boolean> {
  if (!MUTATION_METHODS.has(method)) return true;
  const role = await getApiRole(projectId);
  return hasPermission(role, "write");
}

export async function checkDeleteAccess(projectId: string): Promise<boolean> {
  const role = await getApiRole(projectId);
  return hasPermission(role, "delete");
}

export async function checkAdminAccess(projectId: string): Promise<boolean> {
  const role = await getApiRole(projectId);
  return hasPermission(role, "manage");
}

/** Tenant deletes require member/admin. Instance admin is unrestricted. */
export async function denyIfCannotDelete(
  scope: { admin: boolean; projectId: string | undefined },
  set: { status?: number | string },
): Promise<{ error: string } | null> {
  if (scope.admin) return null;
  if (!scope.projectId || !(await checkDeleteAccess(scope.projectId))) {
    set.status = 403;
    return { error: "Forbidden: delete requires member or admin role" };
  }
  return null;
}
