/**
 * Maintenance Worker — Weekly ANALYZE on high-churn tables.
 *
 * Keeps table statistics up-to-date for the query planner.
 * Note: we use ANALYZE (transactional) instead of VACUUM ANALYZE because
 * VACUUM cannot run inside a transaction block, and Drizzle's db.execute()
 * wraps statements in implicit transactions. ANALYZE alone updates planner
 * statistics and is safe to run from worker code; storage reclamation should
 * be handled by autovacuum or an out-of-band maintenance job.
 * Runs once every 7 days via setInterval.
 */

import { sql } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { db } from "../store/db.js";
import { recordWorkerRun } from "./health.js";

/** High-churn tables that benefit from regular ANALYZE. */
const HIGH_CHURN_TABLES = [
  "events",
  "traces",
  "logs",
  "container_stats",
  "host_stats",
  "uptime_checks",
  "alert_history",
];

const INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

let intervalId: ReturnType<typeof setInterval> | null = null;

async function runAnalyze(): Promise<void> {
  logger.info("Maintenance: starting ANALYZE cycle", {
    tables: HIGH_CHURN_TABLES.length,
  });
  let successCount = 0;
  let failCount = 0;

  for (const tableName of HIGH_CHURN_TABLES) {
    try {
      await db.execute(sql`ANALYZE ${sql.identifier(tableName)}`);
      successCount++;
      logger.debug(`Maintenance: ANALYZE ${tableName} complete`);
    } catch (err) {
      failCount++;
      logger.error(`Maintenance: ANALYZE ${tableName} failed`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info("Maintenance: ANALYZE cycle complete", {
    successCount,
    failCount,
  });
  recordWorkerRun("maintenance");
}

export function startMaintenanceWorker(): void {
  if (intervalId) return;

  logger.info("Maintenance worker starting", {
    intervalDays: 7,
    tables: HIGH_CHURN_TABLES.length,
  });

  // Run initial cycle after 60s to let the app fully start
  setTimeout(() => {
    runAnalyze().catch((err) =>
      logger.error("Maintenance: initial ANALYZE failed", {
        error: String(err),
      }),
    );
  }, 60_000);

  intervalId = setInterval(() => {
    runAnalyze().catch((err) =>
      logger.error("Maintenance: ANALYZE cycle failed", { error: String(err) }),
    );
  }, INTERVAL_MS);
}

export function stopMaintenanceWorker(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info("Maintenance worker stopped");
  }
}
