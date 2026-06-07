/**
 * Token usage analytics.
 *
 * Aggregates LLM token usage from stored traces, grouped by model, agent,
 * or workflow. Includes configurable per-model cost estimation.
 */

import { db } from "../store/db.js";
import { traces } from "../store/schema.js";
import { eq, gte, lte, sql, } from "drizzle-orm";
import { castDbRows } from "../lib/db-types.js";

// ── Types ───────────────────────────────────────────────────────────────

export interface TokenUsageEntry {
  groupKey: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  requestCount: number;
}

export interface TokenUsageParams {
  projectId: string;
  from?: Date;
  to?: Date;
  groupBy: "model" | "agent" | "workflow";
}

// ── Default pricing (USD per 1M tokens) ─────────────────────────────────
// Approximate public list prices — they drift, so override per deployment via
// the MODEL_PRICING env var (JSON map of model -> { prompt, completion }).

type ModelPrice = { prompt: number; completion: number };

const DEFAULT_PRICING: Record<string, ModelPrice> = {
  // OpenAI
  "gpt-4": { prompt: 30.0, completion: 60.0 },
  "gpt-4-turbo": { prompt: 10.0, completion: 30.0 },
  "gpt-4o": { prompt: 5.0, completion: 15.0 },
  "gpt-4o-mini": { prompt: 0.15, completion: 0.6 },
  "gpt-4.1": { prompt: 2.0, completion: 8.0 },
  "gpt-4.1-mini": { prompt: 0.4, completion: 1.6 },
  "gpt-4.1-nano": { prompt: 0.1, completion: 0.4 },
  "gpt-5": { prompt: 1.25, completion: 10.0 },
  "gpt-5-mini": { prompt: 0.25, completion: 2.0 },
  "gpt-3.5-turbo": { prompt: 0.5, completion: 1.5 },
  o1: { prompt: 15.0, completion: 60.0 },
  "o3-mini": { prompt: 1.1, completion: 4.4 },
  "o4-mini": { prompt: 1.1, completion: 4.4 },
  // Anthropic Claude
  "claude-3-opus": { prompt: 15.0, completion: 75.0 },
  "claude-3-sonnet": { prompt: 3.0, completion: 15.0 },
  "claude-3-haiku": { prompt: 0.25, completion: 1.25 },
  "claude-3.5-sonnet": { prompt: 3.0, completion: 15.0 },
  "claude-3.5-haiku": { prompt: 0.8, completion: 4.0 },
  "claude-3-5-sonnet": { prompt: 3.0, completion: 15.0 },
  "claude-3-5-haiku": { prompt: 0.8, completion: 4.0 },
  "claude-3-7-sonnet": { prompt: 3.0, completion: 15.0 },
  "claude-opus-4": { prompt: 15.0, completion: 75.0 },
  "claude-sonnet-4": { prompt: 3.0, completion: 15.0 },
  "claude-haiku-4": { prompt: 1.0, completion: 5.0 },
  // Google Gemini
  "gemini-pro": { prompt: 0.5, completion: 1.5 },
  "gemini-1.5-pro": { prompt: 3.5, completion: 10.5 },
  "gemini-1.5-flash": { prompt: 0.075, completion: 0.3 },
  "gemini-2.0-flash": { prompt: 0.1, completion: 0.4 },
  "gemini-2.5-pro": { prompt: 1.25, completion: 10.0 },
  "gemini-2.5-flash": { prompt: 0.3, completion: 2.5 },
};

/** Parse the optional MODEL_PRICING env override (JSON), merged over defaults. */
function loadPricing(): Record<string, ModelPrice> {
  const raw = process.env.MODEL_PRICING;
  if (!raw) return DEFAULT_PRICING;
  try {
    const custom = JSON.parse(raw) as Record<string, ModelPrice>;
    const merged: Record<string, ModelPrice> = { ...DEFAULT_PRICING };
    for (const [model, price] of Object.entries(custom)) {
      if (typeof price?.prompt === "number" && typeof price?.completion === "number") {
        merged[model.toLowerCase()] = price;
      }
    }
    return merged;
  } catch {
    return DEFAULT_PRICING;
  }
}

const PRICING = loadPricing();

/**
 * Resolve a model's price: exact match first, then the longest matching prefix
 * (so dated/versioned ids like "claude-sonnet-4-20250514" map to the base
 * model), else null.
 */
function resolvePrice(normalized: string): ModelPrice | null {
  if (PRICING[normalized]) return PRICING[normalized];
  let best: { key: string; price: ModelPrice } | null = null;
  for (const [key, price] of Object.entries(PRICING)) {
    if (normalized.startsWith(key) && (!best || key.length > best.key.length)) {
      best = { key, price };
    }
  }
  return best?.price ?? null;
}

function estimateCost(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const normalized = model.toLowerCase().replace(/^.*\//, "");
  const pricing = resolvePrice(normalized);

  if (!pricing) {
    // Fallback: assume $1/1M prompt, $3/1M completion
    return (promptTokens * 1.0 + completionTokens * 3.0) / 1_000_000;
  }

  return (
    (promptTokens * pricing.prompt + completionTokens * pricing.completion) /
    1_000_000
  );
}

// ── Aggregation ─────────────────────────────────────────────────────────

export async function getTokenUsage(
  params: TokenUsageParams,
): Promise<TokenUsageEntry[]> {
  const { projectId, from, to, groupBy } = params;

  // Build the group key expression based on groupBy
  let groupKeyExpr: string;
  switch (groupBy) {
    case "model":
      // gen_ai.request.model stored in attributes JSON
      groupKeyExpr = `COALESCE(attributes->>'gen_ai.request.model', attributes->>'model', 'unknown')`;
      break;
    case "agent":
      groupKeyExpr = `COALESCE(attributes->>'mastra.agent', 'unknown')`;
      break;
    case "workflow":
      groupKeyExpr = `COALESCE(attributes->>'mastra.workflow', 'unknown')`;
      break;
  }

  const conditions = [
    eq(traces.projectId, projectId),
    sql`CAST(attributes->>'gen_ai.usage.total_tokens' AS INTEGER) > 0`,
  ];

  if (from) conditions.push(gte(traces.createdAt, from));
  if (to) conditions.push(lte(traces.createdAt, to));

  const rows = await db.execute(sql`
    SELECT
      ${sql.raw(groupKeyExpr)} AS group_key,
      SUM(CAST(COALESCE(attributes->>'gen_ai.usage.prompt_tokens', '0') AS INTEGER)) AS prompt_tokens,
      SUM(CAST(COALESCE(attributes->>'gen_ai.usage.completion_tokens', '0') AS INTEGER)) AS completion_tokens,
      SUM(CAST(COALESCE(attributes->>'gen_ai.usage.total_tokens', '0') AS INTEGER)) AS total_tokens,
      COUNT(*) AS request_count
    FROM traces
    WHERE ${sql.join(conditions, sql` AND `)}
    GROUP BY group_key
    ORDER BY total_tokens DESC
  `);

  return castDbRows<Record<string, unknown>>(rows).map((row) => {
    const promptTokens = Number(row.prompt_tokens ?? 0);
    const completionTokens = Number(row.completion_tokens ?? 0);
    const totalTokens = Number(row.total_tokens ?? 0);
    const groupKey = String(row.group_key ?? "unknown");

    return {
      groupKey,
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedCostUsd: estimateCost(groupKey, promptTokens, completionTokens),
      requestCount: Number(row.request_count ?? 0),
    };
  });
}

export { estimateCost };
