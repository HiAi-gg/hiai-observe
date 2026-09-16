const DEFAULT_DEV_DATABASE_URL = "postgresql://observe:observe@localhost:5432/hiai_observe";

/** Unreachable on purpose: unit tests may import db.ts but must not hit shared Postgres. */
const TEST_REFUSED_DATABASE_URL = "postgresql://observe_test:invalid@127.0.0.1:1/hiai_observe_test";

export function resolveConnectionString(opts: { databaseUrl?: string; nodeEnv: string }): string {
  if (opts.databaseUrl) return opts.databaseUrl;
  if (opts.nodeEnv === "production") {
    throw new Error("DATABASE_URL is required in production");
  }
  if (opts.nodeEnv === "test") {
    return TEST_REFUSED_DATABASE_URL;
  }
  return DEFAULT_DEV_DATABASE_URL;
}
