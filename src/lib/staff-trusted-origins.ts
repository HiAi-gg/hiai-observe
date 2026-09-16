const LAN_VITE_ORIGINS = ["http://127.0.0.1:5197", "http://localhost:5197"];

/**
 * Better Auth `trustedOrigins` for the staff UI.
 *
 * Production is explicit: `BETTER_AUTH_URL` plus optional
 * `BETTER_AUTH_TRUSTED_ORIGINS`. Non-production also allows the documented
 * LAN Vite origin (`:5197`) so sign-in from `/hiai-observe` is not rejected
 * as `Invalid origin` when the API listens on `:8001`.
 */
export function resolveStaffTrustedOrigins(opts: {
  betterAuthUrl: string;
  extra?: string;
  nodeEnv: string;
}): string[] {
  const extra = (opts.extra ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const origins = [opts.betterAuthUrl, ...extra];
  if (opts.nodeEnv !== "production") {
    for (const lan of LAN_VITE_ORIGINS) {
      if (!origins.includes(lan)) origins.push(lan);
    }
  }
  return origins;
}
