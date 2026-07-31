/**
 * @hiai-gg/hiai-observe/mastra
 *
 * Mastra 1.16+ observability exporter that streams traces to HiAi Observe via
 * the OTLP/HTTP JSON protocol (`POST /v1/traces`).
 *
 * Implements Mastra's official {@link ObservabilityExporter} contract by
 * extending {@link BaseExporter} from `@mastra/observability`. Mastra pushes
 * spans one event at a time (`SPAN_STARTED` / `SPAN_UPDATED` / `SPAN_ENDED`);
 * we buffer completed (`SPAN_ENDED`) spans and flush them in batches with
 * retry + backoff, so consumers no longer need to write their own adapter.
 */

import type { TracingEvent } from "@mastra/core/observability";
import { BaseExporter } from "@mastra/observability";
import type {
  HiaiObserveExporterConfig,
  OTLPKeyValue,
  OTLPSpan,
  OTLPTracePayload,
} from "./types.js";

export type { AnyExportedSpan as MastraSpan } from "@mastra/core/observability";
// Backward-compat: older code imported a `MastraSpan` type from this module.
// It now resolves to Mastra's canonical exported-span type.
export type { HiaiObserveExporterConfig } from "./types.js";

const DEFAULT_SERVICE_NAME = "mastra-app";
const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_FLUSH_INTERVAL = 5000;
const DEFAULT_TIMEOUT = 10000;
const DEFAULT_MAX_RETRIES = 3;
const RETRY_BASE_DELAY = 1000;

/** Exporter + SDK version, reported in resource/scope attributes. */
const EXPORTER_VERSION = "0.2.1";

/** Discriminator literal for completed spans (see TracingEventType.SPAN_ENDED). */
const SPAN_ENDED = "span_ended";

/**
 * Mastra-compatible observability exporter for HiAi Observe.
 *
 * Wire it into a Mastra instance via the standard `Observability` config:
 *
 * ```ts
 * import { Mastra } from "@mastra/core";
 * import { Observability } from "@mastra/observability";
 * import { HiaiObserveExporter } from "@hiai-gg/hiai-observe/mastra";
 *
 * const observability = new Observability({
 *   configs: {
 *     default: {
 *       serviceName: "my-app",
 *       exporters: [new HiaiObserveExporter({
 *         endpoint: "http://localhost:8001",
 *         apiKey: process.env.HIAI_OBSERVE_API_KEY!,
 *       })],
 *     },
 *   },
 * });
 *
 * new Mastra({ observability });
 * ```
 */
export class HiaiObserveExporter extends BaseExporter {
  /** ObservabilityExporter name — used by Mastra for routing/logging. */
  name = "hiai-observe";

  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly serviceName: string;
  private readonly batchSize: number;
  private readonly flushInterval: number;
  private readonly timeout: number;
  private readonly maxRetries: number;

  private buffer: OTLPSpan[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private flushing = false;

  constructor(config: HiaiObserveExporterConfig) {
    super();

    this.endpoint = config.endpoint.replace(/\/+$/, "");
    this.apiKey = config.apiKey;
    this.serviceName = config.serviceName ?? DEFAULT_SERVICE_NAME;
    this.batchSize = config.batchSize ?? DEFAULT_BATCH_SIZE;
    this.flushInterval = config.flushInterval ?? DEFAULT_FLUSH_INTERVAL;
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;

    if (!this.apiKey) {
      // BaseExporter will mark us disabled so Mastra skips further work.
      this.setDisabled("HiaiObserveExporter: missing apiKey");
      return;
    }

    this.startFlushInterval();
  }

  /**
   * Receive a tracing event from Mastra. Only `SPAN_ENDED` carries the full
   * timing data worth exporting; starts/updates are ignored.
   */
  protected async _exportTracingEvent(event: TracingEvent): Promise<void> {
    if (event.type !== SPAN_ENDED) return;

    // `customSpanFormatter` (if configured) is applied here. It receives and
    // returns the full event; we then extract the (possibly mutated) span.
    const formatted = await this.applySpanFormatter(event);
    this.buffer.push(this.convertSpan(formatted.exportedSpan));

    if (this.buffer.length >= this.batchSize) {
      // Fire and forget — Mastra does not await per-event export.
      this.flush().catch(() => {});
    }
  }

  /**
   * Flush all buffered spans to HiAi Observe.
   */
  async flush(): Promise<void> {
    if (this.flushing || this.buffer.length === 0) return;

    this.flushing = true;
    const batch = this.buffer.splice(0);

    try {
      const payload = this.buildPayload(batch);
      await this.sendWithRetry(payload);
    } catch (err) {
      // Re-add failed spans to the buffer for the next flush attempt.
      this.buffer.unshift(...batch);
      console.error("[hiai-observe] Flush failed:", err);
    } finally {
      this.flushing = false;
    }
  }

  /**
   * Flush remaining spans and stop the flush interval.
   */
  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
    await super.shutdown();
  }

  /**
   * Current number of buffered spans (useful in tests).
   */
  get bufferSize(): number {
    return this.buffer.length;
  }

  // ── Private ────────────────────────────────────────────────────────────

  private startFlushInterval(): void {
    this.flushTimer = setInterval(() => {
      this.flush().catch(() => {});
    }, this.flushInterval);
  }

  private buildPayload(spans: OTLPSpan[]): OTLPTracePayload {
    return {
      resourceSpans: [
        {
          resource: {
            attributes: [
              { key: "service.name", value: { stringValue: this.serviceName } },
              { key: "hiai.exporter.version", value: { stringValue: EXPORTER_VERSION } },
            ],
          },
          scopeSpans: [
            {
              scope: { name: "@hiai-gg/hiai-observe", version: EXPORTER_VERSION },
              spans,
            },
          ],
        },
      ],
    };
  }

  /**
   * Convert a Mastra {@link AnyExportedSpan} into the OTLP shape HiAi Observe
   * accepts. Span id (`id`) becomes `spanId`; `startTime`/`endTime` `Date`s
   * become nanosecond strings; the structured `attributes`/`metadata`/… are
   * flattened into typed OTLP key/value pairs.
   */
  private convertSpan(span: TracingEvent["exportedSpan"]): OTLPSpan {
    const attributes: OTLPKeyValue[] = [];

    // Span-type-specific attributes (e.g. model, tokens) live in `attributes`.
    appendAttributes(attributes, "attr", span.attributes as Record<string, unknown> | undefined);
    // User-defined metadata.
    appendAttributes(attributes, "metadata", span.metadata);
    // Optional correlation context.
    appendAttributes(attributes, "ctx", span.requestContext);

    // Entity provenance (agent/workflow that produced the span).
    if (span.entityType) attributes.push(kv("entity.type", span.entityType));
    if (span.entityId) attributes.push(kv("entity.id", span.entityId));
    if (span.entityName) attributes.push(kv("entity.name", span.entityName));

    // Input / output are arbitrary JSON — serialize for searchability.
    if (span.input !== undefined) attributes.push(kv("input", span.input));
    if (span.output !== undefined) attributes.push(kv("output", span.output));

    // Surface error details (if any) as searchable attributes + OTLP status.
    if (span.errorInfo) {
      attributes.push(kv("error.message", span.errorInfo.message));
      if (span.errorInfo.name) attributes.push(kv("error.name", span.errorInfo.name));
      if (span.errorInfo.stack) attributes.push(kv("error.stack", span.errorInfo.stack));
    }

    const status: OTLPSpan["status"] = span.errorInfo
      ? { code: "ERROR", message: span.errorInfo.message }
      : { code: "OK" };

    return {
      traceId: span.traceId,
      spanId: span.id,
      parentSpanId: span.parentSpanId,
      name: span.name,
      kind: "INTERNAL",
      startTimeUnixNano: dateToNanos(span.startTime),
      endTimeUnixNano: dateToNanos(span.endTime ?? span.startTime),
      attributes,
      status,
    };
  }

  private async sendWithRetry(payload: OTLPTracePayload): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const response = await fetch(`${this.endpoint}/v1/traces`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) return;

        // Non-retryable auth errors.
        if (response.status === 401 || response.status === 403) {
          throw new Error(`Authentication failed (${response.status}): ${await response.text()}`);
        }

        lastError = new Error(`HTTP ${response.status}: ${await response.text()}`);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        // Don't retry auth failures.
        if (
          lastError.message.includes("Authentication failed") ||
          lastError.message.includes("401") ||
          lastError.message.includes("403")
        ) {
          throw lastError;
        }
      }

      // Exponential backoff: 1s, 2s, 4s, …
      if (attempt < this.maxRetries) {
        const delay = RETRY_BASE_DELAY * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError ?? new Error("Unknown error after retries");
  }
}

// ── Conversion helpers ─────────────────────────────────────────────────────

/** Convert a Date (or unix-ms number) to an OTLP nanosecond string. */
function dateToNanos(d: Date | number | string): string {
  const ms = typeof d === "number" ? d : new Date(d).getTime();
  return String(BigInt(ms) * 1_000_000n);
}

/**
 * Build a typed OTLP `AnyValue` from an arbitrary JS primitive. Objects/arrays
 * are JSON-serialized so they remain searchable on the server.
 */
function toAnyValue(value: unknown): OTLPKeyValue["value"] {
  if (value === null || value === undefined) return { stringValue: "" };
  if (typeof value === "boolean") return { boolValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { intValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === "bigint") return { intValue: String(value) };
  if (typeof value === "string") return { stringValue: value };
  // Objects, arrays, etc.
  try {
    return { stringValue: JSON.stringify(value) };
  } catch {
    return { stringValue: String(value) };
  }
}

function kv(key: string, value: unknown): OTLPKeyValue {
  return { key, value: toAnyValue(value) };
}

/** Flatten a record under a `prefix.` namespace into typed key/value pairs. */
function appendAttributes(
  out: OTLPKeyValue[],
  prefix: string,
  record: Record<string, unknown> | undefined,
): void {
  if (!record) return;
  for (const [key, value] of Object.entries(record)) {
    out.push(kv(`${prefix}.${key}`, value));
  }
}
