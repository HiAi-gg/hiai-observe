/**
 * Alert Evaluation Worker
 *
 * Background worker that periodically evaluates all active alert rules
 * and dispatches notifications for triggered alerts.
 */

import { db } from "../store/db.js";
import { alertHistory } from "../store/schema.js";
import { evaluateRules, type AlertRule, } from "./rules-engine.js";
import { shouldFireAlert } from "./dedup.js";
import { dispatchAlert } from "./dispatcher.js";
import { getLatestHostStats } from "../store/infra.js";
import { desc, eq, } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { recordWorkerRun } from "../workers/health.js";

let intervalId: ReturnType<typeof setInterval> | null = null;
const EVALUATION_INTERVAL_MS = 60_000; // 60 seconds

/**
 * Check if an alert with escalation should re-fire.
 * If escalationMinutes is set and the last trigger was > escalationMinutes ago,
 * re-notify even if cooldown hasn't expired.
 */
async function checkEscalation(rule: AlertRule): Promise<boolean> {
  if (!rule.escalationMinutes) return false;

  const [lastHistory] = await db
    .select({ triggeredAt: alertHistory.triggeredAt })
    .from(alertHistory)
    .where(eq(alertHistory.alertId, rule.id))
    .orderBy(desc(alertHistory.triggeredAt))
    .limit(1);

  if (!lastHistory) return false;

  const elapsed = Date.now() - new Date(lastHistory.triggeredAt).getTime();
  const escalationMs = rule.escalationMinutes * 60 * 1000;

  return elapsed >= escalationMs;
}

/**
 * Run one evaluation cycle for all projects.
 */
async function runEvaluationCycle(): Promise<void> {
  try {
    // Fetch current host stats for resource threshold evaluation
    const hostStats = await getLatestHostStats();
    const resourceValues = hostStats
      ? {
          cpu: hostStats.cpuPercent,
          memory: hostStats.memoryTotalMb > 0
            ? (hostStats.memoryUsedMb / hostStats.memoryTotalMb) * 100
            : 0,
          disk: hostStats.diskTotalGb > 0
            ? (hostStats.diskUsedGb / hostStats.diskTotalGb) * 100
            : 0,
        }
      : undefined;

    // Get all unique project IDs with active alerts
    const activeAlerts = await db.query.alerts.findMany({
      where: (alerts, { eq }) => eq(alerts.isActive, true),
      columns: { projectId: true },
    });

    const projectIds = [...new Set(activeAlerts.map((a) => a.projectId))];

    for (const projectId of projectIds) {
      const triggered = await evaluateRules(projectId, resourceValues);

      for (const { rule, result } of triggered) {
        // Check cooldown before dispatching
        const canFire = await shouldFireAlert(rule.id, rule.cooldownSeconds);
        const isEscalation = !canFire && await checkEscalation(rule);

        if (!canFire && !isEscalation) {
          logger.debug("Alert in cooldown, skipping", { alertName: rule.name, alertId: rule.id });
          continue;
        }

        if (isEscalation) {
          logger.warn("Alert escalation re-notify", { alertName: rule.name, alertId: rule.id, escalationMinutes: rule.escalationMinutes });
        }

        await dispatchAlert(rule, result);
      }
    }

    recordWorkerRun("alert");
  } catch (err) {
    logger.error("Evaluation cycle error", { error: String(err) });
  }
}

/**
 * Start the alert evaluation worker.
 * Runs evaluation every 60 seconds.
 */
export function startAlertWorker(): void {
  if (intervalId) {
    logger.warn("Alert worker already running");
    return;
  }

  logger.info("Alert worker starting", { intervalSeconds: EVALUATION_INTERVAL_MS / 1000 });

  // Run immediately on start
  runEvaluationCycle();

  // Then run on interval
  intervalId = setInterval(runEvaluationCycle, EVALUATION_INTERVAL_MS);
}

/**
 * Stop the alert evaluation worker.
 */
export function stopAlertWorker(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info("Alert worker stopped");
  }
}

/**
 * Check if the worker is currently running.
 */
export function isWorkerRunning(): boolean {
  return intervalId !== null;
}
