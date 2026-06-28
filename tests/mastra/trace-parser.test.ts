import { describe, expect, it } from "vitest";
import {
  buildSpanTree,
  extractTokenUsageFromSpans,
  type ParsedSpan,
  parseMastraTrace,
} from "../../src/mastra/trace-parser.js";

function makeSpan(overrides: Partial<ParsedSpan> = {}): ParsedSpan {
  return {
    traceId: "abc123",
    spanId: "span1",
    parentSpanId: null,
    name: "test-span",
    kind: "INTERNAL",
    startTimeUnixNano: "1000000000", // 1s from epoch = 1000ms
    endTimeUnixNano: "2000000000", // 2s from epoch = 1000ms duration
    attributes: {},
    status: "STATUS_CODE_OK",
    statusMessage: null,
    events: [],
    ...overrides,
  };
}

describe("parseMastraTrace", () => {
  it("extracts a workflow run with child steps", () => {
    const spans: ParsedSpan[] = [
      makeSpan({
        spanId: "wf1",
        name: "generate-article",
        attributes: { "mastra.workflow": "generate-article" },
        status: "STATUS_CODE_OK",
      }),
      makeSpan({
        spanId: "step1",
        parentSpanId: "wf1",
        name: "extract-params",
        startTimeUnixNano: "1100000000", // 1100ms
        endTimeUnixNano: "1200000000", // 1200ms = 100ms duration
        status: "STATUS_CODE_OK",
      }),
      makeSpan({
        spanId: "step2",
        parentSpanId: "wf1",
        name: "generate-content",
        startTimeUnixNano: "1200000000", // 1200ms
        endTimeUnixNano: "1800000000", // 1800ms = 600ms duration
        status: "STATUS_CODE_OK",
      }),
    ];

    const result = parseMastraTrace(spans);

    expect(result.workflowRuns).toHaveLength(1);
    expect(result.workflowRuns[0].name).toBe("generate-article");
    expect(result.workflowRuns[0].durationMs).toBe(1000);
    expect(result.workflowRuns[0].steps).toHaveLength(2);
    expect(result.workflowRuns[0].steps[0].name).toBe("extract-params");
    expect(result.workflowRuns[0].steps[0].durationMs).toBe(100);
    expect(result.workflowRuns[0].steps[1].name).toBe("generate-content");
    expect(result.workflowRuns[0].steps[1].durationMs).toBe(600);
  });

  it("extracts tool calls with input/output from events", () => {
    const spans: ParsedSpan[] = [
      makeSpan({
        spanId: "tool1",
        name: "web-search",
        attributes: { "mastra.tool": "web-search" },
        events: [
          {
            timeUnixNano: "1100000000",
            name: "tool.input",
            attributes: { data: '{"query":"latest AI news"}' },
          },
          {
            timeUnixNano: "1500000000",
            name: "tool.output",
            attributes: { data: '{"results":["article1","article2"]}' },
          },
        ],
      }),
    ];

    const result = parseMastraTrace(spans);

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].toolName).toBe("web-search");
    expect(result.toolCalls[0].input).toBe('{"query":"latest AI news"}');
    expect(result.toolCalls[0].output).toBe('{"results":["article1","article2"]}');
    expect(result.toolCalls[0].success).toBe(true);
    expect(result.toolCalls[0].durationMs).toBeGreaterThanOrEqual(999);
    expect(result.toolCalls[0].durationMs).toBeLessThanOrEqual(1001);
  });

  it("marks failed tool calls correctly", () => {
    const spans: ParsedSpan[] = [
      makeSpan({
        spanId: "tool1",
        name: "db-query",
        attributes: { "mastra.tool": "db-query" },
        status: "STATUS_CODE_ERROR",
      }),
    ];

    const result = parseMastraTrace(spans);

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].success).toBe(false);
  });

  it("extracts agent interactions with token usage", () => {
    const spans: ParsedSpan[] = [
      makeSpan({
        spanId: "agent1",
        name: "content-writer",
        attributes: {
          "mastra.agent": "content-writer",
          "gen_ai.request.model": "gpt-4o",
          "gen_ai.usage.prompt_tokens": "1500",
          "gen_ai.usage.completion_tokens": "800",
          "gen_ai.usage.total_tokens": "2300",
        },
        events: [
          {
            timeUnixNano: "1100000000",
            name: "agent.prompt",
            attributes: { data: "Write an article about AI" },
          },
          {
            timeUnixNano: "1900000000",
            name: "agent.response",
            attributes: { data: "Here is your article..." },
          },
        ],
      }),
    ];

    const result = parseMastraTrace(spans);

    expect(result.agentInteractions).toHaveLength(1);
    expect(result.agentInteractions[0].agentName).toBe("content-writer");
    expect(result.agentInteractions[0].model).toBe("gpt-4o");
    expect(result.agentInteractions[0].prompt).toBe("Write an article about AI");
    expect(result.agentInteractions[0].response).toBe("Here is your article...");
    expect(result.agentInteractions[0].promptTokens).toBe(1500);
    expect(result.agentInteractions[0].completionTokens).toBe(800);
    expect(result.agentInteractions[0].totalTokens).toBe(2300);
  });

  it("handles mixed span types in a single trace", () => {
    const spans: ParsedSpan[] = [
      makeSpan({
        spanId: "wf1",
        attributes: { "mastra.workflow": "chat" },
      }),
      makeSpan({
        spanId: "tool1",
        parentSpanId: "wf1",
        attributes: { "mastra.tool": "search" },
      }),
      makeSpan({
        spanId: "agent1",
        parentSpanId: "wf1",
        attributes: { "mastra.agent": "assistant" },
      }),
      makeSpan({
        spanId: "plain1",
        parentSpanId: "wf1",
        name: "http-request",
        attributes: {},
      }),
    ];

    const result = parseMastraTrace(spans);

    expect(result.workflowRuns).toHaveLength(1);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.agentInteractions).toHaveLength(1);
    // Plain span should not appear in any Mastra category
    expect(result.allSpans).toHaveLength(4);
  });
});

describe("buildSpanTree", () => {
  it("builds a correct parent-child tree", () => {
    const spans: ParsedSpan[] = [
      makeSpan({ spanId: "root", parentSpanId: null }),
      makeSpan({ spanId: "child1", parentSpanId: "root", startTimeUnixNano: "1000000001" }),
      makeSpan({ spanId: "child2", parentSpanId: "root", startTimeUnixNano: "1000000002" }),
      makeSpan({ spanId: "grandchild", parentSpanId: "child1" }),
    ];

    const tree = buildSpanTree(spans);

    expect(tree).toHaveLength(1);
    expect(tree[0].span.spanId).toBe("root");
    expect(tree[0].children).toHaveLength(2);
    expect(tree[0].children[0].span.spanId).toBe("child1");
    expect(tree[0].children[0].children).toHaveLength(1);
    expect(tree[0].children[0].children[0].span.spanId).toBe("grandchild");
  });

  it("sorts children by start time", () => {
    const spans: ParsedSpan[] = [
      makeSpan({ spanId: "root", parentSpanId: null }),
      makeSpan({ spanId: "late", parentSpanId: "root", startTimeUnixNano: "1000000003" }),
      makeSpan({ spanId: "early", parentSpanId: "root", startTimeUnixNano: "1000000001" }),
    ];

    const tree = buildSpanTree(spans);

    expect(tree[0].children[0].span.spanId).toBe("early");
    expect(tree[0].children[1].span.spanId).toBe("late");
  });

  it("handles multiple root spans", () => {
    const spans: ParsedSpan[] = [
      makeSpan({ spanId: "root1", traceId: "trace1" }),
      makeSpan({ spanId: "root2", traceId: "trace1", startTimeUnixNano: "1000000002" }),
    ];

    const tree = buildSpanTree(spans);

    expect(tree).toHaveLength(2);
    expect(tree[0].span.spanId).toBe("root1");
    expect(tree[1].span.spanId).toBe("root2");
  });
});

describe("extractTokenUsageFromSpans", () => {
  it("extracts token usage from spans with gen_ai attributes", () => {
    const spans: ParsedSpan[] = [
      makeSpan({
        attributes: {
          "gen_ai.request.model": "gpt-4o",
          "gen_ai.usage.prompt_tokens": "1000",
          "gen_ai.usage.completion_tokens": "500",
          "gen_ai.usage.total_tokens": "1500",
        },
      }),
      makeSpan({
        spanId: "span2",
        attributes: {
          model: "claude-3.5-sonnet",
          "gen_ai.usage.prompt_tokens": "2000",
          "gen_ai.usage.completion_tokens": "800",
          "gen_ai.usage.total_tokens": "2800",
        },
      }),
    ];

    const result = extractTokenUsageFromSpans(spans);

    expect(result).toHaveLength(2);
    expect(result[0].model).toBe("gpt-4o");
    expect(result[0].promptTokens).toBe(1000);
    expect(result[0].totalTokens).toBe(1500);
    expect(result[1].model).toBe("claude-3.5-sonnet");
  });

  it("ignores spans without token usage", () => {
    const spans: ParsedSpan[] = [makeSpan({ attributes: { "http.method": "GET" } })];

    const result = extractTokenUsageFromSpans(spans);

    expect(result).toHaveLength(0);
  });

  it("reads input_tokens / output_tokens (current OTel GenAI semconv names)", () => {
    const spans: ParsedSpan[] = [
      makeSpan({
        attributes: {
          "gen_ai.provider.name": "openai",
          "gen_ai.request.model": "gpt-4o",
          "gen_ai.usage.input_tokens": "750",
          "gen_ai.usage.output_tokens": "250",
        },
      }),
    ];

    const result = extractTokenUsageFromSpans(spans);

    expect(result).toHaveLength(1);
    expect(result[0].model).toBe("gpt-4o");
    expect(result[0].promptTokens).toBe(750);
    expect(result[0].completionTokens).toBe(250);
    // No total_tokens attribute — total is computed as prompt + completion.
    expect(result[0].totalTokens).toBe(1000);
  });

  it("prefers total_tokens when both total and split values are present", () => {
    const spans: ParsedSpan[] = [
      makeSpan({
        attributes: {
          "gen_ai.system": "openai",
          "gen_ai.request.model": "gpt-4o",
          "gen_ai.usage.prompt_tokens": "100",
          "gen_ai.usage.completion_tokens": "50",
          "gen_ai.usage.total_tokens": "175", // includes reasoning_tokens
        },
      }),
    ];

    const result = extractTokenUsageFromSpans(spans);

    expect(result).toHaveLength(1);
    expect(result[0].totalTokens).toBe(175);
  });
});

describe("parseMastraTrace — generic OpenTelemetry GenAI spans", () => {
  it("extracts a span with stable pre-stable gen_ai.* attributes", () => {
    const spans: ParsedSpan[] = [
      makeSpan({
        spanId: "otel1",
        name: "openai.chat",
        attributes: {
          "gen_ai.system": "openai",
          "gen_ai.request.model": "gpt-4o",
          "gen_ai.usage.prompt_tokens": "1200",
          "gen_ai.usage.completion_tokens": "600",
          "gen_ai.usage.total_tokens": "1800",
          "gen_ai.response.finish_reason": "stop",
        },
      }),
    ];

    const result = parseMastraTrace(spans);

    expect(result.workflowRuns).toHaveLength(0);
    expect(result.toolCalls).toHaveLength(0);
    expect(result.agentInteractions).toHaveLength(0);
    expect(result.genericAiInteractions).toHaveLength(1);
    const g = result.genericAiInteractions[0];
    expect(g.spanId).toBe("otel1");
    expect(g.system).toBe("openai");
    expect(g.model).toBe("gpt-4o");
    expect(g.promptTokens).toBe(1200);
    expect(g.completionTokens).toBe(600);
    expect(g.totalTokens).toBe(1800);
    expect(g.finishReason).toBe("stop");
    expect(g.durationMs).toBe(1000);
  });

  it("extracts a span with current OTel GenAI semconv attribute names", () => {
    const spans: ParsedSpan[] = [
      makeSpan({
        spanId: "otel2",
        name: "anthropic.messages",
        attributes: {
          "gen_ai.provider.name": "anthropic",
          "gen_ai.operation.name": "chat",
          "gen_ai.request.model": "claude-3-opus",
          "gen_ai.request.max_tokens": "1024",
          "gen_ai.usage.input_tokens": "800",
          "gen_ai.usage.output_tokens": "300",
          "gen_ai.response.finish_reasons": '["stop"]',
        },
      }),
    ];

    const result = parseMastraTrace(spans);

    expect(result.genericAiInteractions).toHaveLength(1);
    const g = result.genericAiInteractions[0];
    expect(g.system).toBe("anthropic");
    expect(g.operation).toBe("chat");
    expect(g.model).toBe("claude-3-opus");
    expect(g.maxTokens).toBe(1024);
    expect(g.promptTokens).toBe(800);
    expect(g.completionTokens).toBe(300);
    expect(g.totalTokens).toBe(1100); // computed, no total_tokens attribute
    expect(g.finishReason).toBe("stop");
  });

  it("parses multi-element finish_reasons arrays (JSON + comma-separated)", () => {
    const spans: ParsedSpan[] = [
      makeSpan({
        spanId: "otel3",
        attributes: {
          "gen_ai.provider.name": "openai",
          "gen_ai.request.model": "gpt-4o",
          "gen_ai.usage.input_tokens": "100",
          "gen_ai.usage.output_tokens": "50",
          "gen_ai.response.finish_reasons": "stop,length",
        },
      }),
      makeSpan({
        spanId: "otel4",
        attributes: {
          "gen_ai.provider.name": "openai",
          "gen_ai.request.model": "gpt-4o",
          "gen_ai.usage.input_tokens": "10",
          "gen_ai.usage.output_tokens": "5",
          "gen_ai.response.finish_reasons": '["tool_calls", "stop"]',
        },
      }),
    ];

    const result = parseMastraTrace(spans);

    expect(result.genericAiInteractions).toHaveLength(2);
    expect(result.genericAiInteractions[0].finishReason).toBe("stop");
    expect(result.genericAiInteractions[1].finishReason).toBe("tool_calls");
  });

  it("infers framework from otel.scope.name", () => {
    const spans: ParsedSpan[] = [
      makeSpan({
        spanId: "lc1",
        name: "ChatOpenAI",
        attributes: {
          "otel.scope.name": "langchain.llm",
          "gen_ai.system": "openai",
          "gen_ai.request.model": "gpt-4o",
          "gen_ai.usage.prompt_tokens": "100",
          "gen_ai.usage.completion_tokens": "50",
          "gen_ai.usage.total_tokens": "150",
        },
      }),
      makeSpan({
        spanId: "li1",
        name: "OpenAIEmbedding",
        attributes: {
          "otel.scope.name": "llama_index.embedding",
          "gen_ai.system": "openai",
          "gen_ai.request.model": "text-embedding-3-small",
          "gen_ai.usage.prompt_tokens": "20",
          "gen_ai.usage.total_tokens": "20",
        },
      }),
      makeSpan({
        spanId: "oi1",
        name: "ChatCompletion",
        attributes: {
          "otel.scope.name": "openinference.instrumentation.openai",
          "gen_ai.system": "openai",
          "gen_ai.request.model": "gpt-4o",
          "gen_ai.usage.input_tokens": "300",
          "gen_ai.usage.output_tokens": "200",
        },
      }),
      makeSpan({
        spanId: "raw1",
        name: "manual",
        attributes: {
          // No scope name; system still recoverable.
          "gen_ai.provider.name": "google",
          "gen_ai.request.model": "gemini-1.5-pro",
          "gen_ai.usage.input_tokens": "5",
          "gen_ai.usage.output_tokens": "5",
        },
      }),
    ];

    const result = parseMastraTrace(spans);

    expect(result.genericAiInteractions.map((g) => g.framework)).toEqual([
      "langchain",
      "llama_index",
      "openinference",
      "google",
    ]);
  });

  it("computes total_tokens when only prompt/completion are reported", () => {
    const spans: ParsedSpan[] = [
      makeSpan({
        spanId: "otel5",
        attributes: {
          "gen_ai.system": "anthropic",
          "gen_ai.request.model": "claude-3-haiku",
          "gen_ai.usage.input_tokens": "12",
          "gen_ai.usage.output_tokens": "34",
        },
      }),
    ];

    const result = parseMastraTrace(spans);

    expect(result.genericAiInteractions[0].totalTokens).toBe(46);
  });

  it("does not duplicate spans that already have mastra.agent", () => {
    // A Mastra agent span carries both `mastra.agent` and GenAI attrs.
    // It should land in agentInteractions, NOT in genericAiInteractions.
    const spans: ParsedSpan[] = [
      makeSpan({
        spanId: "mastra-agent",
        attributes: {
          "mastra.agent": "content-writer",
          "gen_ai.request.model": "gpt-4o",
          "gen_ai.usage.prompt_tokens": "100",
          "gen_ai.usage.completion_tokens": "50",
          "gen_ai.usage.total_tokens": "150",
        },
      }),
    ];

    const result = parseMastraTrace(spans);

    expect(result.agentInteractions).toHaveLength(1);
    expect(result.genericAiInteractions).toHaveLength(0);
  });

  it("ignores non-GenAI spans (http, db, custom instrumentation)", () => {
    const spans: ParsedSpan[] = [
      makeSpan({
        spanId: "http1",
        name: "GET /api/users",
        attributes: { "http.method": "GET", "http.status_code": "200" },
      }),
      makeSpan({
        spanId: "db1",
        name: "pg.query",
        attributes: { "db.system": "postgresql", "db.statement": "SELECT 1" },
      }),
      makeSpan({
        spanId: "otel6",
        name: "openai.chat",
        attributes: {
          "gen_ai.system": "openai",
          "gen_ai.request.model": "gpt-4o",
          "gen_ai.usage.prompt_tokens": "5",
          "gen_ai.usage.completion_tokens": "5",
          "gen_ai.usage.total_tokens": "10",
        },
      }),
    ];

    const result = parseMastraTrace(spans);

    expect(result.genericAiInteractions).toHaveLength(1);
    expect(result.genericAiInteractions[0].spanId).toBe("otel6");
  });

  it("handles malformed / missing token values gracefully", () => {
    const spans: ParsedSpan[] = [
      makeSpan({
        spanId: "bad1",
        attributes: {
          "gen_ai.system": "openai",
          "gen_ai.request.model": "gpt-4o",
          "gen_ai.usage.prompt_tokens": "not-a-number",
          "gen_ai.usage.completion_tokens": "",
          "gen_ai.usage.total_tokens": "0",
        },
      }),
    ];

    const result = parseMastraTrace(spans);

    expect(result.genericAiInteractions).toHaveLength(1);
    const g = result.genericAiInteractions[0];
    expect(g.promptTokens).toBe(0);
    expect(g.completionTokens).toBe(0);
    expect(g.totalTokens).toBe(0);
    expect(g.maxTokens).toBeNull();
    expect(g.finishReason).toBeNull();
  });

  it("coexists with Mastra workflow spans in a single trace", () => {
    // LangChain span nested under a Mastra workflow → only one
    // `genericAiInteraction`, the workflow and Mastra agent are still
    // classified into their own buckets.
    const spans: ParsedSpan[] = [
      makeSpan({
        spanId: "wf1",
        attributes: { "mastra.workflow": "rag-pipeline" },
      }),
      makeSpan({
        spanId: "step1",
        parentSpanId: "wf1",
        attributes: { "mastra.tool": "vector-search" },
      }),
      makeSpan({
        spanId: "step2",
        parentSpanId: "wf1",
        name: "openai.chat",
        attributes: {
          "otel.scope.name": "langchain.llm",
          "gen_ai.system": "openai",
          "gen_ai.request.model": "gpt-4o",
          "gen_ai.usage.prompt_tokens": "200",
          "gen_ai.usage.completion_tokens": "100",
          "gen_ai.usage.total_tokens": "300",
        },
      }),
    ];

    const result = parseMastraTrace(spans);

    expect(result.workflowRuns).toHaveLength(1);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.agentInteractions).toHaveLength(0);
    expect(result.genericAiInteractions).toHaveLength(1);
    expect(result.genericAiInteractions[0].framework).toBe("langchain");
    expect(result.genericAiInteractions[0].parentSpanId).toBe("wf1");
  });
});
