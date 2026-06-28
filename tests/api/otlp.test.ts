import protobuf from "protobufjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OTLP_PROTO_SCHEMA_JSON } from "../../src/ingestion/otlp-proto-schema.js";

const UUID = "550e8400-e29b-41d4-a716-446655440000";

// ── Mock traces store ─────────────────────────────────────────────────
vi.mock("../../src/store/traces.js", () => ({
  insertTraces: vi.fn().mockResolvedValue(undefined),
}));

// ── Mock logs store ───────────────────────────────────────────────────
vi.mock("../../src/store/logs.js", () => ({
  insertLogs: vi.fn().mockResolvedValue(undefined),
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
      projectId: UUID,
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
      projectId: UUID,
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
  parseOTLPLogs: vi.fn().mockReturnValue([
    {
      projectId: UUID,
      containerId: "otlp",
      containerName: "test-service",
      stream: "otel",
      message: "hello world",
      level: "info",
      timestamp: new Date(1700000000000),
      raw: { body: { stringValue: "hello world" }, severityText: "INFO" },
    },
  ]),
}));

// ── Capture mocked modules at top level ───────────────────────────────
const authModule = await import("../../src/lib/auth.js");
const tracesModule = await import("../../src/store/traces.js");
const logsModule = await import("../../src/store/logs.js");

// ── Import routes AFTER mocks ─────────────────────────────────────────
const { otlpRoutes } = await import("../../src/api/otlp.js");

// ── Helpers: build protobuf payloads with protobufjs ─────────────────
//
// We build valid OTLP trace/metric/log requests using the same schema bundle
// the decoder loads. This gives us real binary wire-format input — not
// synthetic bytes — so the decoder is exercised end-to-end.

const root = protobuf.Root.fromJSON(JSON.parse(OTLP_PROTO_SCHEMA_JSON));
const TracesData = root.lookupType("opentelemetry.proto.trace.v1.TracesData");
const MetricsData = root.lookupType("opentelemetry.proto.metrics.v1.MetricsData");
const LogsData = root.lookupType("opentelemetry.proto.logs.v1.LogsData");

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function encodeTraceRequest(plain: object): Uint8Array {
  const msg = TracesData.fromObject(plain);
  return TracesData.encode(msg).finish();
}

function encodeMetricsRequest(plain: object): Uint8Array {
  const msg = MetricsData.fromObject(plain);
  return MetricsData.encode(msg).finish();
}

function encodeLogsRequest(plain: object): Uint8Array {
  const msg = LogsData.fromObject(plain);
  return LogsData.encode(msg).finish();
}

// ── JSON fixtures (existing tests) ────────────────────────────────────

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

const validLogsPayload = {
  resourceLogs: [
    {
      resource: {
        attributes: [
          { key: "service.name", value: { stringValue: "test-service" } },
          { key: "service.instance.id", value: { stringValue: "instance-1" } },
        ],
      },
      scopeLogs: [
        {
          scope: { name: "test-scope", version: "1.0.0" },
          logRecords: [
            {
              timeUnixNano: "1700000000000000000",
              severityNumber: 9,
              severityText: "INFO",
              body: { stringValue: "hello world" },
              attributes: [{ key: "user", value: { stringValue: "alice" } }],
              traceId: "abc123def456abc123def456abc123de",
              spanId: "1234567890abcdef",
            },
          ],
        },
      ],
    },
  ],
};

// ── Protobuf fixtures ─────────────────────────────────────────────────
//
// protobufjs uses Long objects for uint64/int64 fields. We construct them
// via `protobuf.util.Long` to stay independent of `long` library.

const { util } = protobuf;
const Long = util.Long;

const longValue = (lo: number) => Long.fromNumber(lo, /*unsigned*/ true).toString();

const validTraceProto = encodeTraceRequest({
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
              traceId: hexToBytes("abc123def456abc123def456abc123de"),
              spanId: hexToBytes("1234567890abcdef"),
              name: "test-proto-span",
              kind: 2, // SPAN_KIND_SERVER
              startTimeUnixNano: Long.fromString("1000000000000000000", false),
              endTimeUnixNano: Long.fromString("1000000000100000000", false),
              attributes: [],
              status: { code: 1 /* STATUS_CODE_OK */ },
            },
          ],
        },
      ],
    },
  ],
});

const validMetricsProto = encodeMetricsRequest({
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
                    startTimeUnixNano: Long.fromString("1000000000000000000", false),
                    timeUnixNano: Long.fromString("1000000000100000000", false),
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
});

const validLogsProto = encodeLogsRequest({
  resourceLogs: [
    {
      resource: {
        attributes: [{ key: "service.name", value: { stringValue: "test-service" } }],
      },
      scopeLogs: [
        {
          scope: { name: "test-scope", version: "1.0.0" },
          logRecords: [
            {
              timeUnixNano: Long.fromString("1700000000000000000", false),
              severityNumber: 9, // INFO
              severityText: "INFO",
              body: { stringValue: "hello from protobuf" },
              attributes: [{ key: "env", value: { stringValue: "test" } }],
              traceId: hexToBytes("abc123def456abc123def456abc123de"),
              spanId: hexToBytes("1234567890abcdef"),
            },
          ],
        },
      ],
    },
  ],
});

// Suppress unused warnings for fixture helpers used only in some tests.
void longValue;

describe("OTLP trace endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Restore default behavior
    vi.mocked(authModule.resolveApiKey).mockReturnValue({ apiKey: "test-api-key" });
    vi.mocked(authModule.lookupProject).mockResolvedValue({ projectId: UUID });
  });

  it("valid JSON trace payload returns 200", async () => {
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

  it("valid JSON metrics payload returns 200", async () => {
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

  it("valid JSON trace inserts traces via store", async () => {
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

  it("valid JSON metrics inserts traces via store", async () => {
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

// ── OTLP protobuf (application/x-protobuf) ────────────────────────────

describe("OTLP protobuf trace endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authModule.resolveApiKey).mockReturnValue({ apiKey: "test-api-key" });
    vi.mocked(authModule.lookupProject).mockResolvedValue({ projectId: UUID });
  });

  it("application/x-protobuf trace returns 200", async () => {
    const res = await otlpRoutes.handle(
      new Request("http://localhost/v1/traces", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-protobuf",
          Authorization: "Bearer test-api-key",
        },
        body: validTraceProto,
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({});
  });

  it("application/x-protobuf trace calls insertTraces once with parsed rows", async () => {
    await otlpRoutes.handle(
      new Request("http://localhost/v1/traces", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-protobuf",
          Authorization: "Bearer test-api-key",
        },
        body: validTraceProto,
      }),
    );

    expect(tracesModule.insertTraces).toHaveBeenCalledTimes(1);
    const calledWith = vi.mocked(tracesModule.insertTraces).mock.calls[0][0];
    expect(calledWith).toHaveLength(1);
    expect(calledWith[0].traceId).toBe("trace-001");
  });

  it("application/protobuf (alias) trace returns 200", async () => {
    const res = await otlpRoutes.handle(
      new Request("http://localhost/v1/traces", {
        method: "POST",
        headers: {
          "Content-Type": "application/protobuf",
          Authorization: "Bearer test-api-key",
        },
        body: validTraceProto,
      }),
    );

    expect(res.status).toBe(200);
  });

  it("application/json+protobuf trace returns 200", async () => {
    // OTLP media-range suffix variant — some SDKs send this for binary.
    const res = await otlpRoutes.handle(
      new Request("http://localhost/v1/traces", {
        method: "POST",
        headers: {
          "Content-Type": "application/json+protobuf",
          Authorization: "Bearer test-api-key",
        },
        body: validTraceProto,
      }),
    );

    expect(res.status).toBe(200);
  });

  it("invalid protobuf bytes return 400", async () => {
    const garbage = new Uint8Array([0xff, 0xff, 0xff, 0xff, 0x00, 0x12, 0x34]);
    const res = await otlpRoutes.handle(
      new Request("http://localhost/v1/traces", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-protobuf",
          Authorization: "Bearer test-api-key",
        },
        body: garbage,
      }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid OTLP trace payload");
  });

  it("empty protobuf body returns 400", async () => {
    const res = await otlpRoutes.handle(
      new Request("http://localhost/v1/traces", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-protobuf",
          Authorization: "Bearer test-api-key",
        },
        body: new Uint8Array(0),
      }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid OTLP trace payload");
  });

  it("protobuf trace without auth returns 401", async () => {
    vi.mocked(authModule.resolveApiKey).mockReturnValue(null);

    const res = await otlpRoutes.handle(
      new Request("http://localhost/v1/traces", {
        method: "POST",
        headers: { "Content-Type": "application/x-protobuf" },
        body: validTraceProto,
      }),
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Missing API key");
  });

  it("protobuf trace with x-api-key header works", async () => {
    vi.mocked(authModule.resolveApiKey).mockReturnValue(null);

    const res = await otlpRoutes.handle(
      new Request("http://localhost/v1/traces", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-protobuf",
          "x-api-key": "test-api-key",
        },
        body: validTraceProto,
      }),
    );

    expect(res.status).toBe(200);
  });
});

describe("OTLP protobuf metrics endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authModule.resolveApiKey).mockReturnValue({ apiKey: "test-api-key" });
    vi.mocked(authModule.lookupProject).mockResolvedValue({ projectId: UUID });
  });

  it("application/x-protobuf metrics returns 200", async () => {
    const res = await otlpRoutes.handle(
      new Request("http://localhost/v1/metrics", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-protobuf",
          Authorization: "Bearer test-api-key",
        },
        body: validMetricsProto,
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({});
  });

  it("application/x-protobuf metrics calls insertTraces", async () => {
    await otlpRoutes.handle(
      new Request("http://localhost/v1/metrics", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-protobuf",
          Authorization: "Bearer test-api-key",
        },
        body: validMetricsProto,
      }),
    );

    expect(tracesModule.insertTraces).toHaveBeenCalledTimes(1);
    const calledWith = vi.mocked(tracesModule.insertTraces).mock.calls[0][0];
    expect(calledWith).toHaveLength(1);
    expect(calledWith[0].name).toBe("system.cpu.utilization");
  });

  it("invalid protobuf metrics bytes return 400", async () => {
    const garbage = new Uint8Array([0xff, 0xee, 0xdd, 0xcc, 0xbb, 0xaa]);
    const res = await otlpRoutes.handle(
      new Request("http://localhost/v1/metrics", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-protobuf",
          Authorization: "Bearer test-api-key",
        },
        body: garbage,
      }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid OTLP metric payload");
  });
});

// ── OTLP JSON logs endpoint ──────────────────────────────────────────

describe("OTLP logs endpoint (JSON)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authModule.resolveApiKey).mockReturnValue({ apiKey: "test-api-key" });
    vi.mocked(authModule.lookupProject).mockResolvedValue({ projectId: UUID });
  });

  it("valid JSON logs payload returns 200", async () => {
    const res = await otlpRoutes.handle(
      new Request("http://localhost/v1/logs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-api-key",
        },
        body: JSON.stringify(validLogsPayload),
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({});
  });

  it("valid JSON logs calls insertLogs once with parsed rows", async () => {
    await otlpRoutes.handle(
      new Request("http://localhost/v1/logs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-api-key",
        },
        body: JSON.stringify(validLogsPayload),
      }),
    );

    expect(logsModule.insertLogs).toHaveBeenCalledTimes(1);
    const calledWith = vi.mocked(logsModule.insertLogs).mock.calls[0][0];
    expect(calledWith).toHaveLength(1);
    expect(calledWith[0].message).toBe("hello world");
    expect(calledWith[0].stream).toBe("otel");
    expect(calledWith[0].level).toBe("info");
    expect(calledWith[0].containerName).toBe("test-service");
  });

  it("x-api-key header works for logs auth", async () => {
    vi.mocked(authModule.resolveApiKey).mockReturnValue(null);

    const res = await otlpRoutes.handle(
      new Request("http://localhost/v1/logs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": "test-api-key",
        },
        body: JSON.stringify(validLogsPayload),
      }),
    );

    expect(res.status).toBe(200);
  });

  it("missing logs auth returns 401", async () => {
    vi.mocked(authModule.resolveApiKey).mockReturnValue(null);

    const res = await otlpRoutes.handle(
      new Request("http://localhost/v1/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validLogsPayload),
      }),
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Missing API key");
  });

  it("invalid logs auth returns 403", async () => {
    vi.mocked(authModule.resolveApiKey).mockReturnValue({ apiKey: "bad-key" });
    vi.mocked(authModule.lookupProject).mockResolvedValue(null);

    const res = await otlpRoutes.handle(
      new Request("http://localhost/v1/logs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer bad-key",
        },
        body: JSON.stringify(validLogsPayload),
      }),
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Invalid API key");
  });

  it("logs body too large returns 413", async () => {
    const largePayload = {
      resourceLogs: [{ data: "x".repeat(6 * 1024 * 1024) }],
    };

    const res = await otlpRoutes.handle(
      new Request("http://localhost/v1/logs", {
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

  it("empty resourceLogs returns 400", async () => {
    const res = await otlpRoutes.handle(
      new Request("http://localhost/v1/logs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-api-key",
        },
        body: JSON.stringify({ resourceLogs: [] }),
      }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid OTLP logs payload");
  });

  it("malformed JSON logs body returns 400", async () => {
    const res = await otlpRoutes.handle(
      new Request("http://localhost/v1/logs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-api-key",
        },
        body: "not-json{{{",
      }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid JSON");
  });

  it("missing resourceLogs returns 400", async () => {
    const res = await otlpRoutes.handle(
      new Request("http://localhost/v1/logs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-api-key",
        },
        body: JSON.stringify({ unrelated: "shape" }),
      }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid OTLP logs payload");
  });
});

// ── OTLP protobuf logs endpoint ──────────────────────────────────────

describe("OTLP logs endpoint (protobuf)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authModule.resolveApiKey).mockReturnValue({ apiKey: "test-api-key" });
    vi.mocked(authModule.lookupProject).mockResolvedValue({ projectId: UUID });
  });

  it("application/x-protobuf logs returns 200", async () => {
    const res = await otlpRoutes.handle(
      new Request("http://localhost/v1/logs", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-protobuf",
          Authorization: "Bearer test-api-key",
        },
        body: validLogsProto,
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({});
  });

  it("application/x-protobuf logs calls insertLogs", async () => {
    await otlpRoutes.handle(
      new Request("http://localhost/v1/logs", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-protobuf",
          Authorization: "Bearer test-api-key",
        },
        body: validLogsProto,
      }),
    );

    expect(logsModule.insertLogs).toHaveBeenCalledTimes(1);
    const calledWith = vi.mocked(logsModule.insertLogs).mock.calls[0][0];
    expect(calledWith).toHaveLength(1);
    expect(calledWith[0].message).toBe("hello world");
  });

  it("application/protobuf (alias) logs returns 200", async () => {
    const res = await otlpRoutes.handle(
      new Request("http://localhost/v1/logs", {
        method: "POST",
        headers: {
          "Content-Type": "application/protobuf",
          Authorization: "Bearer test-api-key",
        },
        body: validLogsProto,
      }),
    );

    expect(res.status).toBe(200);
  });

  it("application/json+protobuf logs returns 200", async () => {
    const res = await otlpRoutes.handle(
      new Request("http://localhost/v1/logs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json+protobuf",
          Authorization: "Bearer test-api-key",
        },
        body: validLogsProto,
      }),
    );

    expect(res.status).toBe(200);
  });

  it("invalid protobuf logs bytes return 400", async () => {
    const garbage = new Uint8Array([0xff, 0xee, 0xdd, 0xcc, 0xbb, 0xaa, 0x99, 0x88]);
    const res = await otlpRoutes.handle(
      new Request("http://localhost/v1/logs", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-protobuf",
          Authorization: "Bearer test-api-key",
        },
        body: garbage,
      }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid OTLP logs payload");
  });

  it("empty protobuf logs body returns 400", async () => {
    const res = await otlpRoutes.handle(
      new Request("http://localhost/v1/logs", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-protobuf",
          Authorization: "Bearer test-api-key",
        },
        body: new Uint8Array(0),
      }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid OTLP logs payload");
  });

  it("protobuf logs without auth returns 401", async () => {
    vi.mocked(authModule.resolveApiKey).mockReturnValue(null);

    const res = await otlpRoutes.handle(
      new Request("http://localhost/v1/logs", {
        method: "POST",
        headers: { "Content-Type": "application/x-protobuf" },
        body: validLogsProto,
      }),
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Missing API key");
  });
});

// ── Content-Type detection unit tests ────────────────────────────────

describe("isProtobufContentType", () => {
  it("matches application/x-protobuf", async () => {
    const { isProtobufContentType } = await import("../../src/ingestion/otlp-proto.js");
    expect(isProtobufContentType("application/x-protobuf")).toBe(true);
  });

  it("matches application/x-protobuf with charset", async () => {
    const { isProtobufContentType } = await import("../../src/ingestion/otlp-proto.js");
    expect(isProtobufContentType("application/x-protobuf; charset=utf-8")).toBe(true);
  });

  it("matches application/protobuf alias", async () => {
    const { isProtobufContentType } = await import("../../src/ingestion/otlp-proto.js");
    expect(isProtobufContentType("application/protobuf")).toBe(true);
  });

  it("matches +protobuf suffix", async () => {
    const { isProtobufContentType } = await import("../../src/ingestion/otlp-proto.js");
    expect(isProtobufContentType("application/json+protobuf")).toBe(true);
  });

  it("rejects application/json", async () => {
    const { isProtobufContentType } = await import("../../src/ingestion/otlp-proto.js");
    expect(isProtobufContentType("application/json")).toBe(false);
  });

  it("rejects application/octet-stream", async () => {
    const { isProtobufContentType } = await import("../../src/ingestion/otlp-proto.js");
    expect(isProtobufContentType("application/octet-stream")).toBe(false);
  });

  it("rejects undefined / empty", async () => {
    const { isProtobufContentType } = await import("../../src/ingestion/otlp-proto.js");
    expect(isProtobufContentType(undefined)).toBe(false);
    expect(isProtobufContentType("")).toBe(false);
  });
});
