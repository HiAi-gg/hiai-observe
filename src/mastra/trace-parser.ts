/**
 * Mastra + generic OpenTelemetry GenAI trace parser.
 *
 * Identifies:
 *   • Mastra spans by attributes (`mastra.workflow`, `mastra.tool`,
 *     `mastra.agent`) → `WorkflowRun` / `ToolCall` / `AgentInteraction`
 *   • Any span carrying OpenTelemetry GenAI semantic-convention attributes
 *     (`gen_ai.*`) from non-Mastra instrumentations (LangChain, LlamaIndex,
 *     OpenInference, OpenLLMetry, etc.) → `GenericAiInteraction`
 *
 * Both attribute variants are supported:
 *   • Stable / pre-stable names: `gen_ai.system`, `gen_ai.request.model`,
 *     `gen_ai.usage.prompt_tokens`, `gen_ai.usage.completion_tokens`,
 *     `gen_ai.usage.total_tokens`, `gen_ai.response.finish_reason`,
 *     `gen_ai.request.max_tokens`
 *   • Current semconv names: `gen_ai.provider.name`, `gen_ai.operation.name`,
 *     `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`,
 *     `gen_ai.response.finish_reasons`, `gen_ai.request.model`,
 *     `gen_ai.request.max_tokens`
 *
 * The Mastra classification still wins when a span has both `mastra.agent`
 * AND `gen_ai.*` attrs — those go to `agentInteractions`. Spans with only
 * `gen_ai.*` attrs flow to `genericAiInteractions`.
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

/**
 * A span from a non-Mastra AI instrumentation (LangChain, LlamaIndex,
 * OpenInference, OpenLLMetry, raw OTLP, etc.) that carries OpenTelemetry
 * GenAI semantic-convention attributes.
 *
 * Routed through the same analytics path as `AgentInteraction`: token
 * aggregator, cost estimator, and downstream dashboards.
 */
export interface GenericAiInteraction {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  /** Best-effort framework label: e.g. "langchain", "llama_index", "openai", "anthropic". */
  framework: string;
  /** GenAI provider (`gen_ai.provider.name`) or legacy `gen_ai.system`. */
  system: string | null;
  /** Operation: "chat", "embeddings", "text_completion", "generate_content", ... */
  operation: string | null;
  /** Requested model — e.g. "gpt-4o", "claude-3-opus", "gemini-1.5-pro". */
  model: string | null;
  /** Max tokens requested, if reported. */
  maxTokens: number | null;
  /** Number of prompt / input tokens. */
  promptTokens: number;
  /** Number of completion / output tokens. */
  completionTokens: number;
  /** Sum of prompt + completion. Computed when not reported by the provider. */
  totalTokens: number;
  /** First finish reason (`"stop"`, `"length"`, `"tool_call"`, ...). */
  finishReason: string | null;
  durationMs: number;
}

export interface MastraTrace {
  traceId: string;
  workflowRuns: WorkflowRun[];
  toolCalls: ToolCall[];
  agentInteractions: AgentInteraction[];
  /**
   * Non-Mastra AI spans carrying OpenTelemetry GenAI semantic-convention
   * attributes (`gen_ai.*`). Routed through the same enrichment path as
   * Mastra agent spans — token usage, cost estimation, analytics.
   */
  genericAiInteractions: GenericAiInteraction[];
  allSpans: ParsedSpan[];
}

// ── Attribute extraction ────────────────────────────────────────────────

function nsToMs(ns: string): number {
  return Number(BigInt(ns) / 1_000_000n);
}

function durationMs(start: string, end: string): number {
  return nsToMs(end) - nsToMs(start);
}

function _attrsToRecord(
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

// ── Generic OpenTelemetry GenAI attribute extraction ───────────────────
//
// OpenTelemetry GenAI semantic conventions use both stable / pre-stable
// (snake_case `gen_ai.system`, `prompt_tokens`, `completion_tokens`) and
// the new "split" naming (`gen_ai.provider.name`, `input_tokens`,
// `output_tokens`). We read whichever form is present on the span.

/** Provider / system key. Returns the first non-empty match. */
function readSystem(attrs: Record<string, string>): string | null {
  return attrs["gen_ai.provider.name"] ?? attrs["gen_ai.system"] ?? attrs["vendor"] ?? null;
}

/** Operation name (`chat`, `embeddings`, `text_completion`, ...). */
function readOperation(attrs: Record<string, string>): string | null {
  return attrs["gen_ai.operation.name"] ?? null;
}

/** Requested model identifier. */
function readModel(attrs: Record<string, string>): string | null {
  return attrs["gen_ai.request.model"] ?? attrs["gen_ai.response.model"] ?? attrs.model ?? null;
}

function readMaxTokens(attrs: Record<string, string>): number | null {
  const raw = attrs["gen_ai.request.max_tokens"];
  if (raw === undefined || raw === "") return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

function readPromptTokens(attrs: Record<string, string>): number {
  const raw = attrs["gen_ai.usage.input_tokens"] ?? attrs["gen_ai.usage.prompt_tokens"];
  if (raw === undefined || raw === "") return 0;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : 0;
}

function readCompletionTokens(attrs: Record<string, string>): number {
  const raw = attrs["gen_ai.usage.output_tokens"] ?? attrs["gen_ai.usage.completion_tokens"];
  if (raw === undefined || raw === "") return 0;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : 0;
}

function readTotalTokens(attrs: Record<string, string>): number {
  const explicit = attrs["gen_ai.usage.total_tokens"];
  if (explicit !== undefined && explicit !== "") {
    const n = parseInt(explicit, 10);
    if (Number.isFinite(n)) return n;
  }
  return readPromptTokens(attrs) + readCompletionTokens(attrs);
}

/** First finish reason from `gen_ai.response.finish_reasons` (array-as-string) or the legacy scalar. */
function readFinishReason(attrs: Record<string, string>): string | null {
  const arr = attrs["gen_ai.response.finish_reasons"];
  if (arr) {
    // May arrive as JSON array string ("[\"stop\"]") or comma-separated ("stop,length")
    const trimmed = arr.trim();
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (Array.isArray(parsed) && parsed.length > 0) {
          const first = parsed[0];
          if (typeof first === "string") return first;
        }
      } catch {
        // fall through to scalar handling
      }
    }
    const first = trimmed.split(",")[0]?.trim();
    if (first) return first;
  }
  const scalar = attrs["gen_ai.response.finish_reason"];
  if (scalar) return scalar;
  return null;
}

/**
 * Detect a non-Mastra GenAI span: a span that carries OpenTelemetry GenAI
 * attributes (`gen_ai.*` — system / provider, request model, usage tokens)
 * but does NOT already belong to a Mastra-specific category.
 */
function isGenericAiSpan(attrs: Record<string, string>): boolean {
  if (isMastraWorkflow(attrs) || isMastraTool(attrs) || isMastraAgent(attrs)) {
    return false;
  }
  return (
    "gen_ai.provider.name" in attrs ||
    "gen_ai.system" in attrs ||
    "gen_ai.request.model" in attrs ||
    "gen_ai.response.model" in attrs ||
    "gen_ai.usage.input_tokens" in attrs ||
    "gen_ai.usage.prompt_tokens" in attrs ||
    "gen_ai.usage.output_tokens" in attrs ||
    "gen_ai.usage.completion_tokens" in attrs
  );
}

/**
 * Best-effort framework label from span attributes. Looks at the OTel
 * scope name (set by the OTLP parser) and common GenAI vendor prefixes
 * (e.g. "langchain.llm", "llama_index.embedding") before falling back to
 * the GenAI provider / system name.
 */
function inferFramework(attrs: Record<string, string>): string {
  const scope = attrs["otel.scope.name"] ?? attrs["otel.library.name"];
  if (scope) {
    const s = scope.toLowerCase();
    if (s.startsWith("langchain")) return "langchain";
    if (s.startsWith("llama_index") || s.startsWith("llamaindex")) return "llama_index";
    if (s.startsWith("openinference")) return "openinference";
    if (s.startsWith("openllmetry")) return "openllmetry";
    if (s.startsWith("traceloop")) return "traceloop";
    if (s.startsWith("openai")) return "openai";
    if (s.startsWith("anthropic")) return "anthropic";
    // Strip a generic "instrumentation-*" prefix to give a stable label
    // (e.g. "instrumentation-openai" → "openai").
    const match = s.match(/^instrumentation-(.+)$/);
    if (match && match[1]) return match[1].replace(/[-_]/g, ".");
  }
  return readSystem(attrs) ?? "unknown";
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
  const genericAiInteractions: GenericAiInteraction[] = [];

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
        input: inputEvent?.attributes.data ?? attrs["tool.input"] ?? null,
        output: outputEvent?.attributes.data ?? attrs["tool.output"] ?? null,
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
        model: readModel(attrs),
        prompt: promptEvent?.attributes.data ?? attrs["agent.prompt"] ?? null,
        response: responseEvent?.attributes.data ?? attrs["agent.response"] ?? null,
        durationMs: durationMs(span.startTimeUnixNano, span.endTimeUnixNano),
        promptTokens: readPromptTokens(attrs),
        completionTokens: readCompletionTokens(attrs),
        totalTokens: readTotalTokens(attrs),
      });
    } else if (isGenericAiSpan(attrs)) {
      // Non-Mastra GenAI span (LangChain, LlamaIndex, raw OTLP, …).
      // Route through the same enrichment path as Mastra agent spans.
      genericAiInteractions.push({
        traceId: span.traceId,
        spanId: span.spanId,
        parentSpanId: span.parentSpanId,
        framework: inferFramework(attrs),
        system: readSystem(attrs),
        operation: readOperation(attrs),
        model: readModel(attrs),
        maxTokens: readMaxTokens(attrs),
        promptTokens: readPromptTokens(attrs),
        completionTokens: readCompletionTokens(attrs),
        totalTokens: readTotalTokens(attrs),
        finishReason: readFinishReason(attrs),
        durationMs: durationMs(span.startTimeUnixNano, span.endTimeUnixNano),
      });
    }
  }

  return {
    traceId,
    workflowRuns,
    toolCalls,
    agentInteractions,
    genericAiInteractions,
    allSpans: spans,
  };
}

/**
 * Build a span tree for a single trace — ordered by start time,
 * with children nested under parents.
 */
export function buildSpanTree(spans: ParsedSpan[]): SpanTreeNode[] {
  const _byId = new Map(spans.map((s) => [s.spanId, s]));
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
      nodes.get(span.parentSpanId)?.children.push(node);
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
    const promptTokens = readPromptTokens(attrs);
    const completionTokens = readCompletionTokens(attrs);
    const totalTokens = readTotalTokens(attrs);

    if (totalTokens > 0) {
      results.push({
        model: readModel(attrs) ?? "unknown",
        promptTokens,
        completionTokens,
        totalTokens,
      });
    }
  }

  return results;
}
