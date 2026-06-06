/**
 * Secure HTTP headers middleware for Elysia.
 *
 * Adds the following security headers to every response:
 * - Content-Security-Policy (strict default, opt-in per route for inline)
 * - Strict-Transport-Security (HSTS, production only)
 * - X-Content-Type-Options: nosniff
 * - X-Frame-Options: DENY (anti-clickjacking)
 * - Referrer-Policy: strict-origin-when-cross-origin
 * - Permissions-Policy: minimal allowlist
 * - Cross-Origin-Opener-Policy, Cross-Origin-Resource-Policy
 *
 * Use as a global Elysia plugin: `app.use(secureHeadersPlugin)`
 *
 * Per-route override example:
 *   .get('/status-page/:slug', ({ set }) => {
 *     set.headers['Content-Security-Policy'] = "'unsafe-inline'";  // for inline HTML
 *   })
 */
import { Elysia } from "elysia";

const IS_PROD = process.env.NODE_ENV === "production";

const DEFAULT_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const PERMISSIONS_POLICY = [
  "accelerometer=()",
  "camera=()",
  "geolocation=()",
  "gyroscope=()",
  "magnetometer=()",
  "microphone=()",
  "payment=()",
  "usb=()",
].join(", ");

export const secureHeadersPlugin = new Elysia({ name: "secure-headers" }).onAfterHandle(
  ({ set }) => {
    const h = set.headers as Record<string, string>;

    if (!h["Content-Security-Policy"]) h["Content-Security-Policy"] = DEFAULT_CSP;
    h["X-Content-Type-Options"] = "nosniff";
    h["X-Frame-Options"] = "DENY";
    h["Referrer-Policy"] = "strict-origin-when-cross-origin";
    h["Permissions-Policy"] = PERMISSIONS_POLICY;
    h["Cross-Origin-Opener-Policy"] = "same-origin";
    h["Cross-Origin-Resource-Policy"] = "same-site";
    h["X-Permitted-Cross-Domain-Policies"] = "none";

    if (IS_PROD) {
      h["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload";
    }
  },
);
