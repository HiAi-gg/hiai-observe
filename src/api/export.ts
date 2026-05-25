import { Elysia, t } from "elysia";
import { db } from "../store/db.js";
import { issues, traces, logs } from "../store/schema.js";
import { desc, gte, lte, and, eq } from "drizzle-orm";

const MAX_RANGE_DAYS = 90;
const MAX_EXPORT_ROWS = 10_000;
const MS_PER_DAY = 86_400_000;

function clampDateRange(from?: Date, to?: Date, defaultDays = 7): { from: Date; to: Date } {
  const now = new Date();
  const effectiveTo = to ?? now;
  const effectiveFrom = from ?? new Date(effectiveTo.getTime() - defaultDays * MS_PER_DAY);

  // Cap range to MAX_RANGE_DAYS
  const rangeMs = effectiveTo.getTime() - effectiveFrom.getTime();
  if (rangeMs > MAX_RANGE_DAYS * MS_PER_DAY) {
    return { from: new Date(effectiveTo.getTime() - MAX_RANGE_DAYS * MS_PER_DAY), to: effectiveTo };
  }
  if (rangeMs < 0) {
    // from is after to — swap
    return { from: effectiveTo, to: effectiveFrom };
  }
  return { from: effectiveFrom, to: effectiveTo };
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]!);
  const lines = [headers.join(",")];
  for (const row of rows) {
    const values = headers.map((h) => {
      const v = row[h];
      if (v === null || v === undefined) return "";
      const s = String(v);
      return s.includes(",") || s.includes('"') || s.includes("\n")
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    });
    lines.push(values.join(","));
  }
  return lines.join("\n");
}

export const exportRoutes = new Elysia({ prefix: "/api/export" })

  .get("/issues", async ({ query }) => {
    const { from, to } = clampDateRange(
      query.from ? new Date(query.from) : undefined,
      query.to ? new Date(query.to) : undefined,
      30,
    );

    const rows = await db.select().from(issues)
      .where(and(gte(issues.lastSeen, from), lte(issues.lastSeen, to)))
      .orderBy(desc(issues.lastSeen))
      .limit(MAX_EXPORT_ROWS);

    const data = rows.map((r) => ({
      id: r.id,
      title: r.title,
      type: r.type,
      status: r.status,
      count: r.count,
      firstSeen: r.firstSeen.toISOString(),
      lastSeen: r.lastSeen.toISOString(),
    }));

    if (query.format === "csv") {
      return new Response(toCsv(data), {
        headers: { "Content-Type": "text/csv", "Content-Disposition": "attachment; filename=issues.csv" },
      });
    }
    return { data, count: data.length };
  }, {
    query: t.Object({
      format: t.Optional(t.Union([t.Literal("csv"), t.Literal("json")])),
      from: t.Optional(t.String({ format: "date-time" })),
      to: t.Optional(t.String({ format: "date-time" })),
    }),
  })

  .get("/traces", async ({ query }) => {
    const { from, to } = clampDateRange(
      query.from ? new Date(query.from) : undefined,
      query.to ? new Date(query.to) : undefined,
      7,
    );

    const rows = await db.select().from(traces)
      .where(and(gte(traces.startTime, from), lte(traces.startTime, to)))
      .orderBy(desc(traces.startTime))
      .limit(MAX_EXPORT_ROWS);

    const data = rows.map((r) => ({
      id: r.id,
      traceId: r.traceId,
      name: r.name,
      kind: r.kind,
      status: r.status,
      durationMs: r.durationMs,
      model: r.model,
      startTime: r.startTime.toISOString(),
    }));

    if (query.format === "csv") {
      return new Response(toCsv(data), {
        headers: { "Content-Type": "text/csv", "Content-Disposition": "attachment; filename=traces.csv" },
      });
    }
    return { data, count: data.length };
  }, {
    query: t.Object({
      format: t.Optional(t.Union([t.Literal("csv"), t.Literal("json")])),
      from: t.Optional(t.String({ format: "date-time" })),
      to: t.Optional(t.String({ format: "date-time" })),
    }),
  })

  .get("/logs", async ({ query }) => {
    const { from, to } = clampDateRange(
      query.from ? new Date(query.from) : undefined,
      query.to ? new Date(query.to) : undefined,
      7,
    );

    const conditions = [gte(logs.timestamp, from), lte(logs.timestamp, to)];
    if (query.level) conditions.push(eq(logs.level, query.level));
    if (query.container) conditions.push(eq(logs.containerId, query.container));
    const where = and(...conditions);

    const rows = await db.select().from(logs)
      .where(where)
      .orderBy(desc(logs.timestamp))
      .limit(MAX_EXPORT_ROWS);

    const data = rows.map((r) => ({
      id: r.id,
      containerId: r.containerId,
      containerName: r.containerName,
      stream: r.stream,
      level: r.level,
      message: r.message,
      timestamp: r.timestamp.toISOString(),
    }));

    if (query.format === "csv") {
      return new Response(toCsv(data), {
        headers: { "Content-Type": "text/csv", "Content-Disposition": "attachment; filename=logs.csv" },
      });
    }
    return { data, count: data.length };
  }, {
    query: t.Object({
      format: t.Optional(t.Union([t.Literal("csv"), t.Literal("json")])),
      from: t.Optional(t.String({ format: "date-time" })),
      to: t.Optional(t.String({ format: "date-time" })),
      level: t.Optional(t.String()),
      container: t.Optional(t.String()),
    }),
  });
