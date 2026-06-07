<script lang="ts">
  import { getTraces, type Trace } from "$lib/api";
  import { formatDuration, timeAgo } from "$lib/utils";

  let traces = $state<Trace[]>([]);
  let total = $state(0);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let timeRange = $state("7d");

  function getTimeFrom(): string {
    const now = Date.now();
    const ranges: Record<string, number> = { "24h": 86400000, "7d": 604800000, "30d": 2592000000 };
    return new Date(now - (ranges[timeRange] || 604800000)).toISOString();
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

  $effect(() => { timeRange; load(); });

  $effect(() => {
    const interval = setInterval(() => load(true), 15_000);
    return () => clearInterval(interval);
  });

  interface WorkflowRow {
    name: string;
    runs: number;
    successes: number;
    successRate: number;
    avgDuration: number;
    durations: number[];
    lastRun: string;
  }

  function percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)] ?? 0;
  }

  const workflowData = $derived.by(() => {
    const map = new Map<string, { runs: number; successes: number; durations: number[]; lastRun: string }>();
    for (const t of traces) {
      const name = (t as any).workflow || t.name || "unknown";
      const entry = map.get(name) || { runs: 0, successes: 0, durations: [], lastRun: t.start_time };
      entry.runs++;
      entry.durations.push(t.duration_ms || 0);
      if (t.status === "ok") entry.successes++;
      if (t.start_time > entry.lastRun) entry.lastRun = t.start_time;
      map.set(name, entry);
    }

    const rows: WorkflowRow[] = [];
    for (const [name, v] of map) {
      const sorted = [...v.durations].sort((a, b) => a - b);
      rows.push({
        name,
        runs: v.runs,
        successes: v.successes,
        successRate: v.runs > 0 ? Math.round((v.successes / v.runs) * 100) : 0,
        avgDuration: sorted.length > 0 ? Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length) : 0,
        durations: sorted,
        lastRun: v.lastRun,
      });
    }
    return rows.sort((a, b) => b.runs - a.runs);
  });

  function rateColor(rate: number): string {
    if (rate >= 95) return "var(--color-success)";
    if (rate >= 80) return "var(--color-warning)";
    return "var(--color-danger)";
  }
</script>

<svelte:head><title>Workflow Analytics | HiAi Observe</title></svelte:head>

<div class="space-y-6">
  <div class="flex items-end justify-between">
    <div>
      <h1 class="text-2xl font-bold text-[var(--color-text-primary)]">Workflow Analytics</h1>
      <p class="mt-1 text-sm text-[var(--color-text-muted)]">{total} traces across {workflowData.length} workflows</p>
    </div>
    <div class="flex gap-1">
      {#each ["24h", "7d", "30d"] as range (range)}
        <button type="button"
          onclick={() => timeRange = range}
          class="rounded-md px-3 py-1.5 text-xs font-medium transition-colors {timeRange === range ? 'bg-[var(--color-accent)] text-white' : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-overlay)]'}"
        >{range}</button>
      {/each}
    </div>
  </div>

  {#if error}
    <div class="flex items-center gap-3 rounded-lg border border-[var(--color-danger)]/50 bg-[var(--color-danger-bg)] px-4 py-3 text-sm text-[var(--color-danger)]">
      <span class="flex-1">{error}</span>
      <button type="button" onclick={() => load()} class="rounded border border-[var(--color-danger)]/50 px-2.5 py-1 text-xs hover:bg-[var(--color-danger-bg)]">Retry</button>
    </div>
  {/if}

  {#if loading}
    <div class="h-48 animate-pulse rounded-lg bg-[var(--color-surface-raised)]"></div>
  {:else if workflowData.length === 0}
    <div class="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--color-border)] py-20">
      <p class="text-sm text-[var(--color-text-muted)]">No workflow data for this time range</p>
    </div>
  {:else}
    <div class="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)]">
      <table class="w-full text-left text-sm">
        <thead class="border-b border-[var(--color-border)] bg-[var(--color-surface-overlay)]/50">
          <tr>
            <th class="px-4 py-3 text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">Workflow</th>
            <th class="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">Runs</th>
            <th class="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">Success Rate</th>
            <th class="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">Avg Duration</th>
            <th class="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">p50</th>
            <th class="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">p95</th>
            <th class="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">p99</th>
            <th class="px-4 py-3 text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">Last Run</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-[var(--color-border)]">
          {#each workflowData as wf (wf.name)}
            <tr class="transition-colors hover:bg-[var(--color-accent)]/5">
              <td class="px-4 py-3.5 font-medium text-[var(--color-text-primary)]">{wf.name}</td>
              <td class="px-4 py-3.5 text-right tabular-nums text-[var(--color-text-secondary)]">{wf.runs}</td>
              <td class="px-4 py-3.5 text-right">
                <span class="inline-flex items-center gap-1.5">
                  <span class="h-2 w-2 rounded-full" style="background: {rateColor(wf.successRate)}"></span>
                  <span class="tabular-nums" style="color: {rateColor(wf.successRate)}">{wf.successRate}%</span>
                </span>
              </td>
              <td class="px-4 py-3.5 text-right font-mono text-xs text-[var(--color-text-secondary)]">{formatDuration(wf.avgDuration)}</td>
              <td class="px-4 py-3.5 text-right font-mono text-xs text-[var(--color-text-secondary)]">{formatDuration(percentile(wf.durations, 50))}</td>
              <td class="px-4 py-3.5 text-right font-mono text-xs text-[var(--color-text-secondary)]">{formatDuration(percentile(wf.durations, 95))}</td>
              <td class="px-4 py-3.5 text-right font-mono text-xs text-[var(--color-text-secondary)]">{formatDuration(percentile(wf.durations, 99))}</td>
              <td class="px-4 py-3.5 text-xs text-[var(--color-text-muted)]">{timeAgo(wf.lastRun)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
