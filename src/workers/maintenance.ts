/**
 * Maintenance Worker — Weekly VACUUM ANALYZE on high-churn tables.
 *
 * Keeps table statistics up-to-date and reclaims dead tuple storage.
 * Runs once every 7 days via setInterval.
 */

import { db } from "../store/db.js";
import { sql } from "drizzle-orm";
import { recordWorkerRun } from "./health.js";
import { logger } from "../lib/logger.js";

/** High-churn tables that benefit from regular VACUUM ANALYZE. */
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

async function runVacuumAnalyze(): Promise<void> {
  logger.info("Maintenance: starting VACUUM ANALYZE cycle", { tables: HIGH_CHURN_TABLES.length });
  let successCount = 0;
  let failCount = 0;

  for (const tableName of HIGH_CHURN_TABLES) {
    try {
      await db.execute(sql`VACUUM ANALYZE ${sql.raw(tableName)}`);
      successCount++;
      logger.debug(`Maintenance: VACUUM ANALYZE ${tableName} complete`);
    } catch (err) {
      failCount++;
      logger.error(`Maintenance: VACUUM ANALYZE ${tableName} failed`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info("Maintenance: VACUUM ANALYZE cycle complete", { successCount, failCount });
  recordWorkerRun("maintenance");
}

export function startMaintenanceWorker(): void {
  if (intervalId) return;

  logger.info("Maintenance worker starting", { intervalDays: 7, tables: HIGH_CHURN_TABLES.length });

  // Run initial cycle after 60s to let the app fully start
  setTimeout(() => {
    runVacuumAnalyze().catch((err) =>
      logger.error("Maintenance: initial VACUUM ANALYZE failed", { error: String(err) })
    );
  }, 60_000);

  intervalId = setInterval(() => {
    runVacuumAnalyze().catch((err) =>
      logger.error("Maintenance: VACUUM ANALYZE cycle failed", { error: String(err) })
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
