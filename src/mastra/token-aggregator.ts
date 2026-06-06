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

const DEFAULT_PRICING: Record<string, { prompt: number; completion: number }> = {
  "gpt-4": { prompt: 30.0, completion: 60.0 },
  "gpt-4-turbo": { prompt: 10.0, completion: 30.0 },
  "gpt-4o": { prompt: 5.0, completion: 15.0 },
  "gpt-4o-mini": { prompt: 0.15, completion: 0.6 },
  "gpt-3.5-turbo": { prompt: 0.5, completion: 1.5 },
  "claude-3-opus": { prompt: 15.0, completion: 75.0 },
  "claude-3-sonnet": { prompt: 3.0, completion: 15.0 },
  "claude-3-haiku": { prompt: 0.25, completion: 1.25 },
  "claude-3.5-sonnet": { prompt: 3.0, completion: 15.0 },
  "claude-3.5-haiku": { prompt: 0.8, completion: 4.0 },
  "gemini-pro": { prompt: 0.5, completion: 1.5 },
  "gemini-1.5-pro": { prompt: 3.5, completion: 10.5 },
  "gemini-1.5-flash": { prompt: 0.075, completion: 0.3 },
};

function estimateCost(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const normalized = model.toLowerCase().replace(/^.*\//, "");
  const pricing = DEFAULT_PRICING[normalized];

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
