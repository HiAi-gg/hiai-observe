<script lang="ts">
  import { getContainerStats, getHostStats, type ContainerStats, type HostStats } from "$lib/api";
  import { formatBytes } from "$lib/utils";

  let containers = $state<ContainerStats[]>([]);
  let host = $state<HostStats | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  async function load() {
    try {
      loading = true;
      error = null;
      const [cResult, hResult] = await Promise.all([getContainerStats(), getHostStats()]);
      containers = cResult.containers;
      host = hResult;
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load infrastructure data";
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  });

  function cpuColor(pct: number) {
    if (pct > 90) return "bg-[var(--color-danger)]";
    if (pct > 70) return "bg-[var(--color-warning)]";
    return "bg-[var(--color-success)]";
  }

  function memoryPercent(used: number, total: number) {
    return total > 0 ? (used / total) * 100 : 0;
  }
</script>

<svelte:head><title>Infrastructure | HiAi Observe</title></svelte:head>

<div class="space-y-6">
  <h1 class="text-2xl font-bold">Infrastructure</h1>

  {#if error}
    <div class="flex items-center gap-3 rounded-lg border border-[var(--color-danger)]/50 bg-[var(--color-danger-bg)] px-4 py-3 text-sm text-[var(--color-danger)]">
      <svg class="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <span class="flex-1">{error}</span>
      <button onclick={() => load()} class="rounded border border-[var(--color-danger)]/50 px-2.5 py-1 text-xs text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)] transition-colors">Retry</button>
    </div>
  {/if}

  {#if loading && !host}
    <p class="text-[var(--color-text-muted)]">Loading...</p>
  {:else}
    <!-- Host stats -->
    {#if host}
      <div class="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4">
        <h2 class="mb-4 text-lg font-semibold">Host Resources</h2>
        <div class="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <!-- CPU -->
          <div>
            <div class="flex items-center justify-between text-sm">
              <span class="text-[var(--color-text-muted)]">CPU</span>
              <span class="font-medium">{host.cpu_percent.toFixed(1)}%</span>
            </div>
            <div class="mt-2 h-2 overflow-hidden rounded-full bg-[var(--color-surface-overlay)]">
              <div class="h-full rounded-full {cpuColor(host.cpu_percent)}" style="width: {Math.min(host.cpu_percent, 100)}%"></div>
            </div>
          </div>
          <!-- Memory -->
          <div>
            <div class="flex items-center justify-between text-sm">
              <span class="text-[var(--color-text-muted)]">Memory</span>
              <span class="font-medium">{host.memory_used_mb} / {host.memory_total_mb} MB</span>
            </div>
            <div class="mt-2 h-2 overflow-hidden rounded-full bg-[var(--color-surface-overlay)]">
              <div class="h-full rounded-full {cpuColor(memoryPercent(host.memory_used_mb, host.memory_total_mb))}" style="width: {memoryPercent(host.memory_used_mb, host.memory_total_mb)}%"></div>
            </div>
          </div>
          <!-- Disk -->
          <div>
            <div class="flex items-center justify-between text-sm">
              <span class="text-[var(--color-text-muted)]">Disk</span>
              <span class="font-medium">{host.disk_used_gb.toFixed(1)} / {host.disk_total_gb.toFixed(1)} GB</span>
            </div>
            <div class="mt-2 h-2 overflow-hidden rounded-full bg-[var(--color-surface-overlay)]">
              <div class="h-full rounded-full {cpuColor(memoryPercent(host.disk_used_gb, host.disk_total_gb))}" style="width: {memoryPercent(host.disk_used_gb, host.disk_total_gb)}%"></div>
            </div>
          </div>
        </div>
        {#if host.load_avg_1m > 0}
          <p class="mt-3 text-xs text-[var(--color-text-muted)]">
            Load avg: {host.load_avg_1m.toFixed(2)} / {host.load_avg_5m.toFixed(2)} / {host.load_avg_15m.toFixed(2)}
          </p>
        {/if}
      </div>
    {/if}

    <!-- Containers -->
    <div>
      <h2 class="mb-3 text-lg font-semibold">Docker Containers ({containers.length})</h2>
      {#if containers.length === 0}
        <p class="text-[var(--color-text-muted)]">No containers detected</p>
      {:else}
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          {#each containers as container (container.id)}
            <div class="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4">
              <div class="flex items-center justify-between">
                <h3 class="truncate font-medium">{container.name}</h3>
                <span class="rounded-full px-2 py-0.5 text-xs font-medium {container.status === 'running' ? 'bg-[var(--color-success-bg)] text-[var(--color-success)] border border-[var(--color-success)]/30' : 'bg-[var(--color-surface-overlay)] text-[var(--color-text-secondary)] border border-[var(--color-border)]'}">
                  {container.status}
                </span>
              </div>
              <p class="mt-1 truncate text-xs text-[var(--color-text-muted)]">{container.image}</p>

              <div class="mt-4 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p class="text-xs text-[var(--color-text-muted)]">CPU</p>
                  <p class="font-medium">{container.cpu_percent.toFixed(1)}%</p>
                </div>
                <div>
                  <p class="text-xs text-[var(--color-text-muted)]">Memory</p>
                  <p class="font-medium">{container.memory_usage_mb.toFixed(0)} MB</p>
                </div>
                <div>
                  <p class="text-xs text-[var(--color-text-muted)]">Net RX</p>
                  <p class="font-medium">{formatBytes(container.network_rx_bytes)}</p>
                </div>
                <div>
                  <p class="text-xs text-[var(--color-text-muted)]">Net TX</p>
                  <p class="font-medium">{formatBytes(container.network_tx_bytes)}</p>
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>
