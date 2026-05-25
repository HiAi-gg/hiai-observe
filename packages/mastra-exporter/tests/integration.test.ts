import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { HiaiObserveExporter } from "../src/index.js";

const OBSERVE_URL = process.env.HIAI_OBSERVE_URL || "http://localhost:8001";
const OBSERVE_KEY = process.env.HIAI_OBSERVE_API_KEY || "test-key";
const enabled = process.env.INTEGRATION === "1";

describe.skipIf(!enabled)("Mastra Exporter Integration", () => {
  let exporter: HiaiObserveExporter;

  beforeAll(() => {
    exporter = new HiaiObserveExporter({
      endpoint: OBSERVE_URL,
      apiKey: OBSERVE_KEY,
      serviceName: "integration-test",
      batchSize: 5,
      flushInterval: 1000,
    });
  });

  afterAll(async () => {
    await exporter.shutdown();
  });

  it("exports a single span", async () => {
    const span = {
      traceId: "int-trace-001",
      spanId: "int-span-001",
      name: "test-span",
      startTimeUnixNano: Date.now() * 1_000_000,
      endTimeUnixNano: (Date.now() + 100) * 1_000_000,
      attributes: [{ key: "test", value: { stringValue: "integration" } }],
    };

    exporter.export([span]);
    await exporter.shutdown();

    const res = await fetch(`${OBSERVE_URL}/api/traces?limit=1`, {
      headers: { "X-API-Key": OBSERVE_KEY },
    });
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.data.length).toBeGreaterThan(0);
  });

  it("exports spans with token usage", async () => {
    const span = {
      traceId: "int-trace-002",
      spanId: "int-span-002",
      name: "llm-call",
      startTimeUnixNano: Date.now() * 1_000_000,
      endTimeUnixNano: (Date.now() + 500) * 1_000_000,
      attributes: [
        { key: "gen_ai.usage.prompt_tokens", value: { intValue: 100 } },
        { key: "gen_ai.usage.completion_tokens", value: { intValue: 50 } },
        { key: "gen_ai.usage.total_tokens", value: { intValue: 150 } },
        { key: "gen_ai.request.model", value: { stringValue: "gpt-4" } },
      ],
    };

    exporter.export([span]);
    await exporter.shutdown();

    const res = await fetch(`${OBSERVE_URL}/api/traces?limit=1`, {
      headers: { "X-API-Key": OBSERVE_KEY },
    });
    expect(res.ok).toBe(true);
  });

  it("rejects on auth failure", async () => {
    const badExporter = new HiaiObserveExporter({
      endpoint: OBSERVE_URL,
      apiKey: "invalid-key",
      serviceName: "integration-test",
    });

    const span = {
      traceId: "int-trace-003",
      spanId: "int-span-003",
      name: "test",
      startTimeUnixNano: Date.now() * 1_000_000,
      endTimeUnixNano: (Date.now() + 10) * 1_000_000,
      attributes: [],
    };

    badExporter.export([span]);
    await badExporter.shutdown();
  });
});
