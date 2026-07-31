/**
 * Shared types for the HiAi Observe Mastra exporter.
 *
 * The exporter consumes Mastra 1.16+'s event-based observability API. Instead
 * of redefining Mastra's span shape (which drifted out of sync before), we
 * re-export the canonical types from `@mastra/core/observability` and only
 * describe the OTLP wire format that HiAi Observe's `/v1/traces` endpoint
 * expects (mirrors the Zod schema in `src/api/otlp.ts` on the server).
 */

// Re-export Mastra's canonical tracing types so consumers don't have to guess
// the shape of the data handed to the exporter. These are type-only re-exports
// and add no runtime dependency.
export type {
  AnyExportedSpan,
  TracingEvent,
  TracingEventType,
} from "@mastra/core/observability";

/**
 * Configuration for {@link HiaiObserveExporter}.
 *
 * Accepts the standard {@link BaseExporterConfig} fields (logger, logLevel,
 * customSpanFormatter) plus HiAi-Observe-specific connection and batching
 * options. `BaseExporterConfig` is re-exported here for convenience.
 */
export type { BaseExporterConfig } from "@mastra/observability";

export interface HiaiObserveExporterConfig {
  /** HiAi Observe server URL (e.g. "http://localhost:8001"). */
  endpoint: string;
  /** API key for authentication (`ho_…`). */
  apiKey: string;
  /** Service name reported in OTLP resource attributes. Default: "mastra-app". */
  serviceName?: string;
  /** Number of spans to buffer before flushing. Default: 100. */
  batchSize?: number;
  /** Flush interval in milliseconds. Default: 5000 (5s). */
  flushInterval?: number;
  /** Request timeout in milliseconds. Default: 10000 (10s). */
  timeout?: number;
  /** Max retries per flush. Default: 3. */
  maxRetries?: number;
}

/**
 * A single OTLP attribute value. Exactly one value field is populated,
 * discriminated by the original JS type (see `toAnyValue` in index.ts).
 */
export interface OTLPAnyValue {
  stringValue?: string;
  intValue?: string;
  doubleValue?: number;
  boolValue?: boolean;
}

/** OTLP key/value attribute pair. */
export interface OTLPKeyValue {
  key: string;
  value: OTLPAnyValue;
}

/**
 * OTLP-compatible span format matching HiAi Observe's `/v1/traces` endpoint.
 */
export interface OTLPSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: string;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: OTLPKeyValue[];
  status?: { code?: string; message?: string };
  events?: Array<{
    timeUnixNano: string;
    name: string;
    attributes?: OTLPKeyValue[];
  }>;
}

/**
 * OTLP ResourceSpans payload structure — the top-level body POSTed to
 * `/v1/traces`.
 */
export interface OTLPTracePayload {
  resourceSpans: Array<{
    resource?: {
      attributes: OTLPKeyValue[];
    };
    scopeSpans: Array<{
      scope?: { name: string; version?: string };
      spans: OTLPSpan[];
    }>;
  }>;
}
