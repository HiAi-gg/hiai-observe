/**
 * OTLP protobuf decoder.
 *
 * Decodes OTLP/HTTP binary payloads (Content-Type: application/x-protobuf)
 * into the same internal JSON-like shape that the JSON branch produces, so
 * `parseOTLPTraces` / `parseOTLPMetrics` can consume both encodings without
 * branching.
 *
 * Per the OTLP spec, protobuf wire types are the canonical encoding for
 * traces and metrics. We use `protobufjs` with a static JSON schema bundle
 * (no `.proto` parser at runtime) to keep cold-start and memory low —
 * hiai-observe targets small VPS (<512MB RAM).
 */
import protobuf from "protobufjs";
import type { OTLPResource, OTLPResourceSpan } from "../api/otlp.js";
import { OTLP_PROTO_SCHEMA_JSON } from "./otlp-proto-schema.js";

// ── Load schema once at module init ────────────────────────────────────────
//
// protobufjs' Root.fromJSON builds optimized encoders/decoders from a JSON
// schema descriptor. The root is cached for the lifetime of the process.

const root = protobuf.Root.fromJSON(JSON.parse(OTLP_PROTO_SCHEMA_JSON));

const TracesData = root.lookupType("opentelemetry.proto.trace.v1.TracesData");
const MetricsData = root.lookupType("opentelemetry.proto.metrics.v1.MetricsData");
const LogsData = root.lookupType("opentelemetry.proto.logs.v1.LogsData");

// ── Wire-format conversion helpers ─────────────────────────────────────────
//
// OTLP/HTTP binary uses raw protobuf bytes for IDs and timestamps. We have
// to normalise them into the hex-string / decimal-string representations the
// JSON branch emits so downstream code stays encoding-agnostic.

function bytesToHex(bytes: Uint8Array | Buffer | undefined | null): string {
  if (!bytes || bytes.length === 0) return "";
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let out = "";
  for (let i = 0; i < view.length; i++) {
    const b = view[i];
    if (b === undefined) continue;
    out += b.toString(16).padStart(2, "0");
  }
  return out;
}

function longToString(v: unknown): string {
  if (v === null || v === undefined) return "0";
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "number") return String(v);
  // protobufjs returns Long for uint64/int64 — it has toString() by default,
  // but some configurations may yield an object. Fall back defensively.
  if (typeof v === "object" && v !== null && "toString" in v) {
    return String((v as { toString(): string }).toString());
  }
  return String(v);
}

function enumToName(enumType: protobuf.Enum, value: unknown): string {
  if (value === null || value === undefined) return "SPAN_KIND_UNSPECIFIED";
  const num = typeof value === "number" ? value : Number(value);
  // protobufjs stores enum values keyed by NAME in `values`; reverse-lookup.
  const names = enumType.values as Record<string, number>;
  for (const [name, n] of Object.entries(names)) {
    if (n === num) return name;
  }
  return String(value);
}

// Map protobuf Kind enum name → human-friendly kind string used by
// `parseAttributes` / `parseEvents` and stored in DB.
const SPAN_KIND_MAP: Record<string, string> = {
  SPAN_KIND_UNSPECIFIED: "INTERNAL",
  SPAN_KIND_INTERNAL: "INTERNAL",
  SPAN_KIND_SERVER: "SERVER",
  SPAN_KIND_CLIENT: "CLIENT",
  SPAN_KIND_PRODUCER: "PRODUCER",
  SPAN_KIND_CONSUMER: "CONSUMER",
};

// ── AnyValue → JSON-style value bag ────────────────────────────────────────

interface JsonKeyValue {
  key: string;
  value: Record<string, unknown>;
}

function anyValueToJson(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object") return {};
  const av = v as Record<string, unknown>;
  if (typeof av.stringValue === "string") return { stringValue: av.stringValue };
  if (typeof av.boolValue === "boolean") return { boolValue: av.boolValue };
  // int64 arrives as Long — preserve as decimal string (matches JSON branch)
  if (av.intValue !== null && av.intValue !== undefined) {
    return { intValue: longToString(av.intValue) };
  }
  if (typeof av.doubleValue === "number") return { doubleValue: av.doubleValue };
  // Nested arrays / kvlists collapse to string for storage parity with JSON.
  if (av.arrayValue !== null && av.arrayValue !== undefined) {
    return { stringValue: JSON.stringify(av.arrayValue) };
  }
  if (av.kvlistValue !== null && av.kvlistValue !== undefined) {
    return { stringValue: JSON.stringify(av.kvlistValue) };
  }
  if (av.bytesValue !== null && av.bytesValue !== undefined) {
    return { stringValue: bytesToHex(av.bytesValue as Uint8Array) };
  }
  return {};
}

function keyValueListToJson(kvs: unknown): JsonKeyValue[] {
  if (!Array.isArray(kvs)) return [];
  const out: JsonKeyValue[] = [];
  for (const kv of kvs) {
    if (!kv || typeof kv !== "object") continue;
    const k = (kv as { key?: unknown }).key;
    const val = (kv as { value?: unknown }).value;
    if (typeof k !== "string") continue;
    out.push({ key: k, value: anyValueToJson(val) });
  }
  return out;
}

function resourceToJson(resource: unknown): OTLPResource | undefined {
  if (!resource || typeof resource !== "object") return undefined;
  const r = resource as { attributes?: unknown };
  return { attributes: keyValueListToJson(r.attributes) };
}

// ── Span / Event decoders ──────────────────────────────────────────────────

function decodeSpan(span: unknown, spanKindEnum: protobuf.Enum) {
  const s = (span ?? {}) as Record<string, unknown>;
  return {
    traceId: bytesToHex(s.traceId as Uint8Array),
    spanId: bytesToHex(s.spanId as Uint8Array),
    parentSpanId: bytesToHex(s.parentSpanId as Uint8Array) || undefined,
    name: typeof s.name === "string" ? s.name : "",
    kind: SPAN_KIND_MAP[enumToName(spanKindEnum, s.kind)] ?? "INTERNAL",
    startTimeUnixNano: longToString(s.startTimeUnixNano),
    endTimeUnixNano: longToString(s.endTimeUnixNano),
    attributes: keyValueListToJson(s.attributes),
    status:
      s.status !== null && s.status !== undefined && typeof s.status === "object"
        ? {
            code: enumToName(
              root.lookupEnum("opentelemetry.proto.trace.v1.StatusCode"),
              (s.status as Record<string, unknown>).code,
            ),
            message:
              typeof (s.status as Record<string, unknown>).message === "string"
                ? ((s.status as Record<string, unknown>).message as string)
                : undefined,
          }
        : undefined,
    events: Array.isArray(s.events)
      ? (s.events as unknown[]).map((ev) => {
          const e = (ev ?? {}) as Record<string, unknown>;
          return {
            timeUnixNano: longToString(e.timeUnixNano),
            name: typeof e.name === "string" ? e.name : "",
            attributes: keyValueListToJson(e.attributes),
          };
        })
      : undefined,
  };
}

// ── Public decoders ────────────────────────────────────────────────────────

/**
 * Decode a `ExportTraceServiceRequest` body into the same internal shape as
 * the JSON branch produces (so `parseOTLPTraces` stays encoding-agnostic).
 *
 * The HTTP/JSON-protobuf wire format wraps the actual TracesData with an
 * `ExportTraceServiceRequest` envelope. Per spec the envelope is currently
 * empty (no extra fields), so the body is decoded directly as TracesData.
 */
export function decodeTraceRequestProto(body: Uint8Array): OTLPResourceSpan[] {
  const decoded = TracesData.decode(body) as { resourceSpans?: unknown };
  const resourceSpans = decoded.resourceSpans;
  if (!Array.isArray(resourceSpans)) return [];

  const spanKindEnum = root.lookupEnum("opentelemetry.proto.trace.v1.SpanKind");

  return resourceSpans.map((rs) => {
    const r = (rs ?? {}) as Record<string, unknown>;
    const resource = resourceToJson(r.resource);
    const scopeSpans = Array.isArray(r.scopeSpans) ? r.scopeSpans : [];
    return {
      resource,
      scopeSpans: (scopeSpans as unknown[]).map((ss) => {
        const scopeObj = (ss ?? {}) as Record<string, unknown>;
        const scopeRaw = scopeObj.scope as Record<string, unknown> | undefined;
        const scope =
          scopeRaw && typeof scopeRaw.name === "string"
            ? {
                name: scopeRaw.name as string,
                version:
                  typeof scopeRaw.version === "string" ? (scopeRaw.version as string) : undefined,
              }
            : undefined;
        const spans = Array.isArray(scopeObj.spans) ? scopeObj.spans : [];
        return {
          scope,
          spans: (spans as unknown[]).map((sp) => decodeSpan(sp, spanKindEnum)),
        };
      }),
    };
  });
}

/**
 * Decode an `ExportMetricsServiceRequest` body into the JSON-shaped
 * `resourceMetrics` structure used by `parseOTLPMetrics`.
 *
 * Returns an array of raw ResourceMetrics objects so the metrics parser
 * (which uses defensive casts) can consume them directly.
 */
export function decodeMetricsRequestProto(body: Uint8Array): unknown[] {
  const decoded = MetricsData.decode(body) as { resourceMetrics?: unknown };
  const resourceMetrics = decoded.resourceMetrics;
  if (!Array.isArray(resourceMetrics)) return [];

  return resourceMetrics.map((rm) => {
    const r = (rm ?? {}) as Record<string, unknown>;
    const resource = resourceToJson(r.resource);
    const scopeMetrics = Array.isArray(r.scopeMetrics) ? r.scopeMetrics : [];
    return {
      resource,
      scopeMetrics: (scopeMetrics as unknown[]).map((sm) => {
        const scopeObj = (sm ?? {}) as Record<string, unknown>;
        const scopeRaw = scopeObj.scope as Record<string, unknown> | undefined;
        const scope =
          scopeRaw && typeof scopeRaw.name === "string"
            ? {
                name: scopeRaw.name as string,
                version:
                  typeof scopeRaw.version === "string" ? (scopeRaw.version as string) : undefined,
              }
            : undefined;
        const metrics = Array.isArray(scopeObj.metrics) ? scopeObj.metrics : [];
        return {
          scope,
          metrics: (metrics as unknown[]).map((m) => {
            const metric = (m ?? {}) as Record<string, unknown>;
            const result: Record<string, unknown> = {
              name: typeof metric.name === "string" ? metric.name : "unknown",
              description: typeof metric.description === "string" ? metric.description : "",
              unit: typeof metric.unit === "string" ? metric.unit : "",
            };
            const sum = metric.sum as Record<string, unknown> | undefined;
            const gauge = metric.gauge as Record<string, unknown> | undefined;
            if (sum) result.sum = normalizeSumOrGauge(sum);
            if (gauge) result.gauge = normalizeSumOrGauge(gauge);
            return result;
          }),
        };
      }),
    };
  });
}

function normalizeSumOrGauge(container: Record<string, unknown>): Record<string, unknown> {
  const dps = Array.isArray(container.dataPoints) ? container.dataPoints : [];
  return {
    dataPoints: (dps as unknown[]).map((dp) => {
      const d = (dp ?? {}) as Record<string, unknown>;
      const out: Record<string, unknown> = {
        startTimeUnixNano: longToString(d.startTimeUnixNano),
        timeUnixNano: longToString(d.timeUnixNano),
      };
      // `value` is a oneof — copy whichever is set.
      if (d.asInt !== null && d.asInt !== undefined) {
        out.asInt = longToString(d.asInt);
      }
      if (typeof d.asDouble === "number") {
        out.asDouble = d.asDouble;
      }
      return out;
    }),
  };
}

/**
 * Decode an `ExportLogsServiceRequest` body into the same JSON-shaped
 * `resourceLogs` structure used by the JSON branch (so `parseOTLPLogs`
 * stays encoding-agnostic).
 *
 * Returns an array of raw ResourceLogs objects. LogRecord bodies and
 * attributes are normalised to the same KeyValue shape used by traces /
 * metrics — `anyValueToJson` and `keyValueListToJson` produce output that
 * `parseAttributes` can consume directly.
 */
export function decodeLogsRequestProto(body: Uint8Array): unknown[] {
  const decoded = LogsData.decode(body) as { resourceLogs?: unknown };
  const resourceLogs = decoded.resourceLogs;
  if (!Array.isArray(resourceLogs)) return [];

  return resourceLogs.map((rl) => {
    const r = (rl ?? {}) as Record<string, unknown>;
    const resource = resourceToJson(r.resource);
    const scopeLogs = Array.isArray(r.scopeLogs) ? r.scopeLogs : [];
    return {
      resource,
      scopeLogs: (scopeLogs as unknown[]).map((sl) => {
        const scopeObj = (sl ?? {}) as Record<string, unknown>;
        const scopeRaw = scopeObj.scope as Record<string, unknown> | undefined;
        const scope =
          scopeRaw && typeof scopeRaw.name === "string"
            ? {
                name: scopeRaw.name as string,
                version:
                  typeof scopeRaw.version === "string" ? (scopeRaw.version as string) : undefined,
              }
            : undefined;
        const logRecords = Array.isArray(scopeObj.logRecords) ? scopeObj.logRecords : [];
        return {
          scope,
          logRecords: (logRecords as unknown[]).map((lr) => {
            const l = (lr ?? {}) as Record<string, unknown>;
            return {
              timeUnixNano: longToString(l.timeUnixNano),
              observedTimeUnixNano: longToString(l.observedTimeUnixNano),
              severityNumber:
                l.severityNumber !== null && l.severityNumber !== undefined
                  ? Number(l.severityNumber)
                  : undefined,
              severityText: typeof l.severityText === "string" ? l.severityText : undefined,
              body: anyValueToJson(l.body),
              attributes: keyValueListToJson(l.attributes),
              traceId: l.traceId ?? undefined,
              spanId: l.spanId ?? undefined,
              flags: l.flags !== null && l.flags !== undefined ? Number(l.flags) : undefined,
            };
          }),
        };
      }),
    };
  });
}

/**
 * Detects whether the request Content-Type advertises OTLP protobuf.
 * Per spec: `application/x-protobuf`. We also accept `application/protobuf`
 * (some OTel SDKs send it) and any `+protobuf` suffix on the OTLP media
 * range, but reject unrelated types like `application/octet-stream` unless
 * the client explicitly requests OTLP binary via the documented type.
 */
export function isProtobufContentType(contentType: string | undefined | null): boolean {
  if (!contentType) return false;
  const main = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!main) return false;
  if (main === "application/x-protobuf" || main === "application/protobuf") return true;
  // OTLP/JSON-protobuf wire format suffix (e.g. application/json+protobuf).
  if (main.endsWith("+protobuf")) return true;
  return false;
}
