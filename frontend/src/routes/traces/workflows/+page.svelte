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

$effect(() => {
  timeRange;
  load();
});

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
  const map = new Map<
    string,
    { runs: number; successes: number; durations: number[]; lastRun: string }
  >();
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
      avgDuration:
        sorted.length > 0 ? Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length) : 0,
      durations: sorted,
      lastRun: v.lastRun,
    });
  }
  return rows.sort((a, b) => b.runs - a.runs);
});

function rateColor(rate: number): string {
  if (rate >= 95) return "var(--success)";
  if (rate >= 80) return "var(--warning)";
  return "var(--destructive)";
}
</script>

<svelte:head><title>Workflow Analytics | HiAi Observe</title></svelte:head>

<div class="space-y-6">
  <div class="flex items-end justify-between">
    <div>
      <h1 class="text-2xl font-bold text-[var(--foreground)]">Workflow Analytics</h1>
      <p class="mt-1 text-sm text-[var(--muted-foreground)]">{total} traces across {workflowData.length} workflows</p>
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

  {#if loading}
    <div class="h-48 animate-pulse rounded-lg bg-[var(--card)]"></div>
  {:else if workflowData.length === 0}
    <div class="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] py-20">
      <p class="text-sm text-[var(--muted-foreground)]">No workflow data for this time range</p>
    </div>
  {:else}
    <div class="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
      <table class="w-full text-left text-sm">
        <thead class="border-b border-[var(--border)] bg-[var(--accent)]/50">
          <tr>
            <th class="px-4 py-3 text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">Workflow</th>
            <th class="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">Runs</th>
            <th class="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">Success Rate</th>
            <th class="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">Avg Duration</th>
            <th class="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">p50</th>
            <th class="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">p95</th>
            <th class="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">p99</th>
            <th class="px-4 py-3 text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">Last Run</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-[var(--border)]">
          {#each workflowData as wf (wf.name)}
            <tr class="transition-colors hover:bg-[var(--primary)]/5">
              <td class="px-4 py-3.5 font-medium text-[var(--foreground)]">{wf.name}</td>
              <td class="px-4 py-3.5 text-right tabular-nums text-[var(--muted-foreground)]">{wf.runs}</td>
              <td class="px-4 py-3.5 text-right">
                <span class="inline-flex items-center gap-1.5">
                  <span class="h-2 w-2 rounded-full" style="background: {rateColor(wf.successRate)}"></span>
                  <span class="tabular-nums" style="color: {rateColor(wf.successRate)}">{wf.successRate}%</span>
                </span>
              </td>
              <td class="px-4 py-3.5 text-right font-mono text-xs text-[var(--muted-foreground)]">{formatDuration(wf.avgDuration)}</td>
              <td class="px-4 py-3.5 text-right font-mono text-xs text-[var(--muted-foreground)]">{formatDuration(percentile(wf.durations, 50))}</td>
              <td class="px-4 py-3.5 text-right font-mono text-xs text-[var(--muted-foreground)]">{formatDuration(percentile(wf.durations, 95))}</td>
              <td class="px-4 py-3.5 text-right font-mono text-xs text-[var(--muted-foreground)]">{formatDuration(percentile(wf.durations, 99))}</td>
              <td class="px-4 py-3.5 text-xs text-[var(--muted-foreground)]">{timeAgo(wf.lastRun)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
