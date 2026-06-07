/**
 * Alert Rules Evaluation Engine
 *
 * Evaluates alert conditions against current data and determines
 * whether alerts should fire based on thresholds and time windows.
 */

import { db } from "../store/db.js";
import { events, traces, maintenanceWindows } from "../store/schema.js";
import { eq, and, gte, lte, sql, count } from "drizzle-orm";
import { castDbRows } from "../lib/db-types.js";
import { z } from "zod";
import { logger } from "../lib/logger.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AlertConditionType =
  | "error_rate"
  | "uptime_down"
  | "resource_threshold"
  | "trace_error"
  | "token_usage"
  | "recovery"
  | "cert_expiry";

export type ComparisonOperator = "gt" | "lt" | "eq" | "gte" | "lte";

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

export const AlertConditionSchema = z.object({
  type: z.enum(["error_rate", "uptime_down", "resource_threshold", "trace_error", "token_usage", "recovery", "cert_expiry"]),
  threshold: z.number(),
  duration: z.number().optional(),
  operator: z.enum(["gt", "lt", "eq", "gte", "lte"]),
  consecutiveFailures: z.number().optional(),
  resource: z.enum(["cpu", "memory", "disk"]).optional(),
  model: z.string().optional(),
  host: z.string().optional(),
  port: z.number().optional(),
});

export const AlertChannelSchema = z.object({
  type: z.enum(["telegram", "discord", "email", "slack", "webhook", "pagerduty", "teams", "ntfy", "gotify", "pushover"]),
  target: z.string(),
});

export const AlertSeveritySchema = z.enum(["critical", "warning", "info"]);

export type AlertCondition = z.infer<typeof AlertConditionSchema>;
export type AlertChannel = z.infer<typeof AlertChannelSchema>;
export type AlertSeverity = z.infer<typeof AlertSeveritySchema>;

export interface AlertRule {
  id: string;
  name: string;
  projectId: string;
  severity: AlertSeverity;
  condition: AlertCondition;
  channels: AlertChannel[];
  isActive: boolean;
  cooldownSeconds: number;
  escalationMinutes?: number;
  createdAt: Date;
}

export interface AlertEvaluationResult {
  triggered: boolean;
  currentValue: number;
  threshold: number;
  message: string;
}

// ─── Comparison Helpers ────────────────────────────────────────────────────────

function compare(
  value: number,
  operator: ComparisonOperator,
  threshold: number
): boolean {
  switch (operator) {
    case "gt":
      return value > threshold;
    case "lt":
      return value < threshold;
    case "eq":
      return value === threshold;
    case "gte":
      return value >= threshold;
    case "lte":
      return value <= threshold;
  }
}

// ─── Condition Evaluators ──────────────────────────────────────────────────────

async function evaluateErrorRate(
  condition: AlertCondition,
  projectId: string
): Promise<AlertEvaluationResult> {
  const windowStart = new Date(
    Date.now() - (condition.duration ?? 300) * 1000
  );

  const [row] = await db
    .select({ cnt: count() })
    .from(events)
    .where(
      and(
        eq(events.projectId, projectId),
        gte(events.createdAt, windowStart)
      )
    );

  const errorCount = row?.cnt ?? 0;
  const durationMinutes = (condition.duration ?? 300) / 60;
  const errorRate = errorCount / Math.max(durationMinutes, 1);
  const triggered = compare(errorRate, condition.operator, condition.threshold);

  return {
    triggered,
    currentValue: Math.round(errorRate * 100) / 100,
    threshold: condition.threshold,
    message: `Error rate: ${errorRate.toFixed(2)}/min (threshold: ${condition.operator} ${condition.threshold}/min)`,
  };
}

async function evaluateUptimeDown(
  condition: AlertCondition,
  projectId: string
): Promise<AlertEvaluationResult> {
  const consecutiveFailures = condition.consecutiveFailures ?? 3;

  // Get monitors for this project — we need the uptime_monitors table
  // Query recent checks grouped by monitor, check for consecutive failures
  const recentChecks = await db.execute(
    sql`SELECT uc.monitor_id, uc.status_code, uc.success
        FROM uptime_checks uc
        JOIN uptime_monitors um ON uc.monitor_id = um.id
        WHERE um.project_id = ${projectId}
        ORDER BY uc.checked_at DESC
        LIMIT ${consecutiveFailures * 10}`
  );

  // Group by monitor and count consecutive failures
  const monitorChecks = new Map<string, Array<{ status_code: number | null; success: boolean }>>();
  const checkRows = castDbRows<{ monitor_id: string; status_code: number | null; success: boolean }>(recentChecks);
  for (const check of checkRows) {
    const checks = monitorChecks.get(check.monitor_id) ?? [];
    checks.push({ status_code: check.status_code, success: check.success });
    monitorChecks.set(check.monitor_id, checks);
  }

  let worstConsecutive = 0;
  for (const [, checks] of monitorChecks) {
    let consecutive = 0;
    for (const check of checks) {
      // Detect failure: either bad status code, or (for DNS/Ping) success === false
      const isFailure =
        (check.status_code !== null && (check.status_code < 200 || check.status_code >= 400)) ||
        (check.status_code === null && !check.success);
      if (isFailure) {
        consecutive++;
        worstConsecutive = Math.max(worstConsecutive, consecutive);
      } else {
        break;
      }
    }
  }

  const triggered = compare(
    worstConsecutive,
    condition.operator,
    consecutiveFailures
  );

  return {
    triggered,
    currentValue: worstConsecutive,
    threshold: consecutiveFailures,
    message: `Consecutive failures: ${worstConsecutive} (threshold: ${condition.operator} ${consecutiveFailures})`,
  };
}

async function evaluateResourceThreshold(
  condition: AlertCondition,
  _projectId: string,
  resourceValues?: { cpu?: number; memory?: number; disk?: number }
): Promise<AlertEvaluationResult> {
  const resource = condition.resource ?? "cpu";
  const value = resourceValues?.[resource] ?? 0;
  const triggered = compare(value, condition.operator, condition.threshold);

  return {
    triggered,
    currentValue: Math.round(value * 100) / 100,
    threshold: condition.threshold,
    message: `Resource ${resource}: ${value.toFixed(1)}% (threshold: ${condition.operator} ${condition.threshold}%)`,
  };
}

async function evaluateTraceError(
  condition: AlertCondition,
  projectId: string
): Promise<AlertEvaluationResult> {
  const windowStart = new Date(
    Date.now() - (condition.duration ?? 300) * 1000
  );

  const [row] = await db
    .select({ cnt: count() })
    .from(traces)
    .where(
      and(
        eq(traces.projectId, projectId),
        eq(traces.status, "ERROR"),
        gte(traces.startTime, windowStart)
      )
    );

  const errorCount = row?.cnt ?? 0;
  const triggered = compare(
    errorCount,
    condition.operator,
    condition.threshold
  );

  return {
    triggered,
    currentValue: errorCount,
    threshold: condition.threshold,
    message: `Trace errors in window: ${errorCount} (threshold: ${condition.operator} ${condition.threshold})`,
  };
}

async function evaluateTokenUsage(
  condition: AlertCondition,
  projectId: string
): Promise<AlertEvaluationResult> {
  const windowStart = new Date(
    Date.now() - (condition.duration ?? 3600) * 1000
  );

  // Sum token usage from trace attributes
  const result = await db.execute(
    sql`SELECT COALESCE(SUM((attributes->>'usage.total_tokens')::int), 0) as total
        FROM traces
        WHERE project_id = ${projectId}
          AND start_time >= ${windowStart.toISOString()}
          AND attributes ? 'usage.total_tokens'`
  );

  const resultRows = castDbRows<{ total: number }>(result);
  const totalTokens = Number(resultRows[0]?.total ?? 0);
  const triggered = compare(
    totalTokens,
    condition.operator,
    condition.threshold
  );

  return {
    triggered,
    currentValue: totalTokens,
    threshold: condition.threshold,
    message: `Token usage in window: ${totalTokens} (threshold: ${condition.operator} ${condition.threshold})`,
  };
}

async function evaluateCertExpiry(
  condition: AlertCondition,
  _projectId: string
): Promise<AlertEvaluationResult> {
  const host = condition.host;
  if (!host) {
    return {
      triggered: false,
      currentValue: 0,
      threshold: condition.threshold,
      message: "cert_expiry condition requires 'host' field",
    };
  }

  try {
    const { checkCert } = await import("../monitoring/checks/cert-check.js");
    const certInfo = await checkCert(host, condition.port ?? 443);
    const triggered = compare(certInfo.daysRemaining, condition.operator, condition.threshold);

    return {
      triggered,
      currentValue: certInfo.daysRemaining,
      threshold: condition.threshold,
      message: `SSL cert for ${host} expires in ${certInfo.daysRemaining} days (threshold: ${condition.operator} ${condition.threshold} days, issuer: ${certInfo.issuer})`,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return {
      triggered: false,
      currentValue: 0,
      threshold: condition.threshold,
      message: `Cert check failed for ${host}: ${errorMessage}`,
    };
  }
}

// ─── Maintenance Window Check ─────────────────────────────────────────────────

/**
 * Check if a project currently has an active maintenance window.
 * If monitorIds is empty on the window, it suppresses ALL alerts for the project.
 * If monitorIds is non-empty, it only suppresses alerts for those specific monitors.
 */
export async function isInMaintenanceWindow(
  projectId: string,
  monitorIds?: string[]
): Promise<boolean> {
  const now = new Date();

  const activeWindows = await db
    .select()
    .from(maintenanceWindows)
    .where(
      and(
        eq(maintenanceWindows.projectId, projectId),
        lte(maintenanceWindows.startsAt, now),
        gte(maintenanceWindows.endsAt, now)
      )
    );

  if (activeWindows.length === 0) return false;

  // If any window has empty monitorIds, it covers all monitors
  const coversAll = activeWindows.some(
    (w) => !w.monitorIds || (w.monitorIds as string[]).length === 0
  );
  if (coversAll) return true;

  // If specific monitors provided, check if any window covers them
  if (monitorIds && monitorIds.length > 0) {
    const suppressedIds = new Set<string>();
    for (const w of activeWindows) {
      for (const id of (w.monitorIds as string[]) ?? []) {
        suppressedIds.add(id);
      }
    }
    return monitorIds.some((id) => suppressedIds.has(id));
  }

  // No specific monitors to check, but windows exist with specific monitor IDs
  // Since we don't know which monitors this alert covers, be conservative: suppress
  return true;
}

// ─── Main Evaluation ──────────────────────────────────────────────────────────

/**
 * Evaluate a single alert rule's condition against current data.
 */
export async function checkCondition(
  rule: AlertRule,
  resourceValues?: { cpu?: number; memory?: number; disk?: number }
): Promise<AlertEvaluationResult> {
  const { condition, projectId } = rule;

  switch (condition.type) {
    case "error_rate":
      return evaluateErrorRate(condition, projectId);
    case "uptime_down":
      return evaluateUptimeDown(condition, projectId);
    case "resource_threshold":
      return evaluateResourceThreshold(condition, projectId, resourceValues);
    case "trace_error":
      return evaluateTraceError(condition, projectId);
    case "token_usage":
      return evaluateTokenUsage(condition, projectId);
    case "recovery":
      return {
        triggered: true,
        currentValue: 1,
        threshold: 0,
        message: "Service recovered — back online",
      };
    case "cert_expiry":
      return evaluateCertExpiry(condition, projectId);
    default:
      return {
        triggered: false,
        currentValue: 0,
        threshold: 0,
        message: `Unknown condition type: ${condition.type}`,
      };
  }
}

/**
 * Evaluate all active rules for a project.
 * Returns only the rules that triggered.
 */
export async function evaluateRules(
  projectId: string,
  resourceValues?: { cpu?: number; memory?: number; disk?: number }
): Promise<Array<{ rule: AlertRule; result: AlertEvaluationResult }>> {
  // Skip evaluation if project is in an active maintenance window
  const inMaintenance = await isInMaintenanceWindow(projectId);
  if (inMaintenance) {
    return [];
  }

  const rules = await db.query.alerts.findMany({
    where: (alerts, { and, eq }) =>
      and(eq(alerts.projectId, projectId), eq(alerts.isActive, true)),
  });

  const triggered: Array<{
    rule: AlertRule;
    result: AlertEvaluationResult;
  }> = [];

  for (const rule of rules) {
    const severityResult = AlertSeveritySchema.safeParse(rule.severity);
    const baseSeverity: AlertSeverity = severityResult.success ? severityResult.data : "warning";

    const conditionResult = AlertConditionSchema.safeParse(rule.condition);
    if (!conditionResult.success) {
      logger.warn("[rules-engine] Invalid condition, skipping rule", { ruleId: rule.id, errors: conditionResult.error.flatten() });
      continue;
    }

    const channelsResult = z.array(AlertChannelSchema).safeParse(rule.channels);
    if (!channelsResult.success) {
      logger.warn("[rules-engine] Invalid channels, skipping rule", { ruleId: rule.id, errors: channelsResult.error.flatten() });
      continue;
    }

    const alertRule: AlertRule = {
      id: rule.id,
      name: rule.name,
      projectId: rule.projectId,
      severity: baseSeverity,
      condition: conditionResult.data,
      channels: channelsResult.data,
      isActive: rule.isActive,
      cooldownSeconds: rule.cooldownSeconds,
      createdAt: rule.createdAt,
    };

    // Inject resource values if available
    if (
      alertRule.condition.type === "resource_threshold" &&
      resourceValues
    ) {
      const resource = alertRule.condition.resource ?? "cpu";
      const value = resourceValues[resource] ?? 0;
      const result: AlertEvaluationResult = {
        triggered: compare(
          value,
          alertRule.condition.operator,
          alertRule.condition.threshold
        ),
        currentValue: value,
        threshold: alertRule.condition.threshold,
        message: `Resource ${resource}: ${value}% (threshold: ${alertRule.condition.operator} ${alertRule.condition.threshold}%)`,
      };
      if (result.triggered) {
        // Auto-escalate: if currentValue > 2x threshold, bump to critical
        const effectiveSeverity: AlertSeverity =
          result.currentValue > result.threshold * 2 ? "critical" : baseSeverity;
        triggered.push({ rule: { ...alertRule, severity: effectiveSeverity }, result });
      }
      continue;
    }

    const result = await checkCondition(alertRule);
    if (result.triggered) {
      const effectiveSeverity: AlertSeverity =
        result.currentValue > result.threshold * 2 ? "critical" : baseSeverity;
      triggered.push({ rule: { ...alertRule, severity: effectiveSeverity }, result });
    }
  }

  return triggered;
}
