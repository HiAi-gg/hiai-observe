<script lang="ts">
import { getTraces, type Trace } from "$lib/api";
import PieChart from "$lib/components/PieChart.svelte";

let loading = $state(true);
let error = $state<string | null>(null);
let traces = $state<Trace[]>([]);
let timeRange = $state("7d");

const MODEL_PRICES: Record<string, { prompt: number; completion: number }> = {
  "gpt-4": { prompt: 0.03, completion: 0.06 },
  "gpt-4o": { prompt: 0.005, completion: 0.015 },
  "gpt-4o-mini": { prompt: 0.00015, completion: 0.0006 },
  "gpt-3.5-turbo": { prompt: 0.0005, completion: 0.0015 },
  "claude-3.5-sonnet": { prompt: 0.003, completion: 0.015 },
  "claude-3-haiku": { prompt: 0.00025, completion: 0.00125 },
  "gemini-1.5-pro": { prompt: 0.0035, completion: 0.0105 },
  "gemini-1.5-flash": { prompt: 0.000075, completion: 0.0003 },
};

const CHART_COLORS = [
  "#3b82f6",
  "#22c55e",
  "#eab308",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#f97316",
  "#ec4899",
];

function getTimeFrom(): string {
  const now = Date.now();
  const ranges: Record<string, number> = { "24h": 86400000, "7d": 604800000, "30d": 2592000000 };
  return new Date(now - (ranges[timeRange] || 604800000)).toISOString();
}

async function load(silent = false) {
  try {
    if (!silent) loading = true;
    error = null;
    const result = await getTraces({ limit: 200, from: getTimeFrom() });
    traces = result.traces || [];
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load";
  } finally {
    loading = false;
  }
}

$effect(() => {
  timeRange;
  load();
});

$effect(() => {
  const interval = setInterval(() => load(true), 15_000);
  return () => clearInterval(interval);
});

interface ModelRow {
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
  traces: number;
}

const modelData = $derived.by(() => {
  const map = new Map<
    string,
    { prompt: number; completion: number; total: number; traces: number }
  >();
  for (const t of traces) {
    const attrs = (t as any).attributes || {};
    const model = (attrs.model as string) || (t as any).model || "unknown";
    const promptTokens = (attrs.prompt_tokens as number) || 0;
    const completionTokens = (attrs.completion_tokens as number) || 0;
    const total = t.tokens_used || promptTokens + completionTokens;

    const entry = map.get(model) || { prompt: 0, completion: 0, total: 0, traces: 0 };
    entry.prompt += promptTokens;
    entry.completion += completionTokens;
    entry.total += total;
    entry.traces++;
    map.set(model, entry);
  }

  const rows: ModelRow[] = [];
  for (const [model, v] of map) {
    const prices = MODEL_PRICES[model] || { prompt: 0.003, completion: 0.015 };
    const cost = (v.prompt / 1000) * prices.prompt + (v.completion / 1000) * prices.completion;
    rows.push({
      model,
      promptTokens: v.prompt,
      completionTokens: v.completion,
      totalTokens: v.total,
      estimatedCost: Math.round(cost * 10000) / 10000,
      traces: v.traces,
    });
  }
  return rows.sort((a, b) => b.estimatedCost - a.estimatedCost);
});

const totalCost = $derived(modelData.reduce((sum, m) => sum + m.estimatedCost, 0));
const totalTokens = $derived(modelData.reduce((sum, m) => sum + m.totalTokens, 0));

const chartData = $derived(
  modelData.map((m, i) => ({
    label: m.model,
    value: m.estimatedCost || m.totalTokens,
    color: CHART_COLORS[i % CHART_COLORS.length],
  })),
);
</script>

<svelte:head><title>Model Cost Breakdown | HiAi Observe</title></svelte:head>

<div class="space-y-6">
  <div class="flex items-end justify-between">
    <div>
      <h1 class="text-2xl font-bold text-[var(--foreground)]">Model Cost Breakdown</h1>
      <p class="mt-1 text-sm text-[var(--muted-foreground)]">Token usage and estimated costs by model</p>
    </div>
    <div class="flex gap-1">
      {#each ["24h", "7d", "30d"] as range (range)}
        <button type="button"
          onclick={() => timeRange = range}
          class="rounded-md px-3 py-1.5 text-xs font-medium transition-colors {timeRange === range ? 'bg-[var(--primary)] text-white' : 'text-[var(--muted-foreground)] hover:bg-[var(--accent)]'}"
        >{range}</button>
      {/each}
    </div>
  </div>

  {#if error}
    <div class="flex items-center gap-3 rounded-lg border border-[var(--destructive)]/50 bg-[color-mix(in_oklch,var(--destructive)_18%,transparent)] px-4 py-3 text-sm text-[var(--destructive)]">
      <span class="flex-1">{error}</span>
      <button type="button" onclick={() => load()} class="rounded border border-[var(--destructive)]/50 px-2.5 py-1 text-xs hover:bg-[color-mix(in_oklch,var(--destructive)_18%,transparent)]">Retry</button>
    </div>
  {/if}

  <!-- Summary cards -->
  <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
    <div class="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
      <p class="text-sm text-[var(--muted-foreground)]">Total Estimated Cost</p>
      <p class="mt-1 text-2xl font-bold text-[var(--foreground)]">${totalCost.toFixed(4)}</p>
    </div>
    <div class="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
      <p class="text-sm text-[var(--muted-foreground)]">Total Tokens</p>
      <p class="mt-1 text-2xl font-bold text-[var(--foreground)]">{totalTokens.toLocaleString()}</p>
    </div>
    <div class="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
      <p class="text-sm text-[var(--muted-foreground)]">Models Used</p>
      <p class="mt-1 text-2xl font-bold text-[var(--foreground)]">{modelData.length}</p>
    </div>
  </div>

  {#if loading}
    <div class="h-48 animate-pulse rounded-lg bg-[var(--card)]"></div>
  {:else if modelData.length === 0}
    <div class="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] py-20">
      <p class="text-sm text-[var(--muted-foreground)]">No model data for this time range</p>
    </div>
  {:else}
    <!-- Pie chart -->
    <div class="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
      <PieChart data={chartData} title="Cost Distribution by Model" />
    </div>

    <!-- Table -->
    <div class="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
      <table class="w-full text-left text-sm">
        <thead class="border-b border-[var(--border)] bg-[var(--accent)]/50">
          <tr>
            <th class="px-4 py-3 text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">Model</th>
            <th class="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">Prompt Tokens</th>
            <th class="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">Completion Tokens</th>
            <th class="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">Total</th>
            <th class="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">Est. Cost</th>
            <th class="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">Traces</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-[var(--border)]">
          {#each modelData as model (model.model)}
            <tr class="transition-colors hover:bg-[var(--primary)]/5">
              <td class="px-4 py-3.5 font-medium text-[var(--foreground)]">{model.model}</td>
              <td class="px-4 py-3.5 text-right tabular-nums text-[var(--muted-foreground)]">{model.promptTokens.toLocaleString()}</td>
              <td class="px-4 py-3.5 text-right tabular-nums text-[var(--muted-foreground)]">{model.completionTokens.toLocaleString()}</td>
              <td class="px-4 py-3.5 text-right tabular-nums text-[var(--foreground)]">{model.totalTokens.toLocaleString()}</td>
              <td class="px-4 py-3.5 text-right font-mono text-xs text-[var(--foreground)]">${model.estimatedCost.toFixed(4)}</td>
              <td class="px-4 py-3.5 text-right tabular-nums text-[var(--muted-foreground)]">{model.traces}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
