/**
 * Alert Rules Evaluation Engine
 *
 * Evaluates alert conditions against current data and determines
 * whether alerts should fire based on thresholds and time windows.
 */

import { db } from "../store/db.js";
import { events, issues, traces, uptimeChecks } from "../store/schema.js";
import { eq, and, gte, sql, count } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AlertConditionType =
  | "error_rate"
  | "uptime_down"
  | "resource_threshold"
  | "trace_error"
  | "token_usage";

export type ComparisonOperator = "gt" | "lt" | "eq" | "gte" | "lte";

export interface AlertCondition {
  type: AlertConditionType;
  threshold: number;
  duration?: number; // seconds — how long condition must hold
  operator: ComparisonOperator;
  // uptime_down: consecutive failed checks
  consecutiveFailures?: number;
  // resource_threshold: which resource (cpu, memory, disk)
  resource?: "cpu" | "memory" | "disk";
  // token_usage: model filter
  model?: string;
}

export interface AlertChannel {
  type: "telegram" | "discord" | "email";
  target: string; // chatId, webhookUrl, or email address
}

export interface AlertRule {
  id: string;
  name: string;
  projectId: string;
  condition: AlertCondition;
  channels: AlertChannel[];
  isActive: boolean;
  cooldownSeconds: number;
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
    sql`SELECT uc.monitor_id, uc.status_code
        FROM uptime_checks uc
        JOIN uptime_monitors um ON uc.monitor_id = um.id
        WHERE um.project_id = ${projectId}
        ORDER BY uc.checked_at DESC
        LIMIT ${consecutiveFailures * 10}`
  );

  // Group by monitor and count consecutive failures
  const monitorChecks = new Map<string, number[]>();
  const checkRows = recentChecks as unknown as Array<{
    monitor_id: string;
    status_code: number;
  }>;
  for (const check of checkRows) {
    const checks = monitorChecks.get(check.monitor_id) ?? [];
    checks.push(check.status_code);
    monitorChecks.set(check.monitor_id, checks);
  }

  let worstConsecutive = 0;
  for (const [, codes] of monitorChecks) {
    let consecutive = 0;
    for (const code of codes) {
      if (code < 200 || code >= 400) {
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
  _projectId: string
): Promise<AlertEvaluationResult> {
  // Resource thresholds are evaluated against host stats stored externally
  // For now, return a placeholder — the worker will inject current values
  // This is called with a context injection pattern in the worker
  const resource = condition.resource ?? "cpu";
  return {
    triggered: false,
    currentValue: 0,
    threshold: condition.threshold,
    message: `Resource ${resource} check: requires host stats injection`,
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

  const resultRows = result as unknown as Array<{ total: number }>;
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

// ─── Main Evaluation ──────────────────────────────────────────────────────────

/**
 * Evaluate a single alert rule's condition against current data.
 */
export async function checkCondition(
  rule: AlertRule
): Promise<AlertEvaluationResult> {
  const { condition, projectId } = rule;

  switch (condition.type) {
    case "error_rate":
      return evaluateErrorRate(condition, projectId);
    case "uptime_down":
      return evaluateUptimeDown(condition, projectId);
    case "resource_threshold":
      return evaluateResourceThreshold(condition, projectId);
    case "trace_error":
      return evaluateTraceError(condition, projectId);
    case "token_usage":
      return evaluateTokenUsage(condition, projectId);
    default:
      return {
        triggered: false,
        currentValue: 0,
        threshold: 0,
        message: `Unknown condition type: ${(condition as AlertCondition).type}`,
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
  const rules = await db.query.alerts.findMany({
    where: (alerts, { and, eq }) =>
      and(eq(alerts.projectId, projectId), eq(alerts.isActive, true)),
  });

  const triggered: Array<{
    rule: AlertRule;
    result: AlertEvaluationResult;
  }> = [];

  for (const rule of rules) {
    const alertRule: AlertRule = {
      id: rule.id,
      name: rule.name,
      projectId: rule.projectId,
      condition: rule.condition as AlertCondition,
      channels: rule.channels as AlertChannel[],
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
        triggered.push({ rule: alertRule, result });
      }
      continue;
    }

    const result = await checkCondition(alertRule);
    if (result.triggered) {
      triggered.push({ rule: alertRule, result });
    }
  }

  return triggered;
}
