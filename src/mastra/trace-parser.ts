/**
 * Mastra-specific trace parser.
 *
 * Identifies Mastra spans by attributes (`mastra.workflow`, `mastra.tool`,
 * `mastra.agent`) and extracts structured workflow runs, tool calls, and
 * agent interactions from OTLP span trees.
 */

// ── Exported types ──────────────────────────────────────────────────────

export interface ParsedSpan {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  name: string;
  kind: string;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: Record<string, string>;
  status: string | null;
  statusMessage: string | null;
  events: ParsedEvent[];
}

export interface ParsedEvent {
  timeUnixNano: string;
  name: string;
  attributes: Record<string, string>;
}

export interface WorkflowRun {
  traceId: string;
  spanId: string;
  name: string;
  status: "ok" | "error" | "unset";
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  durationMs: number;
  steps: WorkflowStep[];
}

export interface WorkflowStep {
  name: string;
  spanId: string;
  status: "ok" | "error" | "unset";
  durationMs: number;
}

export interface ToolCall {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  toolName: string;
  input: string | null;
  output: string | null;
  durationMs: number;
  success: boolean;
}

export interface AgentInteraction {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  agentName: string;
  model: string | null;
  prompt: string | null;
  response: string | null;
  durationMs: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface MastraTrace {
  traceId: string;
  workflowRuns: WorkflowRun[];
  toolCalls: ToolCall[];
  agentInteractions: AgentInteraction[];
  allSpans: ParsedSpan[];
}

// ── Attribute extraction ────────────────────────────────────────────────

function nsToMs(ns: string): number {
  return Number(BigInt(ns) / 1_000_000n);
}

function durationMs(start: string, end: string): number {
  return nsToMs(end) - nsToMs(start);
}

function attrsToRecord(
  attrs: Array<{ key: string; value: Record<string, unknown> }>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of attrs) {
    const v = a.value;
    out[a.key] =
      (v.stringValue as string) ??
      (v.intValue as string) ??
      String(v.doubleValue ?? v.boolValue ?? "");
  }
  return out;
}

// ── Span classification ─────────────────────────────────────────────────

function isMastraWorkflow(attrs: Record<string, string>): boolean {
  return "mastra.workflow" in attrs;
}

function isMastraTool(attrs: Record<string, string>): boolean {
  return "mastra.tool" in attrs;
}

function isMastraAgent(attrs: Record<string, string>): boolean {
  return "mastra.agent" in attrs;
}

function statusCode(raw: string | undefined): "ok" | "error" | "unset" {
  if (raw === "STATUS_CODE_OK" || raw === "Ok" || raw === "2") return "ok";
  if (raw === "STATUS_CODE_ERROR" || raw === "Error") return "error";
  return "unset";
}

// ── Core parsing ────────────────────────────────────────────────────────

export function parseMastraTrace(spans: ParsedSpan[]): MastraTrace {
  const traceId = spans[0]?.traceId ?? "";

  const workflowRuns: WorkflowRun[] = [];
  const toolCalls: ToolCall[] = [];
  const agentInteractions: AgentInteraction[] = [];

  // Build child index for workflow step extraction
  const childrenByParent = new Map<string, ParsedSpan[]>();
  for (const span of spans) {
    if (span.parentSpanId) {
      const list = childrenByParent.get(span.parentSpanId) ?? [];
      list.push(span);
      childrenByParent.set(span.parentSpanId, list);
    }
  }

  for (const span of spans) {
    const attrs = span.attributes;

    if (isMastraWorkflow(attrs)) {
      const steps: WorkflowStep[] = [];
      const children = childrenByParent.get(span.spanId) ?? [];
      for (const child of children) {
        steps.push({
          name: child.name,
          spanId: child.spanId,
          status: statusCode(child.status ?? undefined),
          durationMs: durationMs(child.startTimeUnixNano, child.endTimeUnixNano),
        });
      }

      workflowRuns.push({
        traceId: span.traceId,
        spanId: span.spanId,
        name: attrs["mastra.workflow"] ?? span.name,
        status: statusCode(span.status ?? undefined),
        startTimeUnixNano: span.startTimeUnixNano,
        endTimeUnixNano: span.endTimeUnixNano,
        durationMs: durationMs(span.startTimeUnixNano, span.endTimeUnixNano),
        steps,
      });
    }

    if (isMastraTool(attrs)) {
      // Extract input/output from events or attributes
      const inputEvent = span.events.find((e) => e.name === "tool.input");
      const outputEvent = span.events.find((e) => e.name === "tool.output");

      toolCalls.push({
        traceId: span.traceId,
        spanId: span.spanId,
        parentSpanId: span.parentSpanId,
        toolName: attrs["mastra.tool"] ?? span.name,
        input: inputEvent?.attributes["data"] ?? attrs["tool.input"] ?? null,
        output: outputEvent?.attributes["data"] ?? attrs["tool.output"] ?? null,
        durationMs: durationMs(span.startTimeUnixNano, span.endTimeUnixNano),
        success: statusCode(span.status ?? undefined) === "ok",
      });
    }

    if (isMastraAgent(attrs)) {
      const promptEvent = span.events.find((e) => e.name === "agent.prompt");
      const responseEvent = span.events.find((e) => e.name === "agent.response");

      agentInteractions.push({
        traceId: span.traceId,
        spanId: span.spanId,
        parentSpanId: span.parentSpanId,
        agentName: attrs["mastra.agent"] ?? span.name,
        model: attrs["gen_ai.request.model"] ?? attrs["model"] ?? null,
        prompt: promptEvent?.attributes["data"] ?? attrs["agent.prompt"] ?? null,
        response: responseEvent?.attributes["data"] ?? attrs["agent.response"] ?? null,
        durationMs: durationMs(span.startTimeUnixNano, span.endTimeUnixNano),
        promptTokens: parseInt(attrs["gen_ai.usage.prompt_tokens"] ?? "0") || 0,
        completionTokens: parseInt(attrs["gen_ai.usage.completion_tokens"] ?? "0") || 0,
        totalTokens: parseInt(attrs["gen_ai.usage.total_tokens"] ?? "0") || 0,
      });
    }
  }

  return { traceId, workflowRuns, toolCalls, agentInteractions, allSpans: spans };
}

/**
 * Build a span tree for a single trace — ordered by start time,
 * with children nested under parents.
 */
export function buildSpanTree(spans: ParsedSpan[]): SpanTreeNode[] {
  const byId = new Map(spans.map((s) => [s.spanId, s]));
  const roots: SpanTreeNode[] = [];
  const nodes = new Map<string, SpanTreeNode>();

  // Create all nodes
  for (const span of spans) {
    nodes.set(span.spanId, { span, children: [] });
  }

  // Link children to parents
  for (const span of spans) {
    const node = nodes.get(span.spanId)!;
    if (span.parentSpanId && nodes.has(span.parentSpanId)) {
      nodes.get(span.parentSpanId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort each level by start time
  function sortLevel(nodes: SpanTreeNode[]): void {
    nodes.sort((a, b) => {
      const diff = BigInt(a.span.startTimeUnixNano) - BigInt(b.span.startTimeUnixNano);
      return diff < 0n ? -1 : diff > 0n ? 1 : 0;
    });
    for (const n of nodes) sortLevel(n.children);
  }
  sortLevel(roots);

  return roots;
}

export interface SpanTreeNode {
  span: ParsedSpan;
  children: SpanTreeNode[];
}

export function extractTokenUsageFromSpans(spans: ParsedSpan[]): {
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}[] {
  const results: {
    model: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  }[] = [];

  for (const span of spans) {
    const attrs = span.attributes;
    const promptTokens = parseInt(attrs["gen_ai.usage.prompt_tokens"] ?? "0") || 0;
    const completionTokens = parseInt(attrs["gen_ai.usage.completion_tokens"] ?? "0") || 0;
    const totalTokens = parseInt(attrs["gen_ai.usage.total_tokens"] ?? "0") || 0;

    if (totalTokens > 0) {
      results.push({
        model: attrs["gen_ai.request.model"] ?? attrs["model"] ?? "unknown",
        promptTokens,
        completionTokens,
        totalTokens,
      });
    }
  }

  return results;
}
