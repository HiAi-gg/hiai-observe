/**
 * Traces data access layer.
 */

import { db } from "./db.js";
import { traces } from "./schema.js";
import { eq, and, desc, asc, sql, count, gte, lte } from "drizzle-orm";

// ── Types ───────────────────────────────────────────────────────────────

export interface TraceFilter {
  projectId?: string;
  traceId?: string;
  workflowName?: string;
  agentName?: string;
  status?: string;
  from?: Date;
  to?: Date;
  limit: number;
  offset: number;
}

export interface TraceListResult {
  data: Array<{
    id: string;
    traceId: string;
    spanId: string;
    name: string;
    kind: string;
    status: string | null;
    durationMs: number | null;
    attributes: Record<string, unknown> | null;
    createdAt: Date;
  }>;
  total: number;
  limit: number;
  offset: number;
}

// ── Insert ──────────────────────────────────────────────────────────────

export async function insertTraces(
  rows: Array<{
    projectId: string;
    traceId: string;
    spanId: string;
    parentSpanId: string | null;
    name: string;
    kind: string;
    startTimeUnixNano: string;
    endTimeUnixNano: string;
    attributes: Record<string, string>;
    status: string | null;
    statusMessage: string | null;
    events: Array<{ timeUnixNano: string; name: string; attributes: Record<string, string> }>;
  }>,
): Promise<void> {
  if (rows.length === 0) return;

  const chunkSize = 500;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    await db.insert(traces).values(
      chunk.map((r) => {
        const startMs = nsToMs(r.startTimeUnixNano);
        const endMs = nsToMs(r.endTimeUnixNano);
        return {
          projectId: r.projectId,
          traceId: r.traceId,
          spanId: r.spanId,
          parentSpanId: r.parentSpanId,
          name: r.name,
          kind: r.kind,
          startTime: new Date(startMs),
          endTime: new Date(endMs),
          durationMs: endMs - startMs,
          status: r.status ?? "unset",
          attributes: {
            ...r.attributes,
            statusMessage: r.statusMessage ?? undefined,
            events: r.events.length > 0 ? r.events : undefined,
          },
        };
      }),
    );
  }
}

// ── Query ───────────────────────────────────────────────────────────────

export async function getTraces(filter: TraceFilter): Promise<TraceListResult> {
  const conditions = [];

  if (filter.projectId) {
    conditions.push(eq(traces.projectId, filter.projectId));
  }
  if (filter.traceId) {
    conditions.push(eq(traces.traceId, filter.traceId));
  }
  if (filter.workflowName) {
    conditions.push(
      sql`attributes->>'mastra.workflow' = ${filter.workflowName}`,
    );
  }
  if (filter.agentName) {
    conditions.push(
      sql`attributes->>'mastra.agent' = ${filter.agentName}`,
    );
  }
  if (filter.status) {
    conditions.push(eq(traces.status, filter.status));
  }
  if (filter.from) {
    conditions.push(gte(traces.createdAt, filter.from));
  }
  if (filter.to) {
    conditions.push(lte(traces.createdAt, filter.to));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [countResult] = await db
    .select({ total: count() })
    .from(traces)
    .where(where);

  const rows = await db
    .select()
    .from(traces)
    .where(where)
    .orderBy(desc(traces.createdAt))
    .limit(filter.limit)
    .offset(filter.offset);

  return {
    data: rows.map((r) => ({
      id: r.id,
      traceId: r.traceId,
      spanId: r.spanId,
      name: r.name,
      kind: r.kind ?? "INTERNAL",
      status: r.status,
      durationMs: r.durationMs,
      attributes: r.attributes,
      createdAt: r.createdAt,
    })),
    total: countResult?.total ?? 0,
    limit: filter.limit,
    offset: filter.offset,
  };
}

// ── Trace detail ────────────────────────────────────────────────────────

export async function getTraceDetail(traceId: string) {
  const rows = await db
    .select()
    .from(traces)
    .where(eq(traces.traceId, traceId))
    .orderBy(asc(traces.startTime));

  if (rows.length === 0) return null;

  return { traceId, spans: rows };
}

// ── Workflow runs ───────────────────────────────────────────────────────

export async function getWorkflowRuns(filter: {
  projectId?: string;
  workflowName?: string;
  status?: string;
  limit: number;
  offset: number;
}) {
  const conditions = [
    sql`attributes->>'mastra.workflow' IS NOT NULL`,
  ];

  if (filter.projectId) {
    conditions.push(eq(traces.projectId, filter.projectId));
  }
  if (filter.workflowName) {
    conditions.push(
      sql`attributes->>'mastra.workflow' = ${filter.workflowName}`,
    );
  }
  if (filter.status) {
    conditions.push(eq(traces.status, filter.status));
  }

  const where = and(...conditions);

  const [countResult] = await db
    .select({ total: count() })
    .from(traces)
    .where(where);

  const rows = await db
    .select()
    .from(traces)
    .where(where)
    .orderBy(desc(traces.createdAt))
    .limit(filter.limit)
    .offset(filter.offset);

  return {
    data: rows,
    total: countResult?.total ?? 0,
    limit: filter.limit,
    offset: filter.offset,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────

function nsToMs(ns: string): number {
  try {
    return Number(BigInt(ns) / 1_000_000n);
  } catch {
    return 0;
  }
}
