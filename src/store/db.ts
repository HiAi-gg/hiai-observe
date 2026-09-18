import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { config } from "../lib/config.js";
import { setDbPoolStats } from "../middleware/metrics.js";
import * as schema from "./schema.js";

const DEFAULT_DEV_DATABASE_URL = "postgresql://observe:observe@localhost:5432/hiai_observe";

const connectionString =
  config.DATABASE_URL ??
  (config.NODE_ENV === "production"
    ? (() => {
        throw new Error("DATABASE_URL is required in production");
      })()
    : DEFAULT_DEV_DATABASE_URL);

/**
 * postgres.js 3.4 forwards `?host=/path` as a Postgres GUC
 * (`unrecognized configuration parameter "host"`). When the URL query host is
 * a unix socket directory, connect with `path` and do not pass that URL.
 */
function unixSocketClientOptions(url: string): {
  path: string;
  user: string;
  database: string;
  pass: string;
} | undefined {
  try {
    const parsed = new URL(url);
    const host = parsed.searchParams.get("host");
    if (!host?.startsWith("/")) return undefined;
    return {
      path: `${host.replace(/\/$/, "")}/.s.PGSQL.5432`,
      user: decodeURIComponent(parsed.username || "postgres"),
      database: (parsed.pathname || "").replace(/^\//, "") || "hiai_observe",
      pass: decodeURIComponent(parsed.password || ""),
    };
  } catch {
    return undefined;
  }
}

const socketOpts = unixSocketClientOptions(connectionString);
const clientOptions = { max: 20, idle_timeout: 30, connect_timeout: 5 } as const;

export const client = socketOpts
  ? postgres({ ...socketOpts, ...clientOptions })
  : postgres(connectionString, clientOptions);

export const db = drizzle(client, { schema });

/** Periodically collect DB pool stats from pg_stat_activity. */
const DB_NAME = (() => {
  try {
    return new URL(connectionString).pathname.slice(1);
  } catch {
    return "hiai_observe";
  }
})();

async function collectPoolStats() {
  try {
    const rows = await client<{ state: string; count: number }[]>`
      SELECT state, count(*)::int
      FROM pg_stat_activity
      WHERE datname = ${DB_NAME} AND pid != pg_backend_pid()
      GROUP BY state
    `;
    let active = 0;
    let idle = 0;
    for (const row of rows) {
      if (row.state === "active") active = row.count;
      else idle += row.count;
    }
    setDbPoolStats({ active, idle, waiting: 0 });
  } catch {
    // silently skip if DB unavailable
  }
}

// Collect every 15 seconds
setInterval(collectPoolStats, 15_000);
// Initial collection after 1 second (let app start first)
setTimeout(collectPoolStats, 1_000);
