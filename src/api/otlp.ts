import { Elysia, t } from "elysia";
import { z } from "zod";
import { parseOTLPTraces, parseOTLPMetrics } from "../ingestion/otlp-parser.js";
import { insertTraces } from "../store/traces.js";
import { resolveApiKey, lookupProject } from "../lib/auth.js";

const MAX_BODY_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_ARRAY_LENGTH = 1000; // max spans/metrics per request

// ── Zod schemas for OTLP JSON payloads ──────────────────────────────
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
  status: z.object({
    code: z.union([z.string(), z.number()]).optional(),
    message: z.string().optional(),
  }).optional(),
  events: z.array(z.object({
    timeUnixNano: z.string(),
    name: z.string(),
    attributes: z.array(KeyValueSchema).optional(),
  })).optional(),
});

const OTLPResourceSchema = z.object({
  attributes: z.array(KeyValueSchema),
});

const OTLPResourceSpanSchema = z.object({
  resource: OTLPResourceSchema.optional(),
  scopeSpans: z.array(z.object({
    scope: z.object({
      name: z.string(),
      version: z.string().optional(),
    }).optional(),
    spans: z.array(OTLPSpanSchema),
  })).optional(),
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
  sum: z.object({
    dataPoints: z.array(OTLPMetricDataPointSchema).optional(),
  }).optional(),
  gauge: z.object({
    dataPoints: z.array(OTLPMetricDataPointSchema).optional(),
  }).optional(),
});

const OTLPResourceMetricSchema = z.object({
  resource: OTLPResourceSchema.optional(),
  scopeMetrics: z.array(z.object({
    metrics: z.array(OTLPMetricSchema),
  })).optional(),
});

const OTLPMetricPayloadSchema = z.object({
  resourceMetrics: z.array(OTLPResourceMetricSchema).min(1).max(MAX_ARRAY_LENGTH),
});

// OTLP JSON types (subset of OpenTelemetry spec)
export interface OTLPResource {
  attributes: Array<{ key: string; value: { stringValue?: string; intValue?: string; doubleValue?: boolean; boolValue?: boolean } }>;
}

export interface OTLPSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: string;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: Array<{ key: string; value: { stringValue?: string; intValue?: string; doubleValue?: boolean; boolValue?: boolean } }>;
  status?: { code?: string; message?: string };
  events?: Array<{ timeUnixNano: string; name: string; attributes?: Array<{ key: string; value: { stringValue?: string } }> }>;
}

export interface OTLPResourceSpan {
  resource?: OTLPResource;
  scopeSpans?: Array<{
    scope?: { name: string; version?: string };
    spans: OTLPSpan[];
  }>;
}

export const otlpRoutes = new Elysia({ prefix: "/v1" })
  // OTLP HTTP Trace Export (JSON)
  .post("/traces", async ({ body, headers, set }) => {
    try {
      // Body size guard
      const bodyStr = JSON.stringify(body);
      if (bodyStr.length > MAX_BODY_BYTES) {
        set.status = 413;
        return { error: "Payload too large", detail: "Max size: 5MB" };
      }

      const authKey = resolveApiKey(headers["authorization"])
        ?? (headers["x-api-key"] ? { apiKey: headers["x-api-key"]! } : null);
      if (!authKey) {
        set.status = 401;
        return { error: "Missing API key" };
      }

      const project = await lookupProject(authKey.apiKey);
      if (!project) {
        set.status = 403;
        return { error: "Invalid API key" };
      }
      const projectId = project.projectId;

      // Zod validation for OTLP trace payload structure
      const traceResult = OTLPTracePayloadSchema.safeParse(body);
      if (!traceResult.success) {
        set.status = 400;
        return { error: "Invalid OTLP trace payload", detail: JSON.stringify(traceResult.error.flatten()) };
      }

      const resourceSpans = traceResult.data.resourceSpans as OTLPResourceSpan[];
      const traces = parseOTLPTraces(resourceSpans, projectId);
      if (traces.length > 0) {
        await insertTraces(traces);
      }

      // OTLP expects empty 200 on success
      return {};
    } catch (err) {
      set.status = 500;
      return { error: "Internal error" };
    }
  }, {
    body: t.Object({
      resourceSpans: t.Array(t.Any()),
    }),
  })

  // OTLP HTTP Metrics Export (JSON)
  .post("/metrics", async ({ body, headers, set }) => {
    try {
      // Body size guard
      const bodyStr = JSON.stringify(body);
      if (bodyStr.length > MAX_BODY_BYTES) {
        set.status = 413;
        return { error: "Payload too large", detail: "Max size: 5MB" };
      }

      const authKey = resolveApiKey(headers["authorization"])
        ?? (headers["x-api-key"] ? { apiKey: headers["x-api-key"]! } : null);
      if (!authKey) {
        set.status = 401;
        return { error: "Missing API key" };
      }

      const project = await lookupProject(authKey.apiKey);
      if (!project) {
        set.status = 403;
        return { error: "Invalid API key" };
      }
      const projectId = project.projectId;

      // Zod validation for OTLP metric payload structure
      const metricResult = OTLPMetricPayloadSchema.safeParse(body);
      if (!metricResult.success) {
        set.status = 400;
        return { error: "Invalid OTLP metric payload", detail: JSON.stringify(metricResult.error.flatten()) };
      }

      // Metrics are stored as traces with kind='metric' for MVP
      const traces = parseOTLPMetrics(metricResult.data.resourceMetrics, projectId);
      if (traces.length > 0) {
        await insertTraces(traces);
      }

      return {};
    } catch (err) {
      set.status = 500;
      return { error: "Internal error" };
    }
  }, {
    body: t.Object({
      resourceMetrics: t.Array(t.Any()),
    }),
  });
