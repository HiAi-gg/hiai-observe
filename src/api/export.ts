import { Elysia, t } from "elysia";
import { db } from "../store/db.js";
import { issues, traces, logs } from "../store/schema.js";
import { desc, gte, lte, and, eq } from "drizzle-orm";

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
    const to = query.to ? new Date(query.to) : new Date();

    const rows = await db.select().from(issues)
      .where(lte(issues.lastSeen, to))
      .orderBy(desc(issues.lastSeen))
      .limit(10000);

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
    const from = query.from ? new Date(query.from) : new Date(Date.now() - 7 * 86400000);

    const rows = await db.select().from(traces)
      .where(gte(traces.startTime, from))
      .orderBy(desc(traces.startTime))
      .limit(10000);

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
    const conditions = [];
    if (query.from) conditions.push(gte(logs.timestamp, new Date(query.from)));
    if (query.to) conditions.push(lte(logs.timestamp, new Date(query.to)));
    if (query.level) conditions.push(eq(logs.level, query.level));
    if (query.container) conditions.push(eq(logs.containerId, query.container));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db.select().from(logs)
      .where(where)
      .orderBy(desc(logs.timestamp))
      .limit(10000);

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
