import { Elysia } from "elysia";
import { z } from "zod";
import { parseOTLPLogs, parseOTLPMetrics, parseOTLPTraces } from "../ingestion/otlp-parser.js";
import {
  decodeLogsRequestProto,
  decodeMetricsRequestProto,
  decodeTraceRequestProto,
  isProtobufContentType,
} from "../ingestion/otlp-proto.js";
import { lookupProject, resolveApiKey } from "../lib/auth.js";
import { insertLogs } from "../store/logs.js";
import { insertTraces } from "../store/traces.js";

const MAX_BODY_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_ARRAY_LENGTH = 1000; // max spans/metrics per request

// ── Zod schemas for OTLP JSON payloads ─────────────────────────────────
// Based on OpenTelemetry Protocol specification (OTLP/HTTP JSON)

const AnyValueSchema = z.object({
  stringValue: z.string().optional(),
  intValue: z.string().optional(),
  doubleValue: z.number().optional(),
  boolValue: z.boolean().optional(),
});

const KeyValueSchema = z.object({
  key: z.string(),
  value: AnyValueSchema,
});

const OTLPSpanSchema = z.object({
  traceId: z.string().min(1),
  spanId: z.string().min(1),
  parentSpanId: z.string().optional(),
  name: z.string(),
  kind: z.union([z.string(), z.number()]).optional(),
  startTimeUnixNano: z.string(),
  endTimeUnixNano: z.string(),
  attributes: z.array(KeyValueSchema).optional(),
  status: z
    .object({
      code: z.union([z.string(), z.number()]).optional(),
      message: z.string().optional(),
    })
    .optional(),
  events: z
    .array(
      z.object({
        timeUnixNano: z.string(),
        name: z.string(),
        attributes: z.array(KeyValueSchema).optional(),
      }),
    )
    .optional(),
});

const OTLPResourceSchema = z.object({
  attributes: z.array(KeyValueSchema),
});

const OTLPResourceSpanSchema = z.object({
  resource: OTLPResourceSchema.optional(),
  scopeSpans: z
    .array(
      z.object({
        scope: z
          .object({
            name: z.string(),
            version: z.string().optional(),
          })
          .optional(),
        spans: z.array(OTLPSpanSchema),
      }),
    )
    .optional(),
});

const OTLPTracePayloadSchema = z.object({
  resourceSpans: z.array(OTLPResourceSpanSchema).min(1).max(MAX_ARRAY_LENGTH),
});

const OTLPMetricDataPointSchema = z.object({
  startTimeUnixNano: z.string().optional(),
  timeUnixNano: z.string().optional(),
  asInt: z.union([z.number(), z.string()]).optional(),
  asDouble: z.union([z.number(), z.string()]).optional(),
});

const OTLPMetricSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  unit: z.string().optional(),
  sum: z
    .object({
      dataPoints: z.array(OTLPMetricDataPointSchema).optional(),
    })
    .optional(),
  gauge: z
    .object({
      dataPoints: z.array(OTLPMetricDataPointSchema).optional(),
    })
    .optional(),
});

const OTLPResourceMetricSchema = z.object({
  resource: OTLPResourceSchema.optional(),
  scopeMetrics: z
    .array(
      z.object({
        metrics: z.array(OTLPMetricSchema),
      }),
    )
    .optional(),
});

const OTLPMetricPayloadSchema = z.object({
  resourceMetrics: z.array(OTLPResourceMetricSchema).min(1).max(MAX_ARRAY_LENGTH),
});

const OTLPLogRecordSchema = z.object({
  timeUnixNano: z.string().optional(),
  observedTimeUnixNano: z.string().optional(),
  severityNumber: z.union([z.number(), z.string()]).optional(),
  severityText: z.string().optional(),
  body: AnyValueSchema.optional(),
  attributes: z.array(KeyValueSchema).optional(),
  traceId: z.string().optional(),
  spanId: z.string().optional(),
});

const OTLPResourceLogSchema = z.object({
  resource: OTLPResourceSchema.optional(),
  scopeLogs: z
    .array(
      z.object({
        scope: z
          .object({
            name: z.string(),
            version: z.string().optional(),
          })
          .optional(),
        logRecords: z.array(OTLPLogRecordSchema).optional(),
      }),
    )
    .optional(),
});

const OTLPLogsPayloadSchema = z.object({
  resourceLogs: z.array(OTLPResourceLogSchema).min(1).max(MAX_ARRAY_LENGTH),
});

// OTLP JSON types (subset of OpenTelemetry spec)
export interface OTLPResource {
  attributes: Array<{
    key: string;
    value: {
      stringValue?: string;
      intValue?: string;
      doubleValue?: boolean;
      boolValue?: boolean;
    };
  }>;
}

export interface OTLPSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: string;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: Array<{
    key: string;
    value: {
      stringValue?: string;
      intValue?: string;
      doubleValue?: boolean;
      boolValue?: boolean;
    };
  }>;
  status?: { code?: string; message?: string };
  events?: Array<{
    timeUnixNano: string;
    name: string;
    attributes?: Array<{ key: string; value: { stringValue?: string } }>;
  }>;
}

export interface OTLPResourceSpan {
  resource?: OTLPResource;
  scopeSpans?: Array<{
    scope?: { name: string; version?: string };
    spans: OTLPSpan[];
  }>;
}

export interface OTLPLogRecord {
  timeUnixNano?: string;
  observedTimeUnixNano?: string;
  severityNumber?: number | string;
  severityText?: string;
  body?: {
    stringValue?: string;
    intValue?: string;
    doubleValue?: boolean;
    boolValue?: boolean;
  };
  attributes?: Array<{
    key: string;
    value: {
      stringValue?: string;
      intValue?: string;
      doubleValue?: boolean;
      boolValue?: boolean;
    };
  }>;
  traceId?: string;
  spanId?: string;
}

export interface OTLPResourceLog {
  resource?: OTLPResource;
  scopeLogs?: Array<{
    scope?: { name: string; version?: string };
    logRecords?: OTLPLogRecord[];
  }>;
}

// ── Shared auth helpers ───────────────────────────────────────────────

interface AuthOk {
  ok: true;
  projectId: string;
}
interface AuthErr {
  ok: false;
  status: 401 | 403;
  error: string;
}

async function authorizeRequest(
  headers: Record<string, string | undefined>,
): Promise<AuthOk | AuthErr> {
  const authKey =
    resolveApiKey(headers.authorization) ??
    (headers["x-api-key"] ? { apiKey: headers["x-api-key"]! } : null);
  if (!authKey) {
    return { ok: false, status: 401, error: "Missing API key" };
  }
  const project = await lookupProject(authKey.apiKey);
  if (!project) {
    return { ok: false, status: 403, error: "Invalid API key" };
  }
  return { ok: true, projectId: project.projectId };
}

// ── Routes ────────────────────────────────────────────────────────────

export const otlpRoutes = new Elysia({ prefix: "/v1" })
  // OTLP HTTP Trace Export (JSON + Protobuf)
  .post(
    "/traces",
    async ({ request, headers, set }) => {
      try {
        // Read raw body once — both JSON and protobuf branches consume bytes.
        const buf = new Uint8Array(await request.arrayBuffer());
        if (buf.byteLength > MAX_BODY_BYTES) {
          set.status = 413;
          return { error: "Payload too large", detail: "Max size: 5MB" };
        }

        const auth = await authorizeRequest(headers);
        if (!auth.ok) {
          set.status = auth.status;
          return { error: auth.error };
        }

        const contentType = headers["content-type"] ?? "";
        const useProto = isProtobufContentType(contentType);

        let resourceSpans: OTLPResourceSpan[];
        try {
          if (useProto) {
            resourceSpans = decodeTraceRequestProto(buf);
          } else {
            const text = new TextDecoder("utf-8").decode(buf);
            let parsed: unknown;
            try {
              parsed = JSON.parse(text);
            } catch {
              set.status = 400;
              return { error: "Invalid JSON" };
            }
            const traceResult = OTLPTracePayloadSchema.safeParse(parsed);
            if (!traceResult.success) {
              set.status = 400;
              return {
                error: "Invalid OTLP trace payload",
                detail: JSON.stringify(traceResult.error.flatten()),
              };
            }
            resourceSpans = traceResult.data.resourceSpans as OTLPResourceSpan[];
          }
        } catch (err) {
          // protobuf decode failure, malformed body, etc.
          const detail = err instanceof Error ? err.message : String(err);
          set.status = 400;
          return { error: "Invalid OTLP trace payload", detail };
        }

        if (resourceSpans.length === 0 || resourceSpans.length > MAX_ARRAY_LENGTH) {
          set.status = 400;
          return {
            error: "Invalid OTLP trace payload",
            detail: `resourceSpans must contain 1..${MAX_ARRAY_LENGTH} entries`,
          };
        }

        const traces = parseOTLPTraces(resourceSpans, auth.projectId);
        if (traces.length > 0) {
          await insertTraces(traces);
        }

        // OTLP expects empty 200 on success
        return {};
      } catch (_err) {
        set.status = 500;
        return { error: "Internal error" };
      }
    },
    {
      // Body is consumed raw via `request.arrayBuffer()`; no schema here.
    },
  )

  // OTLP HTTP Metrics Export (JSON + Protobuf)
  .post(
    "/metrics",
    async ({ request, headers, set }) => {
      try {
        const buf = new Uint8Array(await request.arrayBuffer());
        if (buf.byteLength > MAX_BODY_BYTES) {
          set.status = 413;
          return { error: "Payload too large", detail: "Max size: 5MB" };
        }

        const auth = await authorizeRequest(headers);
        if (!auth.ok) {
          set.status = auth.status;
          return { error: auth.error };
        }

        const contentType = headers["content-type"] ?? "";
        const useProto = isProtobufContentType(contentType);

        let resourceMetrics: unknown[];
        try {
          if (useProto) {
            resourceMetrics = decodeMetricsRequestProto(buf);
          } else {
            const text = new TextDecoder("utf-8").decode(buf);
            let parsed: unknown;
            try {
              parsed = JSON.parse(text);
            } catch {
              set.status = 400;
              return { error: "Invalid JSON" };
            }
            const metricResult = OTLPMetricPayloadSchema.safeParse(parsed);
            if (!metricResult.success) {
              set.status = 400;
              return {
                error: "Invalid OTLP metric payload",
                detail: JSON.stringify(metricResult.error.flatten()),
              };
            }
            resourceMetrics = metricResult.data.resourceMetrics;
          }
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err);
          set.status = 400;
          return { error: "Invalid OTLP metric payload", detail };
        }

        if (resourceMetrics.length === 0 || resourceMetrics.length > MAX_ARRAY_LENGTH) {
          set.status = 400;
          return {
            error: "Invalid OTLP metric payload",
            detail: `resourceMetrics must contain 1..${MAX_ARRAY_LENGTH} entries`,
          };
        }

        // Metrics are stored as traces with kind='metric' for MVP
        const traces = parseOTLPMetrics(resourceMetrics, auth.projectId);
        if (traces.length > 0) {
          await insertTraces(traces);
        }

        return {};
      } catch (_err) {
        set.status = 500;
        return { error: "Internal error" };
      }
    },
    {
      // Body is consumed raw via `request.arrayBuffer()`; no schema here.
    },
  )

  // OTLP HTTP Logs Export (JSON + Protobuf)
  .post(
    "/logs",
    async ({ request, headers, set }) => {
      try {
        const buf = new Uint8Array(await request.arrayBuffer());
        if (buf.byteLength > MAX_BODY_BYTES) {
          set.status = 413;
          return { error: "Payload too large", detail: "Max size: 5MB" };
        }

        const auth = await authorizeRequest(headers);
        if (!auth.ok) {
          set.status = auth.status;
          return { error: auth.error };
        }

        const contentType = headers["content-type"] ?? "";
        const useProto = isProtobufContentType(contentType);

        let resourceLogs: unknown[];
        try {
          if (useProto) {
            resourceLogs = decodeLogsRequestProto(buf);
          } else {
            const text = new TextDecoder("utf-8").decode(buf);
            let parsed: unknown;
            try {
              parsed = JSON.parse(text);
            } catch {
              set.status = 400;
              return { error: "Invalid JSON" };
            }
            const logsResult = OTLPLogsPayloadSchema.safeParse(parsed);
            if (!logsResult.success) {
              set.status = 400;
              return {
                error: "Invalid OTLP logs payload",
                detail: JSON.stringify(logsResult.error.flatten()),
              };
            }
            resourceLogs = logsResult.data.resourceLogs as unknown[];
          }
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err);
          set.status = 400;
          return { error: "Invalid OTLP logs payload", detail };
        }

        if (resourceLogs.length === 0 || resourceLogs.length > MAX_ARRAY_LENGTH) {
          set.status = 400;
          return {
            error: "Invalid OTLP logs payload",
            detail: `resourceLogs must contain 1..${MAX_ARRAY_LENGTH} entries`,
          };
        }

        const logs = parseOTLPLogs(resourceLogs, auth.projectId);
        if (logs.length > 0) {
          await insertLogs(logs);
        }

        return {};
      } catch (_err) {
        set.status = 500;
        return { error: "Internal error" };
      }
    },
    {
      // Body is consumed raw via `request.arrayBuffer()`; no schema here.
    },
  );
