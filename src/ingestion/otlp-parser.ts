/**
 * OTLP payload parser.
 *
 * Converts OpenTelemetry Protocol (OTLP) JSON payloads into internal
 * trace representations suitable for storage.
 */

import type { OTLPResource, OTLPResourceSpan } from "../api/otlp.js";

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

export function parseOTLPMetrics(resourceMetrics: unknown[], projectId: string): ParsedTraceRow[] {
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
        const dataPoints = (sum?.dataPoints ?? gauge?.dataPoints ?? []) as Array<
          Record<string, unknown>
        >;

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

// ── OTLP Logs ──────────────────────────────────────────────────────────────
//
// The existing `logs` table is shaped for Docker container logs
// (containerId, containerName, stream). OTLP application logs don't carry
// these fields — we map them as follows:
//
//   containerId   → service.instance.id (resource attr) or "otlp"
//   containerName → service.name (resource attr) or "otlp"
//   stream        → "otel"  (marks the row as OTLP-sourced, distinct from
//                    "stdout"/"stderr" produced by the Docker log worker)
//   message       → body, or JSON-stringified body for non-string values
//   level         → severityText, or mapped from severityNumber
//   timestamp     → timeUnixNano (ms), observedTimeUnixNano as fallback
//   raw           → full { body, severityText, severityNumber, attributes,
//                    resource, scope, traceId, spanId, observedTimeUnixNano }
//
// This preserves the existing table contract (so searchLogs / getLogContainers
// continue to work) while keeping the original OTLP envelope accessible
// through `raw` for future triage UIs.

const SEVERITY_NUMBER_TO_TEXT: Record<number, string> = {
  1: "TRACE",
  2: "TRACE",
  3: "TRACE",
  4: "TRACE",
  5: "DEBUG",
  6: "DEBUG",
  7: "DEBUG",
  8: "DEBUG",
  9: "INFO",
  10: "INFO",
  11: "INFO",
  12: "INFO",
  13: "WARN",
  14: "WARN",
  15: "WARN",
  16: "WARN",
  17: "ERROR",
  18: "ERROR",
  19: "ERROR",
  20: "ERROR",
  21: "FATAL",
  22: "FATAL",
  23: "FATAL",
  24: "FATAL",
};

export interface ParsedOtlpLogRow {
  projectId: string;
  containerId: string;
  containerName: string;
  stream: "otel";
  message: string;
  level: string | undefined;
  timestamp: Date;
  raw: unknown;
}

function anyValueToString(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "object") {
    const bag = v as Record<string, unknown>;
    if (typeof bag.stringValue === "string") return bag.stringValue;
    if (typeof bag.boolValue === "boolean") return String(bag.boolValue);
    if (bag.intValue !== null && bag.intValue !== undefined) return String(bag.intValue);
    if (typeof bag.doubleValue === "number") return String(bag.doubleValue);
    // Nested arrays / kvlists / bytes — stringify to preserve info.
    return JSON.stringify(bag);
  }
  return String(v);
}

function longNanosToDate(value: unknown): Date {
  if (value === null || value === undefined || value === "0" || value === 0) {
    return new Date();
  }
  // Accept decimal string ("1700000000000000000"), bigint, number, or Long-like.
  let ns: number | bigint;
  if (typeof value === "bigint") ns = value;
  else if (typeof value === "number") ns = value;
  else if (typeof value === "object" && value !== null && "toString" in value) {
    ns = BigInt(String((value as { toString(): string }).toString()));
  } else {
    ns = BigInt(String(value));
  }
  const nsBig = typeof ns === "bigint" ? ns : BigInt(ns);
  // Convert nanoseconds → milliseconds (truncating sub-ms precision; log timestamps
  // don't need ns fidelity and Postgres `timestamp` only stores ms).
  const ms = Number(nsBig / 1_000_000n);
  return new Date(ms);
}

function severityToText(severityNumber: unknown, severityText: unknown): string | undefined {
  if (typeof severityText === "string" && severityText.length > 0) {
    return severityText;
  }
  const num =
    typeof severityNumber === "number"
      ? severityNumber
      : severityNumber !== null && severityNumber !== undefined
        ? Number(severityNumber)
        : NaN;
  if (!Number.isFinite(num) || num <= 0) return undefined;
  return SEVERITY_NUMBER_TO_TEXT[num];
}

export function parseOTLPLogs(resourceLogs: unknown[], projectId: string): ParsedOtlpLogRow[] {
  const rows: ParsedOtlpLogRow[] = [];

  for (const rl of resourceLogs) {
    const rlObj = rl as Record<string, unknown>;
    const resource = rlObj.resource as OTLPResource | undefined;
    const resourceAttrs = parseAttributes(resource?.attributes);
    const containerId =
      resourceAttrs["service.instance.id"] ?? resourceAttrs["service.namespace"] ?? "otlp";
    const containerName = resourceAttrs["service.name"] ?? "otlp";

    const scopeLogs = (rlObj.scopeLogs as Array<Record<string, unknown>>) ?? [];
    for (const scope of scopeLogs) {
      const scopeObj = scope ?? {};
      const scopeRaw = scopeObj.scope as Record<string, unknown> | undefined;
      const scopeName = typeof scopeRaw?.name === "string" ? scopeRaw.name : undefined;

      const records = (scopeObj.logRecords as Array<Record<string, unknown>>) ?? [];
      for (const rec of records) {
        const timeUnixNano = rec.timeUnixNano ?? rec.observedTimeUnixNano;
        const ts = longNanosToDate(timeUnixNano);
        const body = anyValueToString(rec.body);
        const severityNumber = rec.severityNumber;
        const severityText = rec.severityText;
        const level = severityToText(severityNumber, severityText);
        const attrs = parseAttributes(
          rec.attributes as Array<{ key: string; value: Record<string, unknown> }>,
        );

        rows.push({
          projectId,
          containerId: containerId.slice(0, 128),
          containerName: containerName.slice(0, 256),
          stream: "otel",
          message: body,
          level,
          timestamp: ts,
          raw: {
            body: rec.body,
            severityText: typeof severityText === "string" ? severityText : null,
            severityNumber:
              typeof severityNumber === "number"
                ? severityNumber
                : severityNumber !== null && severityNumber !== undefined
                  ? Number(severityNumber)
                  : null,
            attributes: attrs,
            resource: resourceAttrs,
            scope: scopeName ? { name: scopeName } : null,
            traceId: hexBytesOrUndefined(rec.traceId),
            spanId: hexBytesOrUndefined(rec.spanId),
            observedTimeUnixNano: longToStringSafe(rec.observedTimeUnixNano),
          },
        });
      }
    }
  }

  return rows;
}

function longToStringSafe(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "number") return String(v);
  if (typeof v === "object" && v !== null && "toString" in v) {
    return String((v as { toString(): string }).toString());
  }
  return String(v);
}

function hexBytesOrUndefined(v: unknown): string | undefined {
  if (!v) return undefined;
  if (v instanceof Uint8Array || v instanceof Buffer) {
    if (v.length === 0) return undefined;
    let out = "";
    const view = v instanceof Uint8Array ? v : new Uint8Array(v);
    for (let i = 0; i < view.length; i++) {
      const b = view[i];
      if (b === undefined) continue;
      out += b.toString(16).padStart(2, "0");
    }
    return out || undefined;
  }
  if (typeof v === "string") return v.length > 0 ? v : undefined;
  return undefined;
}
