import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../store/db.js";
import { account, session, user, verification } from "../store/schema.js";
import { config } from "./config.js";
import { resolveStaffTrustedOrigins } from "./staff-trusted-origins.js";

export const staffAuth = config.BETTER_AUTH_SECRET
  ? betterAuth({
      secret: config.BETTER_AUTH_SECRET,
      baseURL: config.BETTER_AUTH_URL,
      trustedOrigins: resolveStaffTrustedOrigins({
        betterAuthUrl: config.BETTER_AUTH_URL,
        extra: config.BETTER_AUTH_TRUSTED_ORIGINS,
        nodeEnv: config.NODE_ENV,
      }),
      database: drizzleAdapter(db, {
        provider: "pg",
        schema: { user, session, account, verification },
      }),
      emailAndPassword: { enabled: true },
      advanced: {
        database: { generateId: () => crypto.randomUUID() },
      },
    })
  : null;
