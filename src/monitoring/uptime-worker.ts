import { and, eq } from "drizzle-orm";
import { shouldFireAlert } from "../alerts/dedup.js";
import { dispatchAlert } from "../alerts/dispatcher.js";
import type {
  AlertChannel,
  AlertCondition,
  AlertEvaluationResult,
  AlertRule,
  AlertSeverity,
} from "../alerts/rules-engine.js";
import { logger } from "../lib/logger.js";
import { db } from "../store/db.js";
import { alerts as alertsTable } from "../store/schema.js";
import { getMonitor, getMonitors, insertCheck } from "../store/uptime.js";
import { recordWorkerRun } from "../workers/health.js";
import { checkCert } from "./checks/cert-check.js";
import { runDnsCheck } from "./checks/dns-check.js";
import { runGrpcCheck } from "./checks/grpc-check.js";
import { type HttpCheckConfig, runHttpCheck } from "./checks/http-check.js";
import { runPingCheck } from "./checks/ping-check.js";
import { parseTcpTarget, runTcpCheck } from "./checks/tcp-check.js";

const CHECK_TIMEOUT_MS = 10_000;
const TCP_TIMEOUT_MS = 5_000;
const TICK_INTERVAL_MS = 10_000;

// Track next check time per monitor
const nextCheckAt = new Map<string, { nextAt: number; intervalSeconds: number }>();

// Track monitor state for recovery detection
const monitorState = new Map<string, { wasDown: boolean; consecutiveFailures: number }>();

// ── Main Tick ──────────────────────────────────────────────────────────────
async function tick() {
  const now = Date.now();

  try {
    const monitors = await getMonitors();
    const activeMonitors = monitors.filter((m: { active: boolean }) => m.active);
    const activeIds = new Set(activeMonitors.map((m: { id: string }) => m.id));

    // Clean up removed monitors. Snapshot the keys first to avoid mutating
    // the Map while iterating it (caused "Map iterator should not be mutated"
    // when a check is in-flight and a monitor is removed mid-tick).
    const idsToCheck = Array.from(nextCheckAt.keys());
    for (const id of idsToCheck) {
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
      dueMonitors.map(
        async (monitor: {
          id: string;
          url: string;
          type: string;
          intervalSeconds: number;
          method: string | null;
          headers: Record<string, string> | null;
          body: string | null;
          authType: string | null;
          authValue: string | null;
          ignoreSsl: boolean | null;
          maxRedirects: number | null;
          keyword: string | null;
          keywordNot: string | null;
          dnsRecordType: string | null;
          dnsExpectedValue: string | null;
          dnsResolver: string | null;
          host: string | null;
          port: number | null;
          tls: boolean | null;
          serviceName: string | null;
        }) => {
          let result: {
            statusCode: number | null;
            responseTimeMs: number;
            error: string | null;
            success: boolean;
            certExpiry: Date | null;
          };

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
            // Accept tcp://host:port, bare host:port, or { host, port } on the
            // monitor record. Fall back to port 0 → immediately DOWN rather
            // than crashing the worker.
            let tcpHost: string | null = null;
            let tcpPort = 0;
            const parsed = parseTcpTarget(monitor.url);
            if (parsed) {
              tcpHost = parsed.host;
              tcpPort = parsed.port;
            } else if (monitor.host && monitor.port) {
              tcpHost = monitor.host;
              tcpPort = monitor.port;
            }
            if (!tcpHost || tcpPort <= 0) {
              result = {
                statusCode: null,
                responseTimeMs: 0,
                error: `Invalid TCP target: "${monitor.url}" (expected tcp://host:port or host:port)`,
                success: false,
                certExpiry: null,
              };
            } else {
              const tcpResult = await runTcpCheck({
                host: tcpHost,
                port: tcpPort,
                timeoutMs: TCP_TIMEOUT_MS,
              });
              result = {
                statusCode: null,
                responseTimeMs: tcpResult.responseTimeMs,
                error: tcpResult.error ?? null,
                success: tcpResult.isUp,
                certExpiry: null,
              };
            }
          } else if (monitor.type === "grpc") {
            const grpcResult = await runGrpcCheck({
              host: monitor.host ?? new URL(monitor.url).hostname,
              port: monitor.port ?? 50051,
              timeout: CHECK_TIMEOUT_MS,
              serviceName: monitor.serviceName ?? "",
              tls: monitor.tls ?? false,
            });
            result = {
              statusCode: null,
              responseTimeMs: grpcResult.responseTime,
              error: grpcResult.error ?? null,
              success: grpcResult.isUp,
              certExpiry: null,
            };
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
                  const projectRules = await db
                    .select()
                    .from(alertsTable)
                    .where(
                      and(
                        eq(alertsTable.projectId, monitorRecord.projectId),
                        eq(alertsTable.isActive, true),
                      ),
                    );

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
                    logger.info("Recovery alert dispatched", {
                      ruleId: rule.id,
                      monitorId: monitor.id,
                    });
                    break; // Only one recovery alert per monitor
                  }
                }
              } catch (recoveryErr) {
                logger.error("Failed to dispatch recovery alert", {
                  error: String(recoveryErr),
                  monitorId: monitor.id,
                });
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
        },
      ),
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
  timer = setInterval(() => {
    tick().catch((err) => logger.error("Uptime tick error", { error: String(err) }));
  }, TICK_INTERVAL_MS);
  logger.info("Uptime worker started", { tickIntervalMs: TICK_INTERVAL_MS });
}

export function stopUptimeWorker() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  nextCheckAt.clear();
  monitorState.clear();
  running = false;
  logger.info("Uptime worker stopped");
}
