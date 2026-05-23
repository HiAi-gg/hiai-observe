import { describe, it, expect } from "vitest";
import {
  parseMastraTrace,
  buildSpanTree,
  extractTokenUsageFromSpans,
  type ParsedSpan,
} from "../../src/mastra/trace-parser.js";

function makeSpan(overrides: Partial<ParsedSpan> = {}): ParsedSpan {
  return {
    traceId: "abc123",
    spanId: "span1",
    parentSpanId: null,
    name: "test-span",
    kind: "INTERNAL",
    startTimeUnixNano: "1000000000", // 1s from epoch = 1000ms
    endTimeUnixNano: "2000000000",   // 2s from epoch = 1000ms duration
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
        startTimeUnixNano: "1100000000",  // 1100ms
        endTimeUnixNano: "1200000000",    // 1200ms = 100ms duration
        status: "STATUS_CODE_OK",
      }),
      makeSpan({
        spanId: "step2",
        parentSpanId: "wf1",
        name: "generate-content",
        startTimeUnixNano: "1200000000",  // 1200ms
        endTimeUnixNano: "1800000000",    // 1800ms = 600ms duration
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
          "model": "claude-3.5-sonnet",
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
    const spans: ParsedSpan[] = [
      makeSpan({ attributes: { "http.method": "GET" } }),
    ];

    const result = extractTokenUsageFromSpans(spans);

    expect(result).toHaveLength(0);
  });
});
