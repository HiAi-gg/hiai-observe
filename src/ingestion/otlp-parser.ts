/**
 * OTLP payload parser.
 *
 * Converts OpenTelemetry Protocol (OTLP) JSON payloads into internal
 * trace representations suitable for storage.
 */

import type { OTLPResourceSpan, OTLPResource } from "../api/otlp.js";

// ── Internal normalized types ───────────────────────────────────────────

interface ParsedTraceRow {
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
}

// ── Helpers ─────────────────────────────────────────────────────────────

// hexToBase64 removed — trace/span IDs stored as hex strings directly (text columns in DB)

function parseAttributes(
  attrs?: Array<{ key: string; value: Record<string, unknown> }>,
): Record<string, string> {
  if (!attrs) return {};
  const out: Record<string, string> = {};
  for (const a of attrs) {
    const v = a.value;
    out[a.key] =
      (v.stringValue as string) ??
      (v.intValue as string) ??
      String(v.doubleValue ?? v.boolValue ?? "");
  }
  return out;
}

function parseEvents(
  events?: Array<{
    timeUnixNano: string;
    name: string;
    attributes?: Array<{ key: string; value: Record<string, unknown> }>;
  }>,
): ParsedTraceRow["events"] {
  if (!events) return [];
  return events.map((e) => ({
    timeUnixNano: e.timeUnixNano,
    name: e.name,
    attributes: parseAttributes(e.attributes),
  }));
}

function kindNumber(kind: string | number | undefined): string {
  const map: Record<number, string> = {
    0: "INTERNAL",
    1: "SERVER",
    2: "CLIENT",
    3: "PRODUCER",
    4: "CONSUMER",
  };
  if (typeof kind === "number") return map[kind] ?? "INTERNAL";
  return String(kind ?? "INTERNAL");
}

function statusCode(status?: { code?: string | number; message?: string }): string | null {
  if (!status) return null;
  const code = status.code;
  if (code === 2 || code === "STATUS_CODE_ERROR" || code === "Error") return "error";
  if (code === 1 || code === "STATUS_CODE_OK" || code === "Ok") return "ok";
  return "unset";
}

// ── Main parsers ────────────────────────────────────────────────────────

export function parseOTLPTraces(
  resourceSpans: OTLPResourceSpan[],
  projectId: string,
): ParsedTraceRow[] {
  const rows: ParsedTraceRow[] = [];

  for (const rs of resourceSpans) {
    const resourceAttrs = parseAttributes(rs.resource?.attributes);

    for (const scope of rs.scopeSpans ?? []) {
      for (const span of scope.spans ?? []) {
        rows.push({
          projectId,
          traceId: span.traceId,
          spanId: span.spanId,
          parentSpanId: span.parentSpanId ?? null,
          name: span.name,
          kind: kindNumber(span.kind),
          startTimeUnixNano: span.startTimeUnixNano,
          endTimeUnixNano: span.endTimeUnixNano,
          attributes: {
            ...resourceAttrs,
            ...parseAttributes(span.attributes),
          },
          status: statusCode(span.status),
          statusMessage: span.status?.message ?? null,
          events: parseEvents(span.events),
        });
      }
    }
  }

  return rows;
}

export function parseOTLPMetrics(
  resourceMetrics: unknown[],
  projectId: string,
): ParsedTraceRow[] {
  // For MVP: store metrics as traces with kind="METRIC"
  const rows: ParsedTraceRow[] = [];

  for (const rm of resourceMetrics) {
    const rmObj = rm as Record<string, unknown>;
    const resource = rmObj.resource as OTLPResource | undefined;
    const resourceAttrs = parseAttributes(resource?.attributes);
    const scopeMetrics = (rmObj.scopeMetrics as Array<Record<string, unknown>>) ?? [];

    for (const scope of scopeMetrics) {
      const metrics = (scope.metrics as Array<Record<string, unknown>>) ?? [];

      for (const metric of metrics) {
        const name = String(metric.name ?? "unknown");
        const description = String(metric.description ?? "");
        const unit = String(metric.unit ?? "");

        // Extract data points
        const sum = metric.sum as Record<string, unknown> | undefined;
        const gauge = metric.gauge as Record<string, unknown> | undefined;
        const dataPoints = (sum?.dataPoints ?? gauge?.dataPoints ?? []) as Array<Record<string, unknown>>;

        for (const dp of dataPoints) {
          const startTime = String(dp.startTimeUnixNano ?? "0");
          const endTime = String(dp.timeUnixNano ?? "0");

          rows.push({
            projectId,
            traceId: `metric-${name}-${endTime}`,
            spanId: `metric-${name}-${endTime}`,
            parentSpanId: null,
            name,
            kind: "METRIC",
            startTimeUnixNano: startTime,
            endTimeUnixNano: endTime,
            attributes: {
              ...resourceAttrs,
              metric_name: name,
              metric_description: description,
              metric_unit: unit,
              metric_value: String(dp.asInt ?? dp.asDouble ?? "0"),
            },
            status: null,
            statusMessage: null,
            events: [],
          });
        }
      }
    }
  }

  return rows;
}
