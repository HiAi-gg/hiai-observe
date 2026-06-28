/**
 * Latency analysis for Mastra workflow traces.
 *
 * Calculates p50/p95/p99 percentiles per workflow step,
 * end-to-end workflow latency, and identifies slow steps.
 */

import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { castDbRows } from "../lib/db-types.js";
import { db } from "../store/db.js";
import { traces } from "../store/schema.js";

// ── Types ───────────────────────────────────────────────────────────────

export interface LatencyStats {
  workflowName: string;
  totalRuns: number;
  e2eLatency: Percentiles;
  steps: StepLatency[];
  slowSteps: SlowStep[];
}

export interface Percentiles {
  p50: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
  avg: number;
}

export interface StepLatency {
  stepName: string;
  percentiles: Percentiles;
  runCount: number;
}

export interface SlowStep {
  stepName: string;
  medianMs: number;
  p99Ms: number;
  ratio: number; // p99 / median — >2 means slow
}

export interface LatencyParams {
  projectId: string;
  workflowName?: string;
  from?: Date;
  to?: Date;
}

// ── Percentile calculation ──────────────────────────────────────────────

function calcPercentiles(values: number[]): Percentiles {
  if (values.length === 0) {
    return { p50: 0, p95: 0, p99: 0, min: 0, max: 0, avg: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const len = sorted.length;

  const percentile = (p: number): number => {
    const idx = Math.ceil((p / 100) * len) - 1;
    return sorted[Math.max(0, idx)] ?? 0;
  };

  const sum = sorted.reduce((a, b) => a + b, 0);

  return {
    p50: percentile(50),
    p95: percentile(95),
    p99: percentile(99),
    min: sorted[0] ?? 0,
    max: sorted[len - 1] ?? 0,
    avg: Math.round(sum / len),
  };
}

// ── Latency stats ───────────────────────────────────────────────────────

export async function getLatencyStats(params: LatencyParams): Promise<LatencyStats[]> {
  const { projectId, workflowName, from, to } = params;

  // Get all workflow spans grouped by workflow name and trace
  const conditions = [
    eq(traces.projectId, projectId),
    sql`attributes->>'mastra.workflow' IS NOT NULL`,
  ];
  if (workflowName) {
    conditions.push(sql`attributes->>'mastra.workflow' = ${workflowName}`);
  }
  if (from) conditions.push(gte(traces.createdAt, from));
  if (to) conditions.push(lte(traces.createdAt, to));

  // Fetch all workflow-level spans
  const workflowSpans = await db.execute(sql`
    SELECT
      trace_id,
      attributes->>'mastra.workflow' AS workflow_name,
      name,
      duration_ms,
      status
    FROM traces
    WHERE ${sql.join(conditions, sql` AND `)}
      AND (parent_span_id IS NULL OR parent_span_id = '')
    ORDER BY attributes->>'mastra.workflow', start_time
  `);

  // Group by workflow name
  const byWorkflow = new Map<string, Array<Record<string, unknown>>>();
  for (const row of castDbRows<Record<string, unknown>>(workflowSpans)) {
    const name = String(row.workflow_name ?? "unknown");
    const list = byWorkflow.get(name) ?? [];
    list.push(row);
    byWorkflow.set(name, list);
  }

  // Collect all trace IDs across all workflows and fetch step spans in ONE query
  // (avoids N+1: M workflows × 1 step-spans query each)
  const allTraceIds = new Set<string>();
  for (const rows of byWorkflow.values()) {
    for (const r of rows) {
      allTraceIds.add(String(r.trace_id));
    }
  }

  const stepsByTraceId = new Map<string, Array<{ stepName: string; durationMs: number }>>();
  if (allTraceIds.size > 0) {
    const stepSpans = await db
      .select({
        trace_id: traces.traceId,
        step_name: traces.name,
        duration_ms: traces.durationMs,
      })
      .from(traces)
      .where(
        and(
          inArray(traces.traceId, Array.from(allTraceIds)),
          sql`${traces.parentSpanId} IS NOT NULL`,
          sql`${traces.parentSpanId} != ''`,
        ),
      )
      .orderBy(traces.name, traces.startTime);

    for (const row of castDbRows<Record<string, unknown>>(stepSpans)) {
      const traceId = String(row.trace_id);
      const entry = {
        stepName: String(row.step_name ?? "unknown"),
        durationMs: Number(row.duration_ms ?? 0),
      };
      const list = stepsByTraceId.get(traceId) ?? [];
      list.push(entry);
      stepsByTraceId.set(traceId, list);
    }
  }

  const results: LatencyStats[] = [];

  for (const [wfName, rows] of byWorkflow) {
    const e2eDurations = rows.map((r) => Number(r.duration_ms ?? 0));

    // Group step durations by step name (looked up from the pre-fetched Map)
    const stepDurations = new Map<string, number[]>();
    for (const r of rows) {
      const traceId = String(r.trace_id);
      const spans = stepsByTraceId.get(traceId);
      if (!spans) continue;
      for (const span of spans) {
        const list = stepDurations.get(span.stepName) ?? [];
        list.push(span.durationMs);
        stepDurations.set(span.stepName, list);
      }
    }

    // Build step latencies
    const steps: StepLatency[] = [];
    for (const [stepName, durations] of stepDurations) {
      steps.push({
        stepName,
        percentiles: calcPercentiles(durations),
        runCount: durations.length,
      });
    }

    // Identify slow steps (p99 > 2x median)
    const slowSteps: SlowStep[] = [];
    for (const step of steps) {
      if (step.percentiles.p50 > 0) {
        const ratio = step.percentiles.p99 / step.percentiles.p50;
        if (ratio > 2) {
          slowSteps.push({
            stepName: step.stepName,
            medianMs: step.percentiles.p50,
            p99Ms: step.percentiles.p99,
            ratio: Math.round(ratio * 100) / 100,
          });
        }
      }
    }

    results.push({
      workflowName: wfName,
      totalRuns: rows.length,
      e2eLatency: calcPercentiles(e2eDurations),
      steps,
      slowSteps: slowSteps.sort((a, b) => b.ratio - a.ratio),
    });
  }

  return results.sort((a, b) => b.totalRuns - a.totalRuns);
}
