<script lang="ts">
  import { goto } from "$app/navigation";
  import { getTraces, type Trace } from "$lib/api";
  import { formatDuration, timeAgo } from "$lib/utils";
  import StatusBadge from "$lib/components/StatusBadge.svelte";
  import Pagination from "$lib/components/Pagination.svelte";

  let traces = $state<Trace[]>([]);
  let total = $state(0);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let workflowFilter = $state("");
  let agentFilter = $state("");
  let statusFilter = $state("");
  let page = $state(1);
  const perPage = 25;

  async function load(silent = false) {
    try {
      if (!silent) loading = true;
      error = null;
      const params: Record<string, string | number> = { limit: perPage, offset: (page - 1) * perPage };
      if (workflowFilter) params.workflow = workflowFilter;
      if (agentFilter) params.agent = agentFilter;
      if (statusFilter) params.status = statusFilter;
      const result = await getTraces(params as any);
      traces = result.traces;
      total = result.total;
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load traces";
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    workflowFilter;
    agentFilter;
    statusFilter;
    page = 1;
    load();
  });

  $effect(() => {
    const interval = setInterval(() => load(true), 15_000);
    return () => clearInterval(interval);
  });

  function durationColor(ms: number): string {
    if (ms < 1000) return "text-[var(--color-success)]";
    if (ms < 5000) return "text-[var(--color-warning)]";
    return "text-[var(--color-danger)]";
  }
</script>

<svelte:head><title>Traces | HiAi Observe</title></svelte:head>

<div class="p-6 max-w-[1400px] mx-auto space-y-6">
  <!-- Header -->
  <div class="flex items-end justify-between">
    <div>
      <h1 class="text-2xl font-bold text-[var(--color-text-primary)]">Traces</h1>
      <p class="mt-1 text-sm text-[var(--color-text-muted)]">{total} total traces</p>
    </div>
  </div>

  <!-- Error banner -->
  {#if error}
    <div class="flex items-center gap-3 rounded-lg border border-[var(--color-danger)]/50 bg-[var(--color-danger-bg)] px-4 py-3 text-sm text-[var(--color-danger)]">
      <svg class="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <span class="flex-1">{error}</span>
      <button type="button" onclick={() => load()} class="rounded border border-[var(--color-danger)]/50 px-2.5 py-1 text-xs text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)] transition-colors">Retry</button>
    </div>
  {/if}

  <!-- Filters bar -->
  <div class="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-3">
    <div class="relative flex-1 min-w-[180px] max-w-xs">
      <svg class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input
        type="text"
        placeholder="Workflow name..."
        bind:value={workflowFilter}
        class="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-overlay)] py-2 pl-9 pr-3 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] transition-colors focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]/30"
      />
    </div>
    <div class="relative flex-1 min-w-[180px] max-w-xs">
      <svg class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
      <input
        type="text"
        placeholder="Agent name..."
        bind:value={agentFilter}
        class="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-overlay)] py-2 pl-9 pr-3 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] transition-colors focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]/30"
      />
    </div>
    <select
      bind:value={statusFilter}
      class="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-overlay)] px-3 py-2 text-sm text-[var(--color-text-primary)] transition-colors focus:border-[var(--color-accent)] focus:outline-none"
    >
      <option value="">All statuses</option>
      <option value="ok">OK</option>
      <option value="error">Error</option>
    </select>
    {#if workflowFilter || agentFilter || statusFilter}
      <button type="button"
        onclick={() => { workflowFilter = ""; agentFilter = ""; statusFilter = ""; }}
        class="rounded-lg px-3 py-2 text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-overlay)] transition-colors"
      >
        Clear filters
      </button>
    {/if}
  </div>

  <!-- Content -->
  {#if loading}
    <div class="space-y-2">
      {#each Array(8) as _, i (i)}
        <div class="h-14 animate-pulse rounded-lg bg-[var(--color-surface-raised)]" style="opacity: {1 - i * 0.1}"></div>
      {/each}
    </div>
  {:else if traces.length === 0}
    <div class="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-raised)] py-20">
      <svg class="mb-4 h-12 w-12 text-[var(--color-text-muted)] opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"/></svg>
      <p class="text-sm font-medium text-[var(--color-text-secondary)]">No traces found</p>
      <p class="mt-1 text-xs text-[var(--color-text-muted)]">
        {#if workflowFilter || agentFilter || statusFilter}
          Try adjusting your filters
        {:else}
          Traces will appear here when your agents send telemetry data
        {/if}
      </p>
    </div>
  {:else}
    <div class="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)]">
      <table class="w-full text-left text-sm">
        <thead class="border-b border-[var(--color-border)] bg-[var(--color-surface-overlay)]/50">
          <tr>
            <th class="px-4 py-3 font-medium text-[var(--color-text-muted)] text-xs uppercase tracking-wider">Trace ID</th>
            <th class="px-4 py-3 font-medium text-[var(--color-text-muted)] text-xs uppercase tracking-wider">Workflow</th>
            <th class="px-4 py-3 font-medium text-[var(--color-text-muted)] text-xs uppercase tracking-wider">Agent</th>
            <th class="px-4 py-3 font-medium text-[var(--color-text-muted)] text-xs uppercase tracking-wider text-right">Duration</th>
            <th class="px-4 py-3 font-medium text-[var(--color-text-muted)] text-xs uppercase tracking-wider text-right">Tokens</th>
            <th class="px-4 py-3 font-medium text-[var(--color-text-muted)] text-xs uppercase tracking-wider">Status</th>
            <th class="px-4 py-3 font-medium text-[var(--color-text-muted)] text-xs uppercase tracking-wider">Time</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-[var(--color-border)]">
          {#each traces as trace (trace.id)}
            <tr
              class="cursor-pointer transition-colors hover:bg-[var(--color-accent)]/5 group"
              role="link"
              tabindex="0"
              onclick={() => goto(`/traces/${trace.id}`)}
              onkeydown={(e) => { if (e.key === 'Enter') goto(`/traces/${trace.id}`); }}
            >
              <td class="px-4 py-3.5">
                <code class="rounded bg-[var(--color-surface-overlay)] px-1.5 py-0.5 text-xs font-mono text-[var(--color-text-muted)] group-hover:text-[var(--color-accent)] transition-colors">{trace.trace_id.slice(0, 12)}...</code>
              </td>
              <td class="px-4 py-3.5 font-medium text-[var(--color-text-primary)]">{trace.workflow || trace.name}</td>
              <td class="px-4 py-3.5 text-[var(--color-text-secondary)]">{trace.agent || "-"}</td>
              <td class="px-4 py-3.5 text-right font-mono text-xs {durationColor(trace.duration_ms)}">{formatDuration(trace.duration_ms)}</td>
              <td class="px-4 py-3.5 text-right tabular-nums text-[var(--color-text-secondary)]">{trace.tokens_used != null ? trace.tokens_used.toLocaleString() : "-"}</td>
              <td class="px-4 py-3.5">
                <StatusBadge status={trace.status} size="sm" />
              </td>
              <td class="px-4 py-3.5 text-xs text-[var(--color-text-muted)]">{timeAgo(trace.start_time)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <Pagination {page} {perPage} {total} onPageChange={(p) => { page = p; load(); }} />
  {/if}
</div>
