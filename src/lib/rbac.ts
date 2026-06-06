import { db } from "../store/db.js";
import { projects } from "../store/schema.js";
import { eq } from "drizzle-orm";

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
