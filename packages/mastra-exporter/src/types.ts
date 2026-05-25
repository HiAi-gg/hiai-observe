/**
 * Configuration for HiaiObserveExporter.
 */
export interface HiaiObserveExporterConfig {
  /** HiAi Observe server URL (e.g. "http://localhost:8001") */
  endpoint: string;
  /** API key for authentication */
  apiKey: string;
  /** Service name reported in OTLP resource attributes. Default: "mastra-app" */
  serviceName?: string;
  /** Number of spans to buffer before flushing. Default: 100 */
  batchSize?: number;
  /** Flush interval in milliseconds. Default: 5000 (5s) */
  flushInterval?: number;
  /** Request timeout in milliseconds. Default: 10000 (10s) */
  timeout?: number;
  /** Max retries per flush. Default: 3 */
  maxRetries?: number;
}

/**
 * OTLP-compatible span format matching HiAi Observe's /v1/traces endpoint.
 */
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
      doubleValue?: number;
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

/**
 * OTLP ResourceSpans payload structure.
 */
export interface OTLPTracePayload {
  resourceSpans: Array<{
    resource?: {
      attributes: Array<{
        key: string;
        value: { stringValue?: string };
      }>;
    };
    scopeSpans: Array<{
      scope?: { name: string; version?: string };
      spans: OTLPSpan[];
    }>;
  }>;
}

/**
 * Mastra's span interface (what the exporter receives).
 */
export interface MastraSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind?: string;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes?: Record<string, string>;
  status?: { code?: string; message?: string };
  events?: Array<{
    timeUnixNano: string;
    name: string;
    attributes?: Record<string, string>;
  }>;
}
