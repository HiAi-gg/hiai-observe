<script lang="ts">
  import { getAlertHistory, getAlerts, type AlertHistoryEntry, type AlertRule } from "$lib/api";

  let entries = $state<AlertHistoryEntry[]>([]);
  let alerts = $state<AlertRule[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let selectedAlertId = $state("");
  let expandedId = $state<string | null>(null);
  let offset = $state(0);
  let total = $state(0);
  const limit = 50;

  const timeRanges = [
    { label: "1h", ms: 3600000 },
    { label: "6h", ms: 6 * 3600000 },
    { label: "24h", ms: 24 * 3600000 },
    { label: "7d", ms: 7 * 24 * 3600000 },
    { label: "30d", ms: 30 * 24 * 3600000 },
  ];
  let selectedRange = $state("24h");

  async function load() {
    try {
      loading = true;
      error = null;
      const result = await getAlertHistory({
        alertId: selectedAlertId || undefined,
        limit,
        offset,
      });
      entries = result.items ?? [];
      total = result.total ?? 0;
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load alert history";
    } finally {
      loading = false;
    }
  }

  async function loadAlerts() {
    try {
      const result = await getAlerts();
      alerts = result.alerts ?? [];
    } catch { /* silent */ }
  }

  $effect(() => { loadAlerts(); });
  $effect(() => { load(); });

  function toggleExpand(id: string) {
    expandedId = expandedId === id ? null : id;
  }

  function statusDot(entry: AlertHistoryEntry): { color: string; label: string } {
    if (entry.resolvedAt) return { color: "var(--color-success)", label: "Resolved" };
    return { color: "var(--color-danger)", label: "Triggered" };
  }

  function timeAgo(dateStr: string): string {
    const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }

  function formatTimestamp(dateStr: string): string {
    return new Date(dateStr).toLocaleString();
  }

  const hasPrev = $derived(offset > 0);
  const hasNext = $derived(offset + limit < total);
  const page = $derived(Math.floor(offset / limit) + 1);
  const totalPages = $derived(Math.ceil(total / limit));
</script>

<svelte:head><title>Alert History | HiAi Observe</title></svelte:head>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <h1 class="text-2xl font-bold text-[var(--color-text-primary)]">Alert History</h1>
    <span class="text-sm text-[var(--color-text-muted)]">{total} events</span>
  </div>

  {#if error}
    <div class="flex items-center gap-3 rounded-lg border border-[var(--color-danger)]/50 bg-[var(--color-danger-bg)] px-4 py-3 text-sm text-[var(--color-danger)]">
      <svg class="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <span class="flex-1">{error}</span>
      <button onclick={() => load()} class="rounded border border-[var(--color-danger)]/50 px-2.5 py-1 text-xs text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)] transition-colors">Retry</button>
    </div>
  {/if}

  <!-- Filters -->
  <div class="flex flex-wrap items-center gap-3">
    <select
      bind:value={selectedAlertId}
      onchange={() => { offset = 0; load(); }}
      class="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none"
    >
      <option value="">All alerts</option>
      {#each alerts as alert (alert.id)}
        <option value={alert.id}>{alert.name}</option>
      {/each}
    </select>

    <div class="flex items-center gap-1 rounded-md border border-[var(--color-border)] p-0.5">
      {#each timeRanges as tr (tr.label)}
        <button
          onclick={() => { selectedRange = tr.label; offset = 0; load(); }}
          class="rounded px-3 py-1.5 text-xs font-medium transition-colors {selectedRange === tr.label ? 'bg-[var(--color-accent)] text-white' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-overlay)]'}"
        >{tr.label}</button>
      {/each}
    </div>
  </div>

  <!-- Table -->
  {#if loading && entries.length === 0}
    <div class="space-y-2">
      {#each Array(5) as _}
        <div class="h-16 animate-pulse rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)]"></div>
      {/each}
    </div>
  {:else if entries.length === 0}
    <div class="flex flex-col items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] py-16">
      <svg class="mb-3 h-10 w-10 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <p class="text-sm font-medium text-[var(--color-text-secondary)]">No alert events</p>
      <p class="mt-1 text-xs text-[var(--color-text-muted)]">Alerts will appear here when triggered</p>
    </div>
  {:else}
    <div class="space-y-2">
      {#each entries as entry (entry.id)}
        {@const status = statusDot(entry)}
        <div class="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)]">
          <button
            onclick={() => toggleExpand(entry.id)}
            class="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--color-surface-overlay)]/30"
          >
            <span class="h-2.5 w-2.5 shrink-0 rounded-full" style="background: {status.color}" title={status.label}></span>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium text-[var(--color-text-primary)]">
                {entry.alertName ?? entry.alertId}
              </p>
              <p class="text-xs text-[var(--color-text-muted)]">
                Triggered {timeAgo(entry.triggeredAt)}
                {#if entry.resolvedAt}
                  &middot; Resolved {timeAgo(entry.resolvedAt)}
                {/if}
              </p>
            </div>
            <span class="rounded-full px-2 py-0.5 text-xs font-medium" style="background: {status.color}20; color: {status.color}">
              {status.label}
            </span>
            <svg class="h-4 w-4 shrink-0 text-[var(--color-text-muted)] transition-transform {expandedId === entry.id ? 'rotate-180' : ''}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {#if expandedId === entry.id}
            <div class="border-t border-[var(--color-border)] px-4 py-3 space-y-2">
              <div class="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span class="text-[var(--color-text-muted)]">Triggered:</span>
                  <span class="ml-1 text-[var(--color-text-secondary)]">{formatTimestamp(entry.triggeredAt)}</span>
                </div>
                {#if entry.resolvedAt}
                  <div>
                    <span class="text-[var(--color-text-muted)]">Resolved:</span>
                    <span class="ml-1 text-[var(--color-text-secondary)]">{formatTimestamp(entry.resolvedAt)}</span>
                  </div>
                {/if}
              </div>
              {#if entry.context}
                <div>
                  <p class="mb-1 text-xs font-medium text-[var(--color-text-muted)]">Context:</p>
                  <pre class="overflow-x-auto rounded-md bg-[var(--color-surface)] p-3 text-xs text-[var(--color-text-secondary)]">{JSON.stringify(entry.context, null, 2)}</pre>
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    </div>

    <!-- Pagination -->
    {#if totalPages > 1}
      <div class="flex items-center justify-between pt-2">
        <p class="text-xs text-[var(--color-text-muted)]">
          Page {page} of {totalPages}
        </p>
        <div class="flex items-center gap-2">
          <button
            onclick={() => { offset = Math.max(0, offset - limit); load(); }}
            disabled={!hasPrev}
            class="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-overlay)] disabled:opacity-40"
          >
            Previous
          </button>
          <button
            onclick={() => { offset += limit; load(); }}
            disabled={!hasNext}
            class="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-overlay)] disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    {/if}
  {/if}
</div>
