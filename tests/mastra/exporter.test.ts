import type { AnyExportedSpan, TracingEvent } from "@mastra/core/observability";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// Single source of truth for the expected exporter version (avoid hardcoding).
import pkg from "../../packages/hiai-observe/package.json" with { type: "json" };
// Import from the package source so the test exercises real code, not stale dist.
import { HiaiObserveExporter } from "../../packages/hiai-observe/src/mastra/index.js";

const EXPECTED_VERSION: string = pkg.version;

/** Build a minimal but realistic Mastra ExportedSpan. */
function makeSpan(overrides: Partial<AnyExportedSpan> = {}): AnyExportedSpan {
  return {
    id: "span-1",
    traceId: "0123456789abcdef0123456789abcdef",
    name: "AGENT_RUN",
    type: "AGENT_RUN" as AnyExportedSpan["type"],
    isRootSpan: true,
    isEvent: false,
    startTime: new Date("2026-01-01T00:00:00.000Z"),
    endTime: new Date("2026-01-01T00:00:01.000Z"),
    attributes: { model: "gpt-4o" } as AnyExportedSpan["attributes"],
    metadata: { userId: "u-42" },
    ...overrides,
  } as AnyExportedSpan;
}

/** Wrap a span in a SPAN_ENDED TracingEvent. */
function endedEvent(span: AnyExportedSpan): TracingEvent {
  return { type: "span_ended" as TracingEvent["type"], exportedSpan: span } as TracingEvent;
}

function startedEvent(span: AnyExportedSpan): TracingEvent {
  return { type: "span_started" as TracingEvent["type"], exportedSpan: span } as TracingEvent;
}

/** Install a fetch mock returning the given status; capture the last body. */
function mockFetch(status = 200) {
  const calls: { url: string; body: unknown }[] = [];
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, body: init.body ? JSON.parse(init.body as string) : null });
    return { ok: status >= 200 && status < 300, status } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, calls };
}

describe("HiaiObserveExporter", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("is a BaseExporter (satisfies Mastra's ObservabilityExporter contract)", () => {
    const exporter = new HiaiObserveExporter({
      endpoint: "http://localhost:8001",
      apiKey: "ho_test",
    });
    expect(exporter.name).toBe("hiai-observe");
    expect(typeof exporter.exportTracingEvent).toBe("function");
    expect(typeof exporter.onTracingEvent).toBe("function");
    expect(typeof exporter.flush).toBe("function");
    expect(typeof exporter.shutdown).toBe("function");
  });

  it("ignores SPAN_STARTED and only buffers on SPAN_ENDED", async () => {
    const exporter = new HiaiObserveExporter({
      endpoint: "http://localhost:8001",
      apiKey: "ho_test",
      flushInterval: 60_000,
    });
    await exporter.exportTracingEvent(startedEvent(makeSpan()));
    expect(exporter.bufferSize).toBe(0);

    await exporter.exportTracingEvent(endedEvent(makeSpan()));
    expect(exporter.bufferSize).toBe(1);
  });

  it("converts spans to OTLP (Date -> nanos, id -> spanId, typed attributes)", async () => {
    const { calls } = mockFetch();
    const exporter = new HiaiObserveExporter({
      endpoint: "http://localhost:8001/",
      apiKey: "ho_test",
      batchSize: 1, // flush immediately after the first span
    });

    await exporter.exportTracingEvent(
      endedEvent(
        makeSpan({
          id: "span-1",
          parentSpanId: "parent-0",
          name: "MODEL_GENERATION",
          attributes: {
            model: "gpt-4o",
            tokens: 42,
            ratio: 1.5,
            ok: true,
          } as unknown as AnyExportedSpan["attributes"],
          startTime: new Date(0),
          endTime: new Date(1),
        }),
      ),
    );
    // flush is fired async; await a microtask cycle
    await new Promise((r) => setTimeout(r, 10));

    expect(calls.length).toBe(1);
    expect(calls[0]?.url).toBe("http://localhost:8001/v1/traces");

    const span = calls[0]?.body.resourceSpans[0].scopeSpans[0].spans[0];
    expect(span).toMatchObject({
      traceId: "0123456789abcdef0123456789abcdef",
      spanId: "span-1",
      parentSpanId: "parent-0",
      name: "MODEL_GENERATION",
      kind: "INTERNAL",
    });
    // new Date(0) -> 0 ns, new Date(1) -> 1_000_000 ns
    expect(span.startTimeUnixNano).toBe("0");
    expect(span.endTimeUnixNano).toBe("1000000");

    // Attribute value-type discrimination: int / double / bool / string.
    const attr = (k: string) => span.attributes.find((a: { key: string }) => a.key === k)?.value;
    expect(attr("attr.model")).toEqual({ stringValue: "gpt-4o" });
    expect(attr("attr.tokens")).toEqual({ intValue: "42" });
    expect(attr("attr.ratio")).toEqual({ doubleValue: 1.5 });
    expect(attr("attr.ok")).toEqual({ boolValue: true });

    // Resource/scope version follows the package version, not a stale 0.1.x.
    const resVer = calls[0]?.body.resourceSpans[0].resource.attributes.find(
      (a: { key: string }) => a.key === "hiai.exporter.version",
    );
    expect(resVer?.value.stringValue).toBe(EXPECTED_VERSION);
  });

  it("maps errorInfo to an ERROR status and surfaces message attributes", async () => {
    const { calls } = mockFetch();
    const exporter = new HiaiObserveExporter({
      endpoint: "http://localhost:8001",
      apiKey: "ho_test",
      batchSize: 1,
    });

    await exporter.exportTracingEvent(
      endedEvent(
        makeSpan({
          errorInfo: { message: "boom", name: "TypeError" } as AnyExportedSpan["errorInfo"],
        }),
      ),
    );
    await new Promise((r) => setTimeout(r, 10));

    const span = calls[0]?.body.resourceSpans[0].scopeSpans[0].spans[0];
    expect(span.status).toEqual({ code: "ERROR", message: "boom" });
    expect(span.attributes.find((a: { key: string }) => a.key === "error.name")?.value).toEqual({
      stringValue: "TypeError",
    });
  });

  it("does not retry on 401 and drops the batch", async () => {
    const fetchMock = vi.fn(
      async () =>
        ({ ok: false, status: 401, text: async () => "unauthorized" }) as unknown as Response,
    );
    vi.stubGlobal("fetch", fetchMock);

    const exporter = new HiaiObserveExporter({
      endpoint: "http://localhost:8001",
      apiKey: "ho_test",
      batchSize: 1,
      maxRetries: 3,
    });
    // Silence the expected console.error from the failed flush.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    await exporter.exportTracingEvent(endedEvent(makeSpan()));
    await new Promise((r) => setTimeout(r, 10));

    // Auth failures short-circuit: exactly one attempt, no backoff retries.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("flush() drains the buffer; shutdown() stops the timer and flushes", async () => {
    const { calls } = mockFetch();
    const exporter = new HiaiObserveExporter({
      endpoint: "http://localhost:8001",
      apiKey: "ho_test",
      flushInterval: 60_000,
    });

    await exporter.exportTracingEvent(endedEvent(makeSpan()));
    await exporter.exportTracingEvent(endedEvent(makeSpan({ id: "span-2" })));
    expect(exporter.bufferSize).toBe(2);

    await exporter.flush();
    expect(exporter.bufferSize).toBe(0);
    expect(calls.length).toBe(1);
    expect(calls[0]?.body.resourceSpans[0].scopeSpans[0].spans).toHaveLength(2);

    // After shutdown, a new event is never flushed (timer cleared; buffer not flushed).
    await exporter.shutdown();
    await exporter.exportTracingEvent(endedEvent(makeSpan({ id: "span-3" })));
    expect(calls.length).toBe(1); // no new flush
  });
});
