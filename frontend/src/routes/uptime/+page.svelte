<script lang="ts">
  import { getMonitors, type Monitor } from "$lib/api";

  let monitors = $state<Monitor[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  async function load() {
    try {
      loading = true;
      error = null;
      const result = await getMonitors();
      monitors = result.monitors;
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load monitors";
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  });

  function statusDot(status?: string) {
    if (!status || status === "down") return "bg-[var(--color-danger)]";
    if (status === "degraded") return "bg-[var(--color-warning)]";
    return "bg-[var(--color-success)]";
  }

  function uptimeLabel(pct?: number) {
    if (pct === undefined) return "N/A";
    if (pct >= 99.9) return "Operational";
    if (pct >= 95) return "Degraded";
    return "Down";
  }

  function uptimeColor(pct?: number) {
    if (pct === undefined) return "text-[var(--color-text-muted)]";
    if (pct >= 99.9) return "text-[var(--color-success)]";
    if (pct >= 95) return "text-[var(--color-warning)]";
    return "text-[var(--color-danger)]";
  }
</script>

<svelte:head><title>Uptime | HiAi Observe</title></svelte:head>

<div class="space-y-4">
  <h1 class="text-2xl font-bold">Uptime Monitoring</h1>

  {#if error}
    <div class="flex items-center gap-3 rounded-lg border border-[var(--color-danger)]/50 bg-[var(--color-danger-bg)] px-4 py-3 text-sm text-[var(--color-danger)]">
      <span class="flex-1">{error}</span>
      <button onclick={() => load()} class="rounded border border-[var(--color-danger)]/50 px-2.5 py-1 text-xs text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)] transition-colors">Retry</button>
    </div>
  {/if}

  {#if loading}
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {#each Array(3) as _, i (i)}
        <div class="h-36 animate-pulse rounded-lg bg-[var(--color-surface-raised)]"></div>
      {/each}
    </div>
  {:else if monitors.length === 0}
    <div class="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-8 text-center">
      <p class="text-[var(--color-text-muted)]">No monitors configured yet.</p>
      <a href="/settings" class="mt-2 inline-block text-sm text-[var(--color-accent)] hover:underline">
        Set up monitors in Settings
      </a>
    </div>
  {:else}
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {#each monitors as monitor (monitor.id)}
        <div class="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4">
          <div class="flex items-center gap-3">
            <span class="h-2.5 w-2.5 rounded-full {statusDot(monitor.last_check ? 'up' : 'down')}"></span>
            <h3 class="font-medium">{monitor.name}</h3>
          </div>
          <p class="mt-1 truncate text-xs text-[var(--color-text-muted)]">{monitor.url}</p>

          <div class="mt-4 flex items-end justify-between">
            <div>
              <p class="text-xs text-[var(--color-text-muted)]">Uptime</p>
              <p class="text-xl font-bold {uptimeColor(monitor.uptime_percent)}">
                {monitor.uptime_percent !== undefined ? `${monitor.uptime_percent.toFixed(2)}%` : "N/A"}
              </p>
            </div>
            <span class="rounded-full px-2 py-0.5 text-xs font-medium {uptimeColor(monitor.uptime_percent)}">
              {uptimeLabel(monitor.uptime_percent)}
            </span>
          </div>

          {#if monitor.last_check}
            <div class="mt-3 flex items-center justify-between border-t border-[var(--color-border)] pt-3 text-xs text-[var(--color-text-muted)]">
              <span>Status: {monitor.last_check.status_code}</span>
              <span>{monitor.last_check.response_time_ms}ms</span>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>
