/**
 * Build staff-UI API paths without concatenating Vite's relative base onto
 * `location.origin`.
 *
 * `adapter-static` sets `import.meta.env.BASE_URL` to `./`. The previous join
 * `${origin}${base}${path}` produced `https://host:8449./api/dashboard`, which
 * `fetch` cannot parse. Prefer a same-origin path (`/api/...`) when the UI is
 * already served from the API origin (production :8449). Keep a path prefix
 * only when `kit.paths.base` is a real prefix such as `/hiai-observe`.
 */

export function normalizeAppBase(raw: string | undefined): string {
  let base = (raw ?? "").trim();
  if (base === "" || base === "." || base === "./" || base === "/") return "";
  base = base.replace(/\/+$/, "").replace(/\.+$/, "");
  if (base === "" || base === ".") return "";
  if (!base.startsWith("/")) base = `/${base}`;
  return base;
}

/** Strip a trailing `/` or a stray `.` after the port (`:8449.`). */
export function normalizeOrigin(raw: string | undefined): string {
  if (!raw) return "";
  return raw.trim().replace(/:(\d+)\.$/, ":$1").replace(/\/+$/, "");
}

export function joinApiUrl(
  path: string,
  options?: {
    origin?: string;
    appBase?: string;
    /** Prefix a normalized origin. Browser calls should omit this. */
    absolute?: boolean;
  },
): string {
  const trimmed = path.trim();
  const qIndex = trimmed.indexOf("?");
  const pathnamePart = qIndex === -1 ? trimmed : trimmed.slice(0, qIndex);
  const search = qIndex === -1 ? "" : trimmed.slice(qIndex + 1);
  const pathname = pathnamePart.startsWith("/") ? pathnamePart : `/${pathnamePart}`;
  const relative = `${normalizeAppBase(options?.appBase)}${pathname}${search ? `?${search}` : ""}`;

  if (!options?.absolute) return relative;
  const origin = normalizeOrigin(options.origin);
  return origin ? `${origin}${relative}` : relative;
}
