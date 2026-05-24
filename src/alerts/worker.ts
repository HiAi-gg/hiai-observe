/**
 * Alert Evaluation Worker
 *
 * Background worker that periodically evaluates all active alert rules
 * and dispatches notifications for triggered alerts.
 */

import { db } from "../store/db.js";
import { alerts, alertHistory } from "../store/schema.js";
import { evaluateRules, type AlertRule, type AlertCondition, type AlertChannel } from "./rules-engine.js";
import { shouldFireAlert } from "./dedup.js";
import { dispatchAlert } from "./dispatcher.js";
import { getLatestHostStats } from "../store/infra.js";
import { desc, and, eq, sql } from "drizzle-orm";

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
        const canFire = await shouldFireAlert(rule.id);
        const isEscalation = !canFire && await checkEscalation(rule);

        if (!canFire && !isEscalation) {
          console.log(
            `[Alert Worker] ${rule.name}: in cooldown, skipping`
          );
          continue;
        }

        if (isEscalation) {
          console.log(
            `[Alert Worker] ${rule.name}: ESCALATION re-notify after ${rule.escalationMinutes}min`
          );
        }

        await dispatchAlert(rule, result);
      }
    }
  } catch (err) {
    console.error("[Alert Worker] Evaluation cycle error:", err);
  }
}

/**
 * Start the alert evaluation worker.
 * Runs evaluation every 60 seconds.
 */
export function startAlertWorker(): void {
  if (intervalId) {
    console.warn("[Alert Worker] Already running");
    return;
  }

  console.log(
    `[Alert Worker] Starting with ${EVALUATION_INTERVAL_MS / 1000}s interval`
  );

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
    console.log("[Alert Worker] Stopped");
  }
}

/**
 * Check if the worker is currently running.
 */
export function isWorkerRunning(): boolean {
  return intervalId !== null;
}
