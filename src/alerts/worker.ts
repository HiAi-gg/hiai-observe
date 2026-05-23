/**
 * Alert Evaluation Worker
 *
 * Background worker that periodically evaluates all active alert rules
 * and dispatches notifications for triggered alerts.
 */

import { db } from "../store/db.js";
import { alerts } from "../store/schema.js";
import { evaluateRules, type AlertRule, type AlertCondition, type AlertChannel } from "./rules-engine.js";
import { shouldFireAlert } from "./dedup.js";
import { dispatchAlert } from "./dispatcher.js";

let intervalId: ReturnType<typeof setInterval> | null = null;
const EVALUATION_INTERVAL_MS = 60_000; // 60 seconds

/**
 * Run one evaluation cycle for all projects.
 */
async function runEvaluationCycle(): Promise<void> {
  try {
    // Get all unique project IDs with active alerts
    const activeAlerts = await db.query.alerts.findMany({
      where: (alerts, { eq }) => eq(alerts.isActive, true),
      columns: { projectId: true },
    });

    const projectIds = [...new Set(activeAlerts.map((a) => a.projectId))];

    for (const projectId of projectIds) {
      const triggered = await evaluateRules(projectId);

      for (const { rule, result } of triggered) {
        // Check cooldown before dispatching
        const canFire = await shouldFireAlert(rule.id);
        if (!canFire) {
          console.log(
            `[Alert Worker] ${rule.name}: in cooldown, skipping`
          );
          continue;
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
