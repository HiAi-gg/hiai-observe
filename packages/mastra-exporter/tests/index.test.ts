import { describe, it, expect, vi, beforeEach } from "vitest";
import { HiaiObserveExporter } from "../src/index.js";
import type { MastraSpan } from "../src/index.js";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch as typeof fetch;

function makeSpan(overrides: Partial<MastraSpan> = {}): MastraSpan {
  return {
    traceId: "abc123",
    spanId: "span1",
    name: "test-span",
    kind: "INTERNAL",
    startTimeUnixNano: "1000000000000",
    endTimeUnixNano: "2000000000000",
    attributes: { "mastra.workflow": "generate-article" },
    ...overrides,
  };
}

function waitFor(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("HiaiObserveExporter", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve("") });
  });

  it("buffers spans without flushing until batch size reached", () => {
    const exporter = new HiaiObserveExporter({
      endpoint: "http://localhost:8001",
      apiKey: "test-key",
      batchSize: 5,
      flushInterval: 60000,
    });

    exporter.export([makeSpan(), makeSpan(), makeSpan()]);
    expect(exporter.bufferSize).toBe(3);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("auto-flushes when batch size reached", async () => {
    const exporter = new HiaiObserveExporter({
      endpoint: "http://localhost:8001",
      apiKey: "test-key",
      batchSize: 3,
      flushInterval: 60000,
    });

    exporter.export([makeSpan(), makeSpan(), makeSpan()]);
    await waitFor(50);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(exporter.bufferSize).toBe(0);
  });

  it("flushes on interval", async () => {
    const exporter = new HiaiObserveExporter({
      endpoint: "http://localhost:8001",
      apiKey: "test-key",
      batchSize: 100,
      flushInterval: 50,
    });

    exporter.export([makeSpan()]);
    expect(mockFetch).not.toHaveBeenCalled();

    await waitFor(100);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("sends correct OTLP payload format", async () => {
    const exporter = new HiaiObserveExporter({
      endpoint: "http://localhost:8001",
      apiKey: "test-key",
      batchSize: 1,
      flushInterval: 60000,
    });

    exporter.export([makeSpan()]);
    await waitFor(50);

    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8001/v1/traces");
    expect(options.method).toBe("POST");
    expect((options.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
    expect((options.headers as Record<string, string>)["Content-Type"]).toBe("application/json");

    const body = JSON.parse(options.body as string);
    expect(body.resourceSpans).toBeDefined();
    expect(body.resourceSpans[0].scopeSpans[0].spans).toHaveLength(1);
  });

  it("does not retry on auth failure", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401, text: () => Promise.resolve("Unauthorized") });

    const exporter = new HiaiObserveExporter({
      endpoint: "http://localhost:8001",
      apiKey: "bad-key",
      batchSize: 1,
      flushInterval: 60000,
    });

    exporter.export([makeSpan()]);
    await waitFor(50);

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("shutdown flushes remaining spans", async () => {
    const exporter = new HiaiObserveExporter({
      endpoint: "http://localhost:8001",
      apiKey: "test-key",
      batchSize: 100,
      flushInterval: 60000,
    });

    exporter.export([makeSpan(), makeSpan()]);
    expect(exporter.bufferSize).toBe(2);

    await exporter.shutdown();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(exporter.bufferSize).toBe(0);
  });

  it("handles multiple spans with parent-child relationships", async () => {
    const exporter = new HiaiObserveExporter({
      endpoint: "http://localhost:8001",
      apiKey: "test-key",
      batchSize: 100,
      flushInterval: 60000,
    });

    exporter.export([
      makeSpan({ spanId: "parent", parentSpanId: undefined }),
      makeSpan({ spanId: "child1", parentSpanId: "parent" }),
      makeSpan({ spanId: "child2", parentSpanId: "parent" }),
    ]);

    await exporter.flush();

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    const spans = body.resourceSpans[0].scopeSpans[0].spans;
    expect(spans).toHaveLength(3);
    expect(spans[0].parentSpanId).toBeUndefined();
    expect(spans[1].parentSpanId).toBe("parent");
    expect(spans[2].parentSpanId).toBe("parent");
  });

  it("includes service.name in resource attributes", async () => {
    const exporter = new HiaiObserveExporter({
      endpoint: "http://localhost:8001",
      apiKey: "test-key",
      batchSize: 1,
      flushInterval: 60000,
    });

    exporter.export([makeSpan()]);
    await waitFor(50);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    const attrs = body.resourceSpans[0].resource.attributes;
    const svcAttr = attrs.find((a: { key: string }) => a.key === "service.name");
    expect(svcAttr).toBeDefined();
    expect(svcAttr.value.stringValue).toBe("mastra-app");
  });

  it("uses custom serviceName when provided", async () => {
    const exporter = new HiaiObserveExporter({
      endpoint: "http://localhost:8001",
      apiKey: "test-key",
      serviceName: "my-custom-app",
      batchSize: 1,
      flushInterval: 60000,
    });

    exporter.export([makeSpan()]);
    await waitFor(50);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    const attrs = body.resourceSpans[0].resource.attributes;
    const svcAttr = attrs.find((a: { key: string }) => a.key === "service.name");
    expect(svcAttr).toBeDefined();
    expect(svcAttr.value.stringValue).toBe("my-custom-app");
  });
});
