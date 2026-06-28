<script lang="ts">
import { getProjects, getTraces, type Trace } from "$lib/api";
import BarChart from "$lib/components/BarChart.svelte";
import { formatDuration, timeAgo } from "$lib/utils";

let traces = $state<Trace[]>([]);
let total = $state(0);
let loading = $state(true);
let error = $state<string | null>(null);
let timeRange = $state("24h");

const CHART_COLORS = [
  "var(--primary)",
  "var(--success)",
  "var(--warning)",
  "var(--destructive)",
  "var(--violet)",
  "#06b6d4",
  "#f97316",
];

function getTimeFrom(): string {
  const now = Date.now();
  const ranges: Record<string, number> = {
    "1h": 3600000,
    "6h": 21600000,
    "24h": 86400000,
    "7d": 604800000,
    "30d": 2592000000,
  };
  return new Date(now - (ranges[timeRange] || 86400000)).toISOString();
}

async function load(silent = false) {
  try {
    if (!silent) loading = true;
    error = null;
    const result = await getTraces({ limit: 200, from: getTimeFrom() } as any);
    traces = result.traces || [];
    total = result.total;
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

interface AgentRow {
  name: string;
  traces: number;
  totalTokens: number;
  avgLatency: number;
  successRate: number;
  lastActive: string;
}

const agentData = $derived.by(() => {
  const map = new Map<
    string,
    { traces: number; tokens: number; latencies: number[]; successes: number; lastActive: string }
  >();
  for (const t of traces) {
    const name = t.agent || t.workflow || t.name || "unknown";
    const entry = map.get(name) || {
      traces: 0,
      tokens: 0,
      latencies: [],
      successes: 0,
      lastActive: t.start_time,
    };
    entry.traces++;
    entry.tokens += t.tokens_used || 0;
    entry.latencies.push(t.duration_ms || 0);
    if (t.status === "ok") entry.successes++;
    if (t.start_time > entry.lastActive) entry.lastActive = t.start_time;
    map.set(name, entry);
  }
  const rows: AgentRow[] = [];
  for (const [name, v] of map) {
    rows.push({
      name,
      traces: v.traces,
      totalTokens: v.tokens,
      avgLatency:
        v.latencies.length > 0
          ? Math.round(v.latencies.reduce((a, b) => a + b, 0) / v.latencies.length)
          : 0,
      successRate: v.traces > 0 ? Math.round((v.successes / v.traces) * 100) : 0,
      lastActive: v.lastActive,
    });
  }
  return rows.sort((a, b) => b.traces - a.traces);
});

const chartData = $derived(
  agentData.slice(0, 7).map((a, i) => ({
    label: (a.name ?? "").slice(0, 16),
    value: a.totalTokens,
    color: CHART_COLORS[i % CHART_COLORS.length],
  })),
);

function rateColor(rate: number): string {
  if (rate >= 95) return "var(--success)";
  if (rate >= 80) return "var(--warning)";
  return "var(--destructive)";
}
</script>

<svelte:head><title>Agent Analytics | HiAi Observe</title></svelte:head>

<div class="space-y-6">
  <div class="flex items-end justify-between">
    <div>
      <h1 class="text-2xl font-bold text-[var(--foreground)]">Agent Analytics</h1>
      <p class="mt-1 text-sm text-[var(--muted-foreground)]">{total} traces across {agentData.length} agents</p>
    </div>
    <div class="flex gap-1">
      {#each ["1h", "6h", "24h", "7d", "30d"] as range (range)}
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

  {#if loading}
    <div class="h-48 animate-pulse rounded-lg bg-[var(--card)]"></div>
  {:else if agentData.length === 0}
    <div class="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] py-20">
      <p class="text-sm text-[var(--muted-foreground)]">No agent data for this time range</p>
    </div>
  {:else}
    <!-- Chart -->
    <div class="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
      <BarChart data={chartData} title="Token Usage by Agent" />
    </div>

    <!-- Table -->
    <div class="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
      <table class="w-full text-left text-sm">
        <thead class="border-b border-[var(--border)] bg-[var(--accent)]/50">
          <tr>
            <th class="px-4 py-3 text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">Agent</th>
            <th class="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">Traces</th>
            <th class="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">Total Tokens</th>
            <th class="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">Avg Latency</th>
            <th class="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">Success Rate</th>
            <th class="px-4 py-3 text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">Last Active</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-[var(--border)]">
          {#each agentData as agent (agent.name)}
            <tr class="transition-colors hover:bg-[var(--primary)]/5">
              <td class="px-4 py-3.5 font-medium text-[var(--foreground)]">{agent.name}</td>
              <td class="px-4 py-3.5 text-right tabular-nums text-[var(--muted-foreground)]">{agent.traces}</td>
              <td class="px-4 py-3.5 text-right tabular-nums text-[var(--muted-foreground)]">{agent.totalTokens.toLocaleString()}</td>
              <td class="px-4 py-3.5 text-right font-mono text-xs text-[var(--muted-foreground)]">{formatDuration(agent.avgLatency)}</td>
              <td class="px-4 py-3.5 text-right">
                <span class="inline-flex items-center gap-1.5">
                  <span class="h-2 w-2 rounded-full" style="background: {rateColor(agent.successRate)}"></span>
                  <span class="tabular-nums text-[var(--muted-foreground)]">{agent.successRate}%</span>
                </span>
              </td>
              <td class="px-4 py-3.5 text-xs text-[var(--muted-foreground)]">{timeAgo(agent.lastActive)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
