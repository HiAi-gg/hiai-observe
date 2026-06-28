/**
 * @hiai-gg/hiai-observe/mastra
 *
 * Mastra-compatible observability exporter that sends traces to HiAi Observe
 * via the OTLP HTTP JSON protocol.
 */

import type { HiaiObserveExporterConfig, MastraSpan, OTLPSpan, OTLPTracePayload } from "./types.js";

export type { HiaiObserveExporterConfig, MastraSpan } from "./types.js";

const DEFAULT_SERVICE_NAME = "mastra-app";
const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_FLUSH_INTERVAL = 5000;
const DEFAULT_TIMEOUT = 10000;
const DEFAULT_MAX_RETRIES = 3;
const RETRY_BASE_DELAY = 1000;

export class HiaiObserveExporter {
  private config: Required<HiaiObserveExporterConfig>;
  private buffer: MastraSpan[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private flushing = false;

  constructor(config: HiaiObserveExporterConfig) {
    this.config = {
      endpoint: config.endpoint.replace(/\/+$/, ""),
      apiKey: config.apiKey,
      serviceName: config.serviceName ?? DEFAULT_SERVICE_NAME,
      batchSize: config.batchSize ?? DEFAULT_BATCH_SIZE,
      flushInterval: config.flushInterval ?? DEFAULT_FLUSH_INTERVAL,
      timeout: config.timeout ?? DEFAULT_TIMEOUT,
      maxRetries: config.maxRetries ?? DEFAULT_MAX_RETRIES,
    };

    this.startFlushInterval();
  }

  /**
   * Accept spans and buffer them. Flushes automatically when buffer is full.
   */
  export(spans: MastraSpan[]): void {
    for (const span of spans) {
      this.buffer.push(span);
      if (this.buffer.length >= this.config.batchSize) {
        // Fire and don't await — export is synchronous in Mastra's interface
        this.flush().catch(() => {});
      }
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
      // Re-add failed spans to buffer for next flush attempt
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
  }

  /**
   * Get the current buffer size (for testing).
   */
  get bufferSize(): number {
    return this.buffer.length;
  }

  // ── Private ────────────────────────────────────────────────────────────

  private startFlushInterval(): void {
    this.flushTimer = setInterval(() => {
      this.flush().catch(() => {});
    }, this.config.flushInterval);
  }

  private buildPayload(spans: MastraSpan[]): OTLPTracePayload {
    const otlpSpans: OTLPSpan[] = spans.map((s) => this.convertSpan(s));

    return {
      resourceSpans: [
        {
          resource: {
            attributes: [
              { key: "service.name", value: { stringValue: this.config.serviceName } },
              { key: "hiai.exporter.version", value: { stringValue: "0.1.0" } },
            ],
          },
          scopeSpans: [
            {
              scope: { name: "@hiai-gg/hiai-observe", version: "0.1.7" },
              spans: otlpSpans,
            },
          ],
        },
      ],
    };
  }

  private convertSpan(span: MastraSpan): OTLPSpan {
    const attributes = Object.entries(span.attributes ?? {}).map(([key, value]) => ({
      key,
      value: { stringValue: value },
    }));

    const events = (span.events ?? []).map((e) => ({
      timeUnixNano: e.timeUnixNano,
      name: e.name,
      attributes: Object.entries(e.attributes ?? {}).map(([key, value]) => ({
        key,
        value: { stringValue: value },
      })),
    }));

    return {
      traceId: span.traceId,
      spanId: span.spanId,
      parentSpanId: span.parentSpanId,
      name: span.name,
      kind: span.kind ?? "INTERNAL",
      startTimeUnixNano: span.startTimeUnixNano,
      endTimeUnixNano: span.endTimeUnixNano,
      attributes,
      status: span.status,
      events: events.length > 0 ? events : undefined,
    };
  }

  private async sendWithRetry(payload: OTLPTracePayload): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

        const response = await fetch(`${this.config.endpoint}/v1/traces`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) return;

        // Non-retryable errors
        if (response.status === 401 || response.status === 403) {
          throw new Error(`Authentication failed (${response.status}): ${await response.text()}`);
        }

        lastError = new Error(`HTTP ${response.status}: ${await response.text()}`);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        // Don't retry auth failures
        if (
          lastError.message.includes("Authentication failed") ||
          lastError.message.includes("401") ||
          lastError.message.includes("403")
        ) {
          throw lastError;
        }
      }

      // Exponential backoff: 1s, 2s, 4s
      if (attempt < this.config.maxRetries) {
        const delay = RETRY_BASE_DELAY * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError ?? new Error("Unknown error after retries");
  }
}
