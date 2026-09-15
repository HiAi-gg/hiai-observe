import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../store/db.js";
import { account, session, user, verification } from "../store/schema.js";
import { config } from "./config.js";

function trustedOrigins(): string[] {
  const extra = (config.BETTER_AUTH_TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [config.BETTER_AUTH_URL, ...extra];
}

export const staffAuth = config.BETTER_AUTH_SECRET
  ? betterAuth({
      secret: config.BETTER_AUTH_SECRET,
      baseURL: config.BETTER_AUTH_URL,
      trustedOrigins: trustedOrigins(),
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
