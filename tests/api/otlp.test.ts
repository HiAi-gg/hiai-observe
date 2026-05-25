import { describe, it, expect, vi, beforeEach } from "vitest";

const UUID = "550e8400-e29b-41d4-a716-446655440000";

// ── Mock traces store ─────────────────────────────────────────────────
vi.mock("../../src/store/traces.js", () => ({
  insertTraces: vi.fn().mockResolvedValue(undefined),
}));

// ── Mock auth ─────────────────────────────────────────────────────────
vi.mock("../../src/lib/auth.js", () => ({
  resolveApiKey: vi.fn().mockReturnValue({ apiKey: "test-api-key" }),
  lookupProject: vi.fn().mockResolvedValue({ projectId: "550e8400-e29b-41d4-a716-446655440000" }),
}));

// ── Mock OTLP parser ─────────────────────────────────────────────────
vi.mock("../../src/ingestion/otlp-parser.js", () => ({
  parseOTLPTraces: vi.fn().mockReturnValue([
    {
      projectId: "550e8400-e29b-41d4-a716-446655440000",
      traceId: "trace-001",
      spanId: "span-001",
      parentSpanId: null,
      name: "test-span",
      kind: "SERVER",
      startTimeUnixNano: "1000000000000000000",
      endTimeUnixNano: "1000000000100000000",
      attributes: {},
      status: "ok",
      statusMessage: null,
      events: [],
    },
  ]),
  parseOTLPMetrics: vi.fn().mockReturnValue([
    {
      projectId: "550e8400-e29b-41d4-a716-446655440000",
      traceId: "metric-cpu",
      spanId: "metric-cpu",
      parentSpanId: null,
      name: "system.cpu.utilization",
      kind: "METRIC",
      startTimeUnixNano: "1000000000000000000",
      endTimeUnixNano: "1000000000100000000",
      attributes: { metric_name: "system.cpu.utilization", metric_value: "0.75" },
      status: null,
      statusMessage: null,
      events: [],
    },
  ]),
}));

// ── Capture mocked modules at top level ───────────────────────────────
const authModule = await import("../../src/lib/auth.js");
const tracesModule = await import("../../src/store/traces.js");

// ── Import routes AFTER mocks ─────────────────────────────────────────
const { otlpRoutes } = await import("../../src/api/otlp.js");

const validTracePayload = {
  resourceSpans: [
    {
      resource: {
        attributes: [{ key: "service.name", value: { stringValue: "test-service" } }],
      },
      scopeSpans: [
        {
          scope: { name: "test-scope", version: "1.0.0" },
          spans: [
            {
              traceId: "abc123def456",
              spanId: "span123",
              name: "test-span",
              kind: "SERVER",
              startTimeUnixNano: "1000000000000000000",
              endTimeUnixNano: "1000000000100000000",
              attributes: [],
              status: { code: "STATUS_CODE_OK" },
            },
          ],
        },
      ],
    },
  ],
};

const validMetricsPayload = {
  resourceMetrics: [
    {
      resource: {
        attributes: [{ key: "service.name", value: { stringValue: "test-service" } }],
      },
      scopeMetrics: [
        {
          metrics: [
            {
              name: "system.cpu.utilization",
              description: "CPU utilization",
              unit: "percent",
              gauge: {
                dataPoints: [
                  {
                    startTimeUnixNano: "1000000000000000000",
                    timeUnixNano: "1000000000100000000",
                    asDouble: 0.75,
                  },
                ],
              },
            },
          ],
        },
      ],
    },
  ],
};

describe("OTLP trace endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Restore default behavior
    vi.mocked(authModule.resolveApiKey).mockReturnValue({ apiKey: "test-api-key" });
    vi.mocked(authModule.lookupProject).mockResolvedValue({ projectId: UUID });
  });

  it("valid trace payload returns 200", async () => {
    const res = await otlpRoutes.handle(
      new Request("http://localhost/v1/traces", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-api-key",
        },
        body: JSON.stringify(validTracePayload),
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({});
  });

  it("valid metrics payload returns 200", async () => {
    const res = await otlpRoutes.handle(
      new Request("http://localhost/v1/metrics", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-api-key",
        },
        body: JSON.stringify(validMetricsPayload),
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({});
  });

  it("missing auth returns 401", async () => {
    vi.mocked(authModule.resolveApiKey).mockReturnValue(null);

    const res = await otlpRoutes.handle(
      new Request("http://localhost/v1/traces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validTracePayload),
      }),
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Missing API key");
  });

  it("x-api-key header works for auth", async () => {
    vi.mocked(authModule.resolveApiKey).mockReturnValue(null);

    const res = await otlpRoutes.handle(
      new Request("http://localhost/v1/traces", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": "test-api-key",
        },
        body: JSON.stringify(validTracePayload),
      }),
    );

    expect(res.status).toBe(200);
  });

  it("invalid auth returns 403", async () => {
    vi.mocked(authModule.resolveApiKey).mockReturnValue({ apiKey: "invalid-key" });
    vi.mocked(authModule.lookupProject).mockResolvedValue(null);

    const res = await otlpRoutes.handle(
      new Request("http://localhost/v1/traces", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer invalid-key",
        },
        body: JSON.stringify(validTracePayload),
      }),
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Invalid API key");
  });

  it("body too large returns 413", async () => {
    const largePayload = {
      resourceSpans: [{ data: "x".repeat(6 * 1024 * 1024) }],
    };

    const res = await otlpRoutes.handle(
      new Request("http://localhost/v1/traces", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-api-key",
        },
        body: JSON.stringify(largePayload),
      }),
    );

    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error).toBe("Payload too large");
  });

  it("empty resourceSpans returns 400", async () => {
    const res = await otlpRoutes.handle(
      new Request("http://localhost/v1/traces", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-api-key",
        },
        body: JSON.stringify({ resourceSpans: [] }),
      }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid OTLP trace payload");
  });

  it("valid trace inserts traces via store", async () => {
    await otlpRoutes.handle(
      new Request("http://localhost/v1/traces", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-api-key",
        },
        body: JSON.stringify(validTracePayload),
      }),
    );

    expect(tracesModule.insertTraces).toHaveBeenCalledTimes(1);
    const calledWith = vi.mocked(tracesModule.insertTraces).mock.calls[0][0];
    expect(calledWith).toHaveLength(1);
    expect(calledWith[0].traceId).toBe("trace-001");
  });

  it("valid metrics inserts traces via store", async () => {
    await otlpRoutes.handle(
      new Request("http://localhost/v1/metrics", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-api-key",
        },
        body: JSON.stringify(validMetricsPayload),
      }),
    );

    expect(tracesModule.insertTraces).toHaveBeenCalledTimes(1);
  });
});
