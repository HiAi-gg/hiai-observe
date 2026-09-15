import { staffAuth } from "./better-auth.js";

const SKIP_PREFIXES = ["/api", "/v1", "/ws", "/metrics", "/embed", "/status", "/health", "/login"];

function loginRedirect(): Response {
  return new Response(null, { status: 302, headers: { location: "/login" } });
}

export function isStaffUiPath(pathname: string): boolean {
  const path = pathname.split("?")[0] ?? pathname;
  if (SKIP_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) return false;
  if (path.includes(".")) return false;
  return true;
}

/** 302 /login for unauthenticated browser navigations to the staff SPA. */
export async function gateStaffUi(request: Request): Promise<Response | undefined> {
  if (request.method !== "GET" && request.method !== "HEAD") return undefined;
  const url = new URL(request.url);
  if (!isStaffUiPath(url.pathname)) return undefined;

  if (!staffAuth) {
    return loginRedirect();
  }

  const session = await staffAuth.api.getSession({ headers: request.headers });
  if (session?.user) return undefined;
  return loginRedirect();
}
