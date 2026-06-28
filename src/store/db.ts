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

export const client = postgres(connectionString, {
  max: 20,
  idle_timeout: 30,
  connect_timeout: 5,
});

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
