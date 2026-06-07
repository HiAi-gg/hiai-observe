<script lang="ts">
  import { getContainerStats, getHostStats, type ContainerStats, type HostStats } from "$lib/api";
  import { formatBytes } from "$lib/utils";
  import TimeSeriesChart from "$lib/components/TimeSeriesChart.svelte";
  import { drawTimeSeriesChart } from "$lib/chart-utils";

  let containers = $state<ContainerStats[]>([]);
  let host = $state<HostStats | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  let hostHistory = $state<Array<{ time: Date; value: number }>>([]);
  let memHistory = $state<Array<{ time: Date; value: number }>>([]);
  let diskHistory = $state<Array<{ time: Date; value: number }>>([]);
  let containerHistory = $state<Map<string, Array<{ time: Date; value: number }>>>(new Map());

  let cpuCanvas = $state<HTMLCanvasElement | null>(null);
  let memCanvas = $state<HTMLCanvasElement | null>(null);
  let diskCanvas = $state<HTMLCanvasElement | null>(null);

  type HostHistoryRow = { collectedAt: string; cpuPercent: number; memoryUsedMb: number; memoryTotalMb: number; diskUsedGb: number; diskTotalGb: number };
  type ContainerHistoryRow = { collectedAt: string; cpuPercent: number; name: string };

  async function loadCurrent() {
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

  async function loadHistory() {
    try {
      const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const apiKey = localStorage.getItem("hiai-observe-api-key") ?? "";

      const hostRes = await fetch(`/api/infrastructure/host/history?from=${from}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (hostRes.ok) {
        const data = await hostRes.json() as { data: HostHistoryRow[] };
        hostHistory = data.data.map((r: HostHistoryRow) => ({ time: new Date(r.collectedAt), value: r.cpuPercent }));
        memHistory = data.data.map((r: HostHistoryRow) => ({
          time: new Date(r.collectedAt),
          value: r.memoryTotalMb > 0 ? (r.memoryUsedMb / r.memoryTotalMb) * 100 : 0,
        }));
        diskHistory = data.data.map((r: HostHistoryRow) => ({
          time: new Date(r.collectedAt),
          value: r.diskTotalGb > 0 ? (r.diskUsedGb / r.diskTotalGb) * 100 : 0,
        }));
      }

      const topContainers = [...containers].sort((a, b) => b.cpu_percent - a.cpu_percent).slice(0, 5);
      const cMap = new Map<string, Array<{ time: Date; value: number }>>();
      for (const c of topContainers) {
        const cRes = await fetch(`/api/infrastructure/containers/${c.id}?from=${from}`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (cRes.ok) {
          const cData = await cRes.json() as { data: ContainerHistoryRow[] };
          cMap.set(c.name, cData.data.map((r: ContainerHistoryRow) => ({ time: new Date(r.collectedAt), value: r.cpuPercent })));
        }
      }
      containerHistory = cMap;
    } catch {
    }
  }

  $effect(() => {
    loadCurrent().then(loadHistory);
    const interval = setInterval(() => { loadCurrent().then(loadHistory); }, 60_000);
    return () => clearInterval(interval);
  });

  $effect(() => {
    if (!cpuCanvas || !memCanvas || !diskCanvas) return;
    const observer = new ResizeObserver(() => {
      if (cpuCanvas && hostHistory.length > 0) {
        drawTimeSeriesChart(cpuCanvas, hostHistory.map(h => h.value), { color: "#ef4444", max: 100 });
      }
      if (memCanvas && memHistory.length > 0) {
        drawTimeSeriesChart(memCanvas, memHistory.map(h => h.value), { color: "#3b82f6", max: 100 });
      }
      if (diskCanvas && diskHistory.length > 0) {
        drawTimeSeriesChart(diskCanvas, diskHistory.map(h => h.value), { color: "#f59e0b", max: 100 });
      }
    });
    observer.observe(cpuCanvas);
    observer.observe(memCanvas);
    observer.observe(diskCanvas);
    return () => observer.disconnect();
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
      <button onclick={() => loadCurrent()} class="rounded border border-[var(--color-danger)]/50 px-2.5 py-1 text-xs text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)] transition-colors">Retry</button>
    </div>
  {/if}

  {#if loading && !host}
    <div class="space-y-6">
      <!-- Skeleton host gauges -->
      <div class="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4">
        <div class="mb-4 h-6 w-40 animate-pulse rounded bg-[var(--color-surface-overlay)]"></div>
        <div class="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {#each Array(3) as _, i (i)}
            <div class="space-y-2 animate-pulse" style="opacity: {1 - i * 0.15}">
              <div class="h-4 w-16 rounded bg-[var(--color-surface-overlay)]"></div>
              <div class="h-2 w-full rounded-full bg-[var(--color-surface-overlay)]"></div>
            </div>
          {/each}
        </div>
      </div>
      <!-- Skeleton container cards -->
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        {#each Array(4) as _, i (i)}
          <div class="h-48 animate-pulse rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)]" style="opacity: {1 - i * 0.15}"></div>
        {/each}
      </div>
    </div>
  {:else}
    <!-- Host stats gauges -->
    {#if host}
      <div class="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4">
        <h2 class="mb-4 text-lg font-semibold">Host Resources</h2>
        <div class="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <div>
            <div class="flex items-center justify-between text-sm">
              <span class="text-[var(--color-text-muted)]">CPU</span>
              <span class="font-medium">{host.cpu_percent.toFixed(1)}%</span>
            </div>
            <div class="mt-2 h-2 overflow-hidden rounded-full bg-[var(--color-surface-overlay)]">
              <div class="h-full rounded-full {cpuColor(host.cpu_percent)}" style="width: {Math.min(host.cpu_percent, 100)}%"></div>
            </div>
          </div>
          <div>
            <div class="flex items-center justify-between text-sm">
              <span class="text-[var(--color-text-muted)]">Memory</span>
              <span class="font-medium">{host.memory_used_mb} / {host.memory_total_mb} MB</span>
            </div>
            <div class="mt-2 h-2 overflow-hidden rounded-full bg-[var(--color-surface-overlay)]">
              <div class="h-full rounded-full {cpuColor(memoryPercent(host.memory_used_mb, host.memory_total_mb))}" style="width: {memoryPercent(host.memory_used_mb, host.memory_total_mb)}%"></div>
            </div>
          </div>
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
        {#if host.swap_total_mb !== undefined && host.swap_used_mb !== undefined && host.swap_total_mb > 0}
          <div class="mt-4">
            <div class="flex items-center justify-between text-sm">
              <span class="text-[var(--color-text-muted)]">Swap</span>
              <span class="font-medium">{(host.swap_used_mb ?? 0).toFixed(0)} / {(host.swap_total_mb ?? 0).toFixed(0)} MB</span>
            </div>
            <div class="mt-2 h-2 overflow-hidden rounded-full bg-[var(--color-surface-overlay)]">
              <div class="h-full rounded-full {cpuColor(memoryPercent(host.swap_used_mb ?? 0, host.swap_total_mb ?? 0))}" style="width: {memoryPercent(host.swap_used_mb ?? 0, host.swap_total_mb ?? 0)}%"></div>
            </div>
          </div>
        {/if}

        {#if host.load_avg_1m > 0}
          <p class="mt-3 text-xs text-[var(--color-text-muted)]">
            Load avg: {host.load_avg_1m.toFixed(2)} / {host.load_avg_5m.toFixed(2)} / {host.load_avg_15m.toFixed(2)}
          </p>
        {/if}

        {#if host.cpu_cores && host.cpu_cores.length > 0}
          <div class="mt-4">
            <p class="mb-2 text-xs text-[var(--color-text-muted)]">Per-core CPU</p>
            <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {#each host.cpu_cores as core}
                <div class="flex items-center gap-2 text-xs">
                  <span class="w-8 text-[var(--color-text-muted)]">#{core.core}</span>
                  <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--color-surface-overlay)]">
                    <div class="h-full rounded-full {cpuColor(core.percent)}" style="width: {Math.min(core.percent, 100)}%"></div>
                  </div>
                  <span class="w-8 text-right">{core.percent.toFixed(0)}%</span>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        {#if host.disks && host.disks.length > 1}
          <div class="mt-4">
            <p class="mb-2 text-xs text-[var(--color-text-muted)]">Disk Partitions</p>
            <div class="space-y-1.5">
              {#each host.disks as disk}
                <div class="flex items-center gap-3 text-xs">
                  <span class="w-20 truncate text-[var(--color-text-muted)]">{disk.mount}</span>
                  <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--color-surface-overlay)]">
                    <div class="h-full rounded-full {cpuColor(memoryPercent(disk.usedGb, disk.totalGb))}" style="width: {memoryPercent(disk.usedGb, disk.totalGb)}%"></div>
                  </div>
                  <span class="text-right">{disk.usedGb.toFixed(1)} / {disk.totalGb.toFixed(1)} GB</span>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    {/if}

    <!-- Host time-series charts -->
    {#if hostHistory.length > 1}
      <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div class="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4">
          <h2 class="mb-4 text-lg font-semibold">Host Metrics (24h)</h2>
          <div class="grid grid-cols-1 gap-6">
            <TimeSeriesChart data={hostHistory} label="CPU %" color="var(--color-danger)" unit="%" height={160} />
            <TimeSeriesChart data={memHistory} label="Memory %" color="var(--color-info)" unit="%" height={160} />
            <TimeSeriesChart data={diskHistory} label="Disk %" color="var(--color-warning)" unit="%" height={160} />
          </div>
        </div>

        <div class="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4">
          <h2 class="mb-4 text-lg font-semibold">Real-time Trends (Canvas)</h2>
          <div class="grid grid-cols-1 gap-6">
            <div class="flex flex-col">
              <h3 class="mb-2 text-sm font-medium text-[var(--color-text-secondary)]">CPU %</h3>
              <div class="relative h-40 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-2">
                <canvas bind:this={cpuCanvas} class="h-full w-full"></canvas>
              </div>
            </div>
            <div class="flex flex-col">
              <h3 class="mb-2 text-sm font-medium text-[var(--color-text-secondary)]">Memory %</h3>
              <div class="relative h-40 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-2">
                <canvas bind:this={memCanvas} class="h-full w-full"></canvas>
              </div>
            </div>
            <div class="flex flex-col">
              <h3 class="mb-2 text-sm font-medium text-[var(--color-text-secondary)]">Disk %</h3>
              <div class="relative h-40 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-2">
                <canvas bind:this={diskCanvas} class="h-full w-full"></canvas>
              </div>
            </div>
          </div>
        </div>
      </div>
    {/if}

    <!-- Containers -->
    <div>
      <h2 class="mb-3 text-lg font-semibold">Docker Containers ({containers.length})</h2>
      {#if containers.length === 0}
        <div class="flex flex-col items-center justify-center py-12">
          <svg class="mb-4 h-12 w-12 text-[var(--color-text-muted)] opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
          <p class="text-sm font-medium text-[var(--color-text-secondary)]">No containers detected</p>
          <p class="mt-1 text-xs text-[var(--color-text-muted)]">Mount the Docker socket to enable container monitoring</p>
        </div>
      {:else}
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          {#each containers as container (container.id)}
            <a href="/infrastructure/containers/{container.id}" class="block rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4 transition-all hover:border-[var(--color-accent)] hover:shadow-md cursor-pointer">
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
                  <p class="font-medium">{container.memory_percent?.toFixed(1) ?? ((container.memory_usage_mb / (container.memory_limit_mb || 1)) * 100).toFixed(1)}%</p>
                </div>
                <div>
                  <p class="text-xs text-[var(--color-text-muted)]">Net RX</p>
                  <p class="font-medium">{formatBytes(container.network_rx_bytes)}{container.network_rx_rate > 0 ? ` (${formatBytes(container.network_rx_rate)}/s)` : ''}</p>
                </div>
                <div>
                  <p class="text-xs text-[var(--color-text-muted)]">Net TX</p>
                  <p class="font-medium">{formatBytes(container.network_tx_bytes)}{container.network_tx_rate > 0 ? ` (${formatBytes(container.network_tx_rate)}/s)` : ''}</p>
                </div>
              </div>
              {#if container.restart_count > 0}
                <div class="mt-3 flex items-center gap-1.5 text-xs text-[var(--color-warning)]">
                  <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                  <span>Restarted {container.restart_count}x</span>
                </div>
              {/if}
              <p class="mt-3 text-xs text-[var(--color-accent)]">View details →</p>
            </a>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Container CPU charts (top 5) -->
    {#if containerHistory.size > 0}
      <div class="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4">
        <h2 class="mb-4 text-lg font-semibold">Container CPU (24h)</h2>
        <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {#each [...containerHistory.entries()] as [name, data]}
            <TimeSeriesChart {data} label={name} color="var(--color-violet)" unit="%" height={140} />
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</div>
