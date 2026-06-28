<script lang="ts">
import { type DashboardData, getDashboard } from "$lib/api";
import LiveIndicator from "$lib/components/LiveIndicator.svelte";
import { wsManager } from "$lib/ws";

let data = $state<DashboardData | null>(null);
let error = $state<string | null>(null);
let loading = $state(true);
let lastUpdated = $state<Date | null>(null);
let connected = $state(false);
let flashError = $state(false);

const maxErrorCount = $derived(
  data?.errorBuckets ? Math.max(...data.errorBuckets.map((b) => b.count), 1) : 1,
);
const maxTraceCount = $derived(
  data?.traceBuckets ? Math.max(...data.traceBuckets.map((b) => b.count), 1) : 1,
);

async function load() {
  try {
    loading = true;
    data = await getDashboard();
    error = null;
    lastUpdated = new Date();
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load dashboard";
  } finally {
    loading = false;
  }
}

function onWsMessage(msgData: unknown) {
  const msg = msgData as { type?: string };
  if (msg?.type === "new_error" || msg?.type === "event") {
    flashError = true;
    setTimeout(() => {
      flashError = false;
    }, 600);
    load();
  }
}

$effect(() => {
  load();
  const interval = setInterval(load, 15_000);

  wsManager.connect("/ws/logs");
  const unsub = wsManager.subscribe("*", onWsMessage);
  const connInterval = setInterval(() => {
    connected = wsManager.connected;
  }, 1000);

  return () => {
    clearInterval(interval);
    unsub();
    wsManager.disconnect("/ws/logs");
    clearInterval(connInterval);
  };
});

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}
</script>

<svelte:head><title>Dashboard | HiAi Observe</title></svelte:head>

<div class="space-y-6">
  <!-- Page header -->
  <div class="flex items-center justify-between">
    <h1 class="text-2xl font-bold text-[var(--foreground)]">Dashboard</h1>
    <div class="flex items-center gap-3">
      <LiveIndicator {connected} />
      {#if lastUpdated}
        <span class="text-xs text-[var(--muted-foreground)]">
          Updated {timeAgo(lastUpdated)}
        </span>
      {/if}
    </div>
  </div>

  <!-- Sparkline row -->
  {#if data && (data.errorBuckets?.length || data.traceBuckets?.length)}
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <!-- Error rate sparkline (24h) -->
      {#if data.errorBuckets?.length}
        <div class="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
          <div class="mb-2 flex items-center justify-between">
            <span class="text-sm font-medium text-[var(--muted-foreground)]">Error rate (24h)</span>
            <span class="text-xs text-[var(--muted-foreground)]">hourly</span>
          </div>
          <div class="sparkline-row" role="img" aria-label="Error rate sparkline for last 24 hours">
            {#each data.errorBuckets as bucket (bucket.hour)}
              <div class="sparkline-bar-group" title="{new Date(bucket.hour).getHours()}:00 — {bucket.count} errors">
                <div
                  class="sparkline-bar sparkline-error"
                  style="height: {Math.max((bucket.count / maxErrorCount) * 100, bucket.count > 0 ? 8 : 0)}%"
                ></div>
              </div>
            {/each}
          </div>
          <div class="mt-1 flex justify-between text-[10px] text-[var(--muted-foreground)]">
            <span>24h ago</span>
            <span>now</span>
          </div>
        </div>
      {/if}

      <!-- Trace count sparkline (24h) -->
      {#if data.traceBuckets?.length}
        <div class="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
          <div class="mb-2 flex items-center justify-between">
            <span class="text-sm font-medium text-[var(--muted-foreground)]">Trace volume (24h)</span>
            <span class="text-xs text-[var(--muted-foreground)]">hourly</span>
          </div>
          <div class="sparkline-row" role="img" aria-label="Trace volume sparkline for last 24 hours">
            {#each data.traceBuckets as bucket (bucket.hour)}
              <div class="sparkline-bar-group" title="{new Date(bucket.hour).getHours()}:00 — {bucket.count} traces">
                <div
                  class="sparkline-bar sparkline-violet"
                  style="height: {Math.max((bucket.count / maxTraceCount) * 100, bucket.count > 0 ? 8 : 0)}%"
                ></div>
              </div>
            {/each}
          </div>
          <div class="mt-1 flex justify-between text-[10px] text-[var(--muted-foreground)]">
            <span>24h ago</span>
            <span>now</span>
          </div>
        </div>
      {/if}
    </div>
  {/if}

  {#if loading && !data}
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {#each Array(4) as _}
        <div class="h-28 animate-pulse rounded-lg border border-[var(--border)] bg-[var(--card)]"></div>
      {/each}
    </div>
  {:else if error}
    <div class="flex items-center gap-3 rounded-lg border border-[var(--destructive)] bg-[color-mix(in_oklch,var(--destructive)_18%,transparent)] px-4 py-3 text-sm text-[var(--destructive)]">
      <svg class="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <span class="flex-1">Error loading dashboard: {error}</span>
      <button type="button" onclick={() => load()} class="rounded border border-[var(--destructive)] px-2.5 py-1 text-xs hover:bg-[color-mix(in_oklch,var(--destructive)_18%,transparent)] transition-colors">Retry</button>
    </div>
  {:else if data}
    <!-- Metric cards -->
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <!-- Errors 24h -->
      <a href="/issues" class="group rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm transition-all hover:shadow-md hover:border-[var(--destructive)]"
         class:flash-error={flashError}>
        <div class="flex items-center justify-between">
          <span class="text-sm font-medium text-[var(--muted-foreground)]">Errors (24h)</span>
          <svg class="h-5 w-5 text-[var(--destructive)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <p class="mt-2 text-3xl font-bold text-[var(--destructive)]">{data.errorCount24h}</p>
        <p class="mt-1 text-xs text-[var(--muted-foreground)]">across all projects</p>
      </a>

      <!-- Uptime -->
      <a href="/uptime" class="group rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm transition-all hover:shadow-md hover:border-[var(--success)]">
        <div class="flex items-center justify-between">
          <span class="text-sm font-medium text-[var(--muted-foreground)]">Uptime</span>
          <svg class="h-5 w-5 text-[var(--success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p class="mt-2 text-3xl font-bold text-[var(--success)]">{data.uptimePercent.toFixed(1)}%</p>
        <p class="mt-1 text-xs text-[var(--muted-foreground)]">all monitors</p>
      </a>

      <!-- Containers -->
      <a href="/infrastructure" class="group rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm transition-all hover:shadow-md hover:border-[var(--info)]">
        <div class="flex items-center justify-between">
          <span class="text-sm font-medium text-[var(--muted-foreground)]">Containers</span>
          <svg class="h-5 w-5 text-[var(--info)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
        </div>
        <p class="mt-2 text-3xl font-bold text-[var(--info)]">{data.activeContainers}</p>
        <p class="mt-1 text-xs text-[var(--muted-foreground)]">running</p>
      </a>

      <!-- Traces 24h -->
      <a href="/traces" class="group rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm transition-all hover:shadow-md hover:border-[var(--violet)]">
        <div class="flex items-center justify-between">
          <span class="text-sm font-medium text-[var(--muted-foreground)]">Traces (24h)</span>
          <svg class="h-5 w-5 text-[var(--violet)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <p class="mt-2 text-3xl font-bold text-[var(--violet)]">{data.traceCount24h}</p>
        <p class="mt-1 text-xs text-[var(--muted-foreground)]">workflows + tools</p>
      </a>
    </div>

    <!-- Middle row: Issues (2/3) + Monitors (1/3) -->
    <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <!-- Recent issues -->
      <div class="lg:col-span-2 rounded-lg border border-[var(--border)] bg-[var(--card)]">
        <div class="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <h2 class="text-base font-semibold text-[var(--foreground)]">Recent Issues</h2>
          <a href="/issues" class="text-xs font-medium text-[var(--primary)] hover:text-[var(--primary-hover)]">View all</a>
        </div>
        <div class="p-4">
          {#if (data.recentIssues ?? []).length === 0}
            <p class="py-8 text-center text-sm text-[var(--muted-foreground)]">No issues found</p>
          {:else}
            <div class="space-y-2">
              {#each data.recentIssues as issue (issue.id)}
                <a href="/issues/{issue.id}" class="flex items-center justify-between rounded-md border border-[var(--border)] p-3 transition-colors hover:bg-[var(--accent)]/50">
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-sm font-medium text-[var(--foreground)]">{issue.title}</p>
                    <p class="mt-0.5 text-xs text-[var(--muted-foreground)]">
                      {issue.type} &middot; {issue.count} occurrences
                    </p>
                  </div>
                  <span class="ml-3 shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium"
                    style="background: {issue.status === 'unresolved' ? 'color-mix(in oklch, var(--destructive) 18%, transparent)' : issue.status === 'resolved' ? 'color-mix(in oklch, var(--success) 18%, transparent)' : 'var(--accent)'}; color: {issue.status === 'unresolved' ? 'var(--destructive)' : issue.status === 'resolved' ? 'var(--success)' : 'var(--muted-foreground)'}">
                    {issue.status}
                  </span>
                </a>
              {/each}
            </div>
          {/if}
        </div>
      </div>

      <!-- Monitor statuses -->
      <div class="rounded-lg border border-[var(--border)] bg-[var(--card)]">
        <div class="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <h2 class="text-base font-semibold text-[var(--foreground)]">Monitors</h2>
          <a href="/uptime" class="text-xs font-medium text-[var(--primary)] hover:text-[var(--primary-hover)]">View all</a>
        </div>
        <div class="p-4">
          {#if (data.monitorStatuses ?? []).length === 0}
            <p class="py-8 text-center text-sm text-[var(--muted-foreground)]">No monitors</p>
          {:else}
            <div class="space-y-2">
              {#each (data.monitorStatuses ?? []) as monitor (monitor.name)}
                <div class="flex items-center gap-3 rounded-md border border-[var(--border)] p-3">
                  <span class="h-2.5 w-2.5 shrink-0 rounded-full" style="background: {monitor.isUp ? 'var(--success)' : 'var(--destructive)'}"></span>
                  <span class="flex-1 truncate text-sm text-[var(--muted-foreground)]">{monitor.name}</span>
                  <span class="text-xs font-medium" style="color: {monitor.isUp ? 'var(--success)' : 'var(--destructive)'}">{monitor.isUp ? "up" : "down"}</span>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  @keyframes flash-border {
    0% { border-color: var(--destructive); box-shadow: 0 0 0 3px color-mix(in oklch, var(--destructive) 18%, transparent); }
    100% { border-color: var(--border); box-shadow: none; }
  }

  .flash-error {
    animation: flash-border 0.6s ease-out;
  }

  @media (prefers-reduced-motion: reduce) {
    .flash-error {
      animation: none;
      border-color: var(--destructive);
    }
  }

  /* Sparkline CSS-only bars */
  .sparkline-row {
    display: flex;
    align-items: flex-end;
    gap: 3px;
    height: 56px;
  }

  .sparkline-bar-group {
    flex: 1;
    display: flex;
    align-items: flex-end;
    height: 100%;
    cursor: default;
  }

  .sparkline-bar {
    width: 100%;
    border-radius: 2px 2px 0 0;
    min-height: 0;
    transition: height 0.3s ease;
  }

  .sparkline-error {
    background: var(--destructive);
    opacity: 0.75;
  }

  .sparkline-error:hover {
    opacity: 1;
  }

  .sparkline-violet {
    background: var(--violet);
    opacity: 0.75;
  }

  .sparkline-violet:hover {
    opacity: 1;
  }

  @media (prefers-reduced-motion: reduce) {
    .sparkline-bar {
      transition: none;
    }
  }
</style>
