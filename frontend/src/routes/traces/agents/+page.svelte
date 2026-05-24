<script lang="ts">
  import { getTraces, getProjects, type Trace } from "$lib/api";
  import { formatDuration, timeAgo } from "$lib/utils";
  import BarChart from "$lib/components/BarChart.svelte";

  let traces = $state<Trace[]>([]);
  let total = $state(0);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let timeRange = $state("24h");

  const CHART_COLORS = [
    "var(--color-accent)", "var(--color-success)", "var(--color-warning)",
    "var(--color-danger)", "var(--color-violet)", "#06b6d4", "#f97316",
  ];

  function getTimeFrom(): string {
    const now = Date.now();
    const ranges: Record<string, number> = {
      "1h": 3600000, "6h": 21600000, "24h": 86400000,
      "7d": 604800000, "30d": 2592000000,
    };
    return new Date(now - (ranges[timeRange] || 86400000)).toISOString();
  }

  async function load() {
    try {
      loading = true;
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

  $effect(() => { timeRange; load(); });

  interface AgentRow {
    name: string;
    traces: number;
    totalTokens: number;
    avgLatency: number;
    successRate: number;
    lastActive: string;
  }

  const agentData = $derived.by(() => {
    const map = new Map<string, { traces: number; tokens: number; latencies: number[]; successes: number; lastActive: string }>();
    for (const t of traces) {
      const name = t.agent || t.workflow || t.name || "unknown";
      const entry = map.get(name) || { traces: 0, tokens: 0, latencies: [], successes: 0, lastActive: t.start_time };
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
        avgLatency: v.latencies.length > 0 ? Math.round(v.latencies.reduce((a, b) => a + b, 0) / v.latencies.length) : 0,
        successRate: v.traces > 0 ? Math.round((v.successes / v.traces) * 100) : 0,
        lastActive: v.lastActive,
      });
    }
    return rows.sort((a, b) => b.traces - a.traces);
  });

  const chartData = $derived(
    agentData.slice(0, 7).map((a, i) => ({
      label: a.name.slice(0, 16),
      value: a.totalTokens,
      color: CHART_COLORS[i % CHART_COLORS.length],
    }))
  );

  function rateColor(rate: number): string {
    if (rate >= 95) return "var(--color-success)";
    if (rate >= 80) return "var(--color-warning)";
    return "var(--color-danger)";
  }
</script>

<svelte:head><title>Agent Analytics | HiAi Observe</title></svelte:head>

<div class="space-y-6">
  <div class="flex items-end justify-between">
    <div>
      <h1 class="text-2xl font-bold text-[var(--color-text-primary)]">Agent Analytics</h1>
      <p class="mt-1 text-sm text-[var(--color-text-muted)]">{total} traces across {agentData.length} agents</p>
    </div>
    <div class="flex gap-1">
      {#each ["1h", "6h", "24h", "7d", "30d"] as range (range)}
        <button
          onclick={() => timeRange = range}
          class="rounded-md px-3 py-1.5 text-xs font-medium transition-colors {timeRange === range ? 'bg-[var(--color-accent)] text-white' : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-overlay)]'}"
        >{range}</button>
      {/each}
    </div>
  </div>

  {#if error}
    <div class="flex items-center gap-3 rounded-lg border border-[var(--color-danger)]/50 bg-[var(--color-danger-bg)] px-4 py-3 text-sm text-[var(--color-danger)]">
      <span class="flex-1">{error}</span>
      <button onclick={() => load()} class="rounded border border-[var(--color-danger)]/50 px-2.5 py-1 text-xs hover:bg-[var(--color-danger-bg)]">Retry</button>
    </div>
  {/if}

  {#if loading}
    <div class="h-48 animate-pulse rounded-lg bg-[var(--color-surface-raised)]"></div>
  {:else if agentData.length === 0}
    <div class="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--color-border)] py-20">
      <p class="text-sm text-[var(--color-text-muted)]">No agent data for this time range</p>
    </div>
  {:else}
    <!-- Chart -->
    <div class="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-5">
      <BarChart data={chartData} title="Token Usage by Agent" />
    </div>

    <!-- Table -->
    <div class="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)]">
      <table class="w-full text-left text-sm">
        <thead class="border-b border-[var(--color-border)] bg-[var(--color-surface-overlay)]/50">
          <tr>
            <th class="px-4 py-3 text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">Agent</th>
            <th class="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">Traces</th>
            <th class="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">Total Tokens</th>
            <th class="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">Avg Latency</th>
            <th class="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">Success Rate</th>
            <th class="px-4 py-3 text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">Last Active</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-[var(--color-border)]">
          {#each agentData as agent (agent.name)}
            <tr class="transition-colors hover:bg-[var(--color-accent)]/5">
              <td class="px-4 py-3.5 font-medium text-[var(--color-text-primary)]">{agent.name}</td>
              <td class="px-4 py-3.5 text-right tabular-nums text-[var(--color-text-secondary)]">{agent.traces}</td>
              <td class="px-4 py-3.5 text-right tabular-nums text-[var(--color-text-secondary)]">{agent.totalTokens.toLocaleString()}</td>
              <td class="px-4 py-3.5 text-right font-mono text-xs text-[var(--color-text-secondary)]">{formatDuration(agent.avgLatency)}</td>
              <td class="px-4 py-3.5 text-right">
                <span class="inline-flex items-center gap-1.5">
                  <span class="h-2 w-2 rounded-full" style="background: {rateColor(agent.successRate)}"></span>
                  <span class="tabular-nums text-[var(--color-text-secondary)]">{agent.successRate}%</span>
                </span>
              </td>
              <td class="px-4 py-3.5 text-xs text-[var(--color-text-muted)]">{timeAgo(agent.lastActive)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
