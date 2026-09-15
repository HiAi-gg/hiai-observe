import { Elysia } from "elysia";
import { staffAuth } from "../lib/better-auth.js";

/**
 * Native Better Auth handler at `/api/auth/*` — same mount as Admin/Post.
 * `parse: "none"` keeps Elysia from consuming the body before Better Auth.
 */
export const authRoutes = new Elysia({ prefix: "/api/auth" }).all(
  "/*",
  ({ request, set }) => {
    if (!staffAuth) {
      set.status = 503;
      return { error: "Staff auth is not configured. Set BETTER_AUTH_SECRET." };
    }
    return staffAuth.handler(request);
  },
  { parse: "none" },
);
