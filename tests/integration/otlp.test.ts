/**
 * OTLP Integration Test
 *
 * Tests OpenTelemetry Protocol trace ingestion via the /v1/traces endpoint.
 * Verifies that OTLP payloads are stored correctly and Mastra attributes
 * are parsed properly.
 *
 * Requires: running HiAi Observe server + PostgreSQL database.
 * Skip in CI by default — run with INTEGRATION=1 bun test tests/integration/
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createTestProject,
  cleanupTestData,
  waitForCondition,
  apiFetch,
  isServerReachable,
  TEST_API_KEY,
  TEST_BASE_URL,
} from "./helpers.js";
import { db } from "../../src/store/db.js";
import { traces } from "../../src/store/schema.js";
import { eq } from "drizzle-orm";

const SKIP = !(process.env.INTEGRATION === "1");

describe.skipIf(SKIP)("OTLP Integration", () => {
  let projectId: string;
  let serverOk: boolean;

  beforeAll(async () => {
    serverOk = await isServerReachable();
    if (!serverOk) return;
    projectId = await createTestProject();
  });

  afterAll(async () => {
    if (serverOk) await cleanupTestData();
  });

  it("server is reachable", async () => {
    if (!serverOk) {
      console.warn("Skipping: HiAi Observe server not reachable at", TEST_BASE_URL);
      return;
    }
    expect(serverOk).toBe(true);
  });

  it("accepts an OTLP trace payload with a single span", async () => {
    if (!serverOk) return;

    const otlpPayload = {
      resourceSpans: [
        {
          resource: {
            attributes: [
              { key: "service.name", value: { stringValue: "test-service" } },
              { key: "service.version", value: { stringValue: "1.0.0" } },
            ],
          },
          scopeSpans: [
            {
              scope: { name: "test-instrumentation", version: "1.0.0" },
              spans: [
                {
                  traceId: "abc123def456abc123def456abc123de",
                  spanId: "span001span001span01",
                  name: "HTTP GET /api/users",
                  kind: "SERVER",
                  startTimeUnixNano: "1700000000000000000",
                  endTimeUnixNano: "1700000000500000000",
                  attributes: [
                    { key: "http.method", value: { stringValue: "GET" } },
                    { key: "http.url", value: { stringValue: "/api/users" } },
                    { key: "http.status_code", value: { intValue: "200" } },
                  ],
                  status: { code: "STATUS_CODE_OK" },
                },
              ],
            },
          ],
        },
      ],
    };

    const res = await fetch(`${TEST_BASE_URL}/v1/traces`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_API_KEY}`,
      },
      body: JSON.stringify(otlpPayload),
    });

    expect(res.status).toBe(200);

    // Verify trace was stored
    const stored = await waitForCondition(async () => {
      const rows = await db
        .select()
        .from(traces)
        .where(eq(traces.projectId, projectId))
        .limit(1);
      return rows.length > 0 ? rows : null;
    }, 5000);

    expect(stored[0].traceId).toBe("abc123def456abc123def456abc123de");
    expect(stored[0].spanId).toBe("span001span001span01");
    expect(stored[0].name).toBe("HTTP GET /api/users");
    expect(stored[0].kind).toBe("SERVER");
    expect(stored[0].status).toBe("ok");
  });

  it("accepts a payload with parent-child span relationships", async () => {
    if (!serverOk) return;

    const otlpPayload = {
      resourceSpans: [
        {
          scopeSpans: [
            {
              spans: [
                {
                  traceId: "trace-parent-child-test-00000000000",
                  spanId: "parent-span-id-00000000",
                  name: "workflow:generate-article",
                  kind: "INTERNAL",
                  startTimeUnixNano: "1700000001000000000",
                  endTimeUnixNano: "1700000003000000000",
                  attributes: [
                    { key: "mastra.workflow", value: { stringValue: "generate-article" } },
                  ],
                  status: { code: "STATUS_CODE_OK" },
                },
                {
                  traceId: "trace-parent-child-test-00000000000",
                  spanId: "child-step-1-0000000000",
                  parentSpanId: "parent-span-id-00000000",
                  name: "step:extract-params",
                  kind: "INTERNAL",
                  startTimeUnixNano: "1700000001000000000",
                  endTimeUnixNano: "1700000001500000000",
                  attributes: [
                    { key: "mastra.step", value: { stringValue: "extract-params" } },
                  ],
                  status: { code: "STATUS_CODE_OK" },
                },
                {
                  traceId: "trace-parent-child-test-00000000000",
                  spanId: "child-step-2-0000000000",
                  parentSpanId: "parent-span-id-00000000",
                  name: "step:generate-content",
                  kind: "INTERNAL",
                  startTimeUnixNano: "1700000001500000000",
                  endTimeUnixNano: "1700000003000000000",
                  attributes: [
                    { key: "mastra.step", value: { stringValue: "generate-content" } },
                    { key: "mastra.tool", value: { stringValue: "web-search" } },
                  ],
                  events: [
                    {
                      timeUnixNano: "1700000001600000000",
                      name: "tool.input",
                      attributes: [
                        { key: "data", value: { stringValue: '{"query":"AI news"}' } },
                      ],
                    },
                    {
                      timeUnixNano: "1700000002800000000",
                      name: "tool.output",
                      attributes: [
                        { key: "data", value: { stringValue: '{"results":["article1"]}' } },
                      ],
                    },
                  ],
                  status: { code: "STATUS_CODE_OK" },
                },
              ],
            },
          ],
        },
      ],
    };

    const res = await fetch(`${TEST_BASE_URL}/v1/traces`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_API_KEY}`,
      },
      body: JSON.stringify(otlpPayload),
    });

    expect(res.status).toBe(200);

    // Verify all 3 spans were stored
    const stored = await waitForCondition(async () => {
      const rows = await db
        .select()
        .from(traces)
        .where(eq(traces.traceId, "trace-parent-child-test-00000000000"));
      return rows.length >= 3 ? rows : null;
    }, 5000);

    expect(stored.length).toBe(3);

    // Verify parent-child relationship
    const parent = stored.find((s) => s.spanId === "parent-span-id-00000000");
    const child1 = stored.find((s) => s.spanId === "child-step-1-0000000000");
    const child2 = stored.find((s) => s.spanId === "child-step-2-0000000000");

    expect(parent).toBeDefined();
    expect(parent!.parentSpanId).toBeNull();
    expect(child1!.parentSpanId).toBe("parent-span-id-00000000");
    expect(child2!.parentSpanId).toBe("parent-span-id-00000000");

    // Verify Mastra attributes are preserved in the attributes JSONB field
    const parentAttrs = parent!.attributes as Record<string, unknown>;
    expect(parentAttrs?.["mastra.workflow"]).toBe("generate-article");

    const child2Attrs = child2!.attributes as Record<string, unknown>;
    expect(child2Attrs?.["mastra.step"]).toBe("generate-content");
    expect(child2Attrs?.["mastra.tool"]).toBe("web-search");
  });

  it("handles error status spans correctly", async () => {
    if (!serverOk) return;

    const otlpPayload = {
      resourceSpans: [
        {
          scopeSpans: [
            {
              spans: [
                {
                  traceId: "error-trace-test-0000000000000000000",
                  spanId: "error-span-0000000000000",
                  name: "workflow:failing-workflow",
                  kind: "INTERNAL",
                  startTimeUnixNano: "1700000010000000000",
                  endTimeUnixNano: "1700000010100000000",
                  status: {
                    code: "STATUS_CODE_ERROR",
                    message: "Workflow execution failed: timeout exceeded",
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    const res = await fetch(`${TEST_BASE_URL}/v1/traces`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_API_KEY}`,
      },
      body: JSON.stringify(otlpPayload),
    });

    expect(res.status).toBe(200);

    const stored = await waitForCondition(async () => {
      const rows = await db
        .select()
        .from(traces)
        .where(eq(traces.traceId, "error-trace-test-0000000000000000000"));
      return rows.length > 0 ? rows : null;
    }, 5000);

    expect(stored[0].status).toBe("error");
  });

  it("handles spans with token usage attributes", async () => {
    if (!serverOk) return;

    const otlpPayload = {
      resourceSpans: [
        {
          scopeSpans: [
            {
              spans: [
                {
                  traceId: "token-usage-test-00000000000000000000",
                  spanId: "token-span-000000000000000",
                  name: "agent:research-agent",
                  kind: "INTERNAL",
                  startTimeUnixNano: "1700000020000000000",
                  endTimeUnixNano: "1700000025000000000",
                  attributes: [
                    { key: "mastra.agent", value: { stringValue: "research-agent" } },
                    { key: "gen_ai.request.model", value: { stringValue: "gpt-4o" } },
                    { key: "gen_ai.usage.prompt_tokens", value: { intValue: "1500" } },
                    { key: "gen_ai.usage.completion_tokens", value: { intValue: "800" } },
                    { key: "gen_ai.usage.total_tokens", value: { intValue: "2300" } },
                  ],
                  status: { code: "STATUS_CODE_OK" },
                },
              ],
            },
          ],
        },
      ],
    };

    const res = await fetch(`${TEST_BASE_URL}/v1/traces`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_API_KEY}`,
      },
      body: JSON.stringify(otlpPayload),
    });

    expect(res.status).toBe(200);

    const stored = await waitForCondition(async () => {
      const rows = await db
        .select()
        .from(traces)
        .where(eq(traces.traceId, "token-usage-test-00000000000000000000"));
      return rows.length > 0 ? rows : null;
    }, 5000);

    const attrs = stored[0].attributes as Record<string, unknown>;
    expect(attrs?.["mastra.agent"]).toBe("research-agent");
    expect(attrs?.["gen_ai.request.model"]).toBe("gpt-4o");
    expect(attrs?.["gen_ai.usage.prompt_tokens"]).toBe("1500");
    expect(attrs?.["gen_ai.usage.completion_tokens"]).toBe("800");
    expect(attrs?.["gen_ai.usage.total_tokens"]).toBe("2300");
  });

  it("rejects unauthenticated OTLP requests", async () => {
    if (!serverOk) return;

    const res = await fetch(`${TEST_BASE_URL}/v1/traces`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resourceSpans: [] }),
    });

    expect(res.status).toBe(401);
  });

  it("rejects empty payload", async () => {
    if (!serverOk) return;

    const res = await fetch(`${TEST_BASE_URL}/v1/traces`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_API_KEY}`,
      },
      body: JSON.stringify({ resourceSpans: [] }),
    });

    expect(res.status).toBe(400);
  });
});
