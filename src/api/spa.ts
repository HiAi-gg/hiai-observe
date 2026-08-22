/**
 * Serve the SvelteKit static build from the same process as the API.
 * API/OTLP/WS/embed/status paths are left to their plugins.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

const SKIP = ["/api", "/v1", "/ws", "/metrics", "/embed", "/status", "/health"];

function shouldSkip(pathname: string): boolean {
  return SKIP.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function contentType(filePath: string): string {
  if (filePath.endsWith(".js")) return "application/javascript";
  if (filePath.endsWith(".css")) return "text/css";
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  if (filePath.endsWith(".json")) return "application/json";
  if (filePath.endsWith(".woff2")) return "font/woff2";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".ico")) return "image/x-icon";
  return "application/octet-stream";
}

export function tryServeSpa(
  request: Request,
  set: { headers: Record<string, string | number> },
  rootDir = join(process.cwd(), "frontend/build"),
): Blob | undefined {
  const indexPath = join(rootDir, "index.html");
  if (!existsSync(indexPath)) return undefined;
  const url = new URL(request.url);
  if (request.method !== "GET" && request.method !== "HEAD") return undefined;
  if (shouldSkip(url.pathname)) return undefined;

  const relative = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\//, "");
  const candidate = join(rootDir, relative);
  if (!candidate.startsWith(rootDir)) return undefined;

  const file = existsSync(candidate) ? candidate : indexPath;
  set.headers["Content-Type"] = contentType(file);
  return Bun.file(file);
}
