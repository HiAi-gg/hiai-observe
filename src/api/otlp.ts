import { Elysia, t } from "elysia";
import { parseOTLPTraces, parseOTLPMetrics } from "../ingestion/otlp-parser.js";
import { insertTraces } from "../store/traces.js";
import { db } from "../store/db.js";
import { projects } from "../store/schema.js";
import { eq } from "drizzle-orm";

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
      const apiKey = extractApiKey(headers);
      if (!apiKey) {
        set.status = 401;
        return { error: "Missing API key" };
      }

      const projectId = await resolveProjectId(apiKey);
      if (!projectId) {
        set.status = 403;
        return { error: "Invalid API key" };
      }

      const resourceSpans = (body as { resourceSpans?: OTLPResourceSpan[] }).resourceSpans;
      if (!resourceSpans?.length) {
        set.status = 400;
        return { error: "No resourceSpans in payload" };
      }

      const parsed = parseOTLPTraces(resourceSpans, projectId);
      if (parsed.length > 0) {
        await insertTraces(parsed);
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
      const apiKey = extractApiKey(headers);
      if (!apiKey) {
        set.status = 401;
        return { error: "Missing API key" };
      }

      const projectId = await resolveProjectId(apiKey);
      if (!projectId) {
        set.status = 403;
        return { error: "Invalid API key" };
      }

      // Metrics are stored as traces with kind='metric' for MVP
      const resourceMetrics = (body as { resourceMetrics?: unknown[] }).resourceMetrics;
      if (!resourceMetrics?.length) {
        set.status = 400;
        return { error: "No resourceMetrics in payload" };
      }

      const parsed = parseOTLPMetrics(resourceMetrics, projectId);
      if (parsed.length > 0) {
        await insertTraces(parsed);
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

// Helpers

function extractApiKey(headers: Record<string, string | undefined>): string | null {
  const auth = headers["authorization"];
  if (!auth) return null;

  // Bearer token
  if (auth.startsWith("Bearer ")) {
    return auth.slice(7);
  }

  // Basic auth (Sentry SDK format)
  if (auth.startsWith("Basic ")) {
    const decoded = Buffer.from(auth.slice(6), "base64").toString();
    // Format: "apikey:" or "apikey:secret"
    const colonIndex = decoded.indexOf(":");
    if (colonIndex === -1) return decoded;
    return decoded.slice(0, colonIndex);
  }

  // X-Api-Key header fallback
  return headers["x-api-key"] ?? null;
}

async function resolveProjectId(apiKey: string): Promise<string | null> {
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.apiKey, apiKey))
    .limit(1);

  return project?.id ?? null;
}
