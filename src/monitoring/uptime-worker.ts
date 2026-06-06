import { getMonitors, insertCheck, getMonitor } from "../store/uptime.js";
import { dispatchAlert } from "../alerts/dispatcher.js";
import { shouldFireAlert } from "../alerts/dedup.js";
import { db } from "../store/db.js";
import { alerts as alertsTable } from "../store/schema.js";
import { eq, and } from "drizzle-orm";
import type { AlertRule, AlertCondition, AlertChannel, AlertEvaluationResult, AlertSeverity } from "../alerts/rules-engine.js";
import { recordWorkerRun } from "../workers/health.js";
import { logger } from "../lib/logger.js";
import { checkCert } from "./checks/cert-check.js";
import { runDnsCheck } from "./checks/dns-check.js";
import { runPingCheck } from "./checks/ping-check.js";
import { runHttpCheck, type HttpCheckConfig } from "./checks/http-check.js";

const CHECK_TIMEOUT_MS = 10_000;
const _TCP_TIMEOUT_MS = 5_000;
const TICK_INTERVAL_MS = 10_000;

// Track next check time per monitor
const nextCheckAt = new Map<string, { nextAt: number; intervalSeconds: number }>();

// Track monitor state for recovery detection
const monitorState = new Map<string, { wasDown: boolean; consecutiveFailures: number }>();

// ── TCP Check ──────────────────────────────────────────────────────────────
async function runTcpCheck(
  url: string
): Promise<{ statusCode: null; responseTimeMs: number; error: string | null; success: boolean; certExpiry: null }> {
  const start = Date.now();
  const urlObj = new URL(url);
  const host = urlObj.hostname;
  const port = Number(urlObj.port) || (urlObj.protocol === "https:" ? 443 : 80);

  try {
    const socket = await Bun.connect({
      hostname: host,
      port,
      socket: {
        data() {},
        error() {},
        open() {},
        close() {},
      },
    });
    const responseTimeMs = Date.now() - start;
    socket.end();

    return {
      statusCode: null,
      responseTimeMs,
      error: null,
      success: true,
      certExpiry: null,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Connection refused";
    return {
      statusCode: null,
      responseTimeMs: Date.now() - start,
      error: message,
      success: false,
      certExpiry: null,
    };
  }
}

// ── Main Tick ──────────────────────────────────────────────────────────────
async function tick() {
  const now = Date.now();

  try {
    const monitors = await getMonitors();
    const activeMonitors = monitors.filter((m: { active: boolean }) => m.active);
    const activeIds = new Set(activeMonitors.map((m: { id: string }) => m.id));

    // Clean up removed monitors
    for (const id of nextCheckAt.keys()) {
      if (!activeIds.has(id)) {
        nextCheckAt.delete(id);
        monitorState.delete(id);
      }
    }

    // Add new monitors or update intervals
    for (const monitor of activeMonitors) {
      const existing = nextCheckAt.get(monitor.id);
      if (!existing) {
        nextCheckAt.set(monitor.id, { nextAt: now, intervalSeconds: monitor.intervalSeconds });
      } else if (existing.intervalSeconds !== monitor.intervalSeconds) {
        existing.intervalSeconds = monitor.intervalSeconds;
      }
    }

    // Find monitors due for check
    const dueMonitors = activeMonitors.filter((m: { id: string }) => {
      const schedule = nextCheckAt.get(m.id);
      return schedule && now >= schedule.nextAt;
    });

    if (dueMonitors.length === 0) {
      recordWorkerRun("uptime");
      return;
    }

    await Promise.allSettled(
      dueMonitors.map(async (monitor: {
        id: string; url: string; type: string; intervalSeconds: number;
        method: string | null; headers: Record<string, string> | null; body: string | null;
        authType: string | null; authValue: string | null; ignoreSsl: boolean | null; maxRedirects: number | null;
        keyword: string | null; keywordNot: string | null;
        dnsRecordType: string | null; dnsExpectedValue: string | null; dnsResolver: string | null;
      }) => {
        let result: { statusCode: number | null; responseTimeMs: number; error: string | null; success: boolean; certExpiry: Date | null };

        if (monitor.type === "dns") {
          let hostname: string;
          try {
            hostname = new URL(monitor.url).hostname;
          } catch {
            hostname = monitor.url;
          }
          const dnsResult = await runDnsCheck({
            host: hostname,
            recordType: monitor.dnsRecordType ?? "A",
            expectedValue: monitor.dnsExpectedValue ?? undefined,
            resolver: monitor.dnsResolver ?? undefined,
          });
          result = {
            statusCode: null,
            responseTimeMs: dnsResult.responseTimeMs,
            error: dnsResult.error ?? null,
            success: dnsResult.status === "up",
            certExpiry: null,
          };
        } else if (monitor.type === "ping") {
          let hostname: string;
          try {
            hostname = new URL(monitor.url).hostname;
          } catch {
            hostname = monitor.url;
          }
          const pingResult = await runPingCheck({
            host: hostname,
            timeoutMs: CHECK_TIMEOUT_MS,
          });
          result = {
            statusCode: null,
            responseTimeMs: pingResult.responseTimeMs,
            error: pingResult.error ?? null,
            success: pingResult.status === "up",
            certExpiry: null,
          };
        } else if (monitor.type === "tcp") {
          result = await runTcpCheck(monitor.url);
        } else {
          result = await runHttpCheck(monitor.url, {
            method: (monitor.method ?? "GET") as HttpCheckConfig["method"],
            headers: monitor.headers ?? undefined,
            body: monitor.body ?? undefined,
            authType: (monitor.authType ?? undefined) as HttpCheckConfig["authType"],
            authValue: monitor.authValue ?? undefined,
            maxRedirects: monitor.maxRedirects ?? undefined,
            keyword: monitor.keyword ?? undefined,
            keywordNot: monitor.keywordNot ?? undefined,
          });
        }

        await insertCheck({
          monitorId: monitor.id,
          statusCode: result.statusCode,
          responseTimeMs: result.responseTimeMs,
          error: result.error,
          success: result.success,
          certExpiry: result.certExpiry,
        });

        // Recovery detection
        const state = monitorState.get(monitor.id) ?? { wasDown: false, consecutiveFailures: 0 };
        if (result.success) {
          if (state.wasDown) {
            logger.info("Monitor recovery detected", { monitorId: monitor.id, url: monitor.url });
            // Fire recovery notification via alert system
            try {
              const monitorRecord = await getMonitor(monitor.id);
              if (monitorRecord?.projectId) {
                const projectRules = await db.select()
                  .from(alertsTable)
                  .where(and(
                    eq(alertsTable.projectId, monitorRecord.projectId),
                    eq(alertsTable.isActive, true),
                  ));

                for (const ruleRow of projectRules) {
                  const condition = ruleRow.condition as AlertCondition | null;
                  if (condition?.type !== "uptime_down") continue;

                  const rule: AlertRule = {
                    id: ruleRow.id,
                    name: ruleRow.name,
                    projectId: ruleRow.projectId,
                    severity: (ruleRow.severity as AlertSeverity) ?? "warning",
                    condition,
                    channels: (ruleRow.channels as AlertChannel[]) ?? [],
                    isActive: ruleRow.isActive,
                    cooldownSeconds: ruleRow.cooldownSeconds,
                    createdAt: ruleRow.createdAt,
                  };

                  const recoveryResult: AlertEvaluationResult = {
                    triggered: true,
                    currentValue: 0,
                    threshold: condition.consecutiveFailures ?? 3,
                    message: `Monitor "${monitor.url}" recovered — back online`,
                  };

                  const canFire = await shouldFireAlert(`${rule.id}:recovery`);
                  if (!canFire) continue;
                  await dispatchAlert(rule, recoveryResult, "recovered");
                  logger.info("Recovery alert dispatched", { ruleId: rule.id, monitorId: monitor.id });
                  break; // Only one recovery alert per monitor
                }
              }
            } catch (recoveryErr) {
              logger.error("Failed to dispatch recovery alert", { error: String(recoveryErr), monitorId: monitor.id });
            }
          }
          state.wasDown = false;
          state.consecutiveFailures = 0;
        } else {
          state.consecutiveFailures++;
          if (state.consecutiveFailures >= 3) {
            state.wasDown = true;
          }
        }
        monitorState.set(monitor.id, state);

        // Schedule next check
        const schedule = nextCheckAt.get(monitor.id);
        if (schedule) {
          schedule.nextAt = now + monitor.intervalSeconds * 1000;
        }
      })
    );

    recordWorkerRun("uptime");
  } catch (err) {
    logger.error("Uptime tick error", { error: String(err) });
  }
}

let running = false;
let timer: ReturnType<typeof setInterval> | null = null;

export function startUptimeWorker() {
  if (running) return;
  running = true;
  tick().catch((err) => logger.error("Uptime tick error on startup", { error: String(err) }));
  timer = setInterval(() => { tick().catch((err) => logger.error("Uptime tick error", { error: String(err) })); }, TICK_INTERVAL_MS);
  logger.info("Uptime worker started", { tickIntervalMs: TICK_INTERVAL_MS });
}

export function stopUptimeWorker() {
  if (timer) { clearInterval(timer); timer = null; }
  nextCheckAt.clear();
  monitorState.clear();
  running = false;
  logger.info("Uptime worker stopped");
}
