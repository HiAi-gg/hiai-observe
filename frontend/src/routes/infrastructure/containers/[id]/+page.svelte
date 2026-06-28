<script lang="ts">
import { page } from "$app/state";
import { getContainerDetail } from "$lib/api";
import TimeSeriesChart from "$lib/components/TimeSeriesChart.svelte";
import { apiKey } from "$lib/stores.svelte";
import { formatBytes } from "$lib/utils";

let container = $state<{ name: string; image: string; status: string } | null>(null);
let cpuData = $state<Array<{ time: Date; value: number }>>([]);
let memData = $state<Array<{ time: Date; value: number }>>([]);
let netRxData = $state<Array<{ time: Date; value: number }>>([]);
let netTxData = $state<Array<{ time: Date; value: number }>>([]);
let blockReadData = $state<Array<{ time: Date; value: number }>>([]);
let blockWriteData = $state<Array<{ time: Date; value: number }>>([]);
let loading = $state(true);
let error = $state<string | null>(null);

type ContainerHistoryRow = {
  collectedAt: string;
  name: string;
  image: string;
  status: string;
  cpuPercent: number;
  memoryUsageMb: number;
  memoryLimitMb: number;
  memoryPercent: number;
  networkRxBytes: number;
  networkTxBytes: number;
  blockReadBytes: number;
  blockWriteBytes: number;
  restartCount: number;
  uptimeSeconds: number;
};

async function load() {
  try {
    loading = true;
    error = null;
    const id = page.params.id;
    if (!id) {
      error = "No container id";
      return;
    }
    const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const data = await getContainerDetail(id, { from });
    if ((data.data ?? []).length === 0) {
      error = "No data found for this container";
      return;
    }

    const latest = data.data[0]!;
    container = { name: latest.name, image: latest.image, status: latest.status };

    cpuData = data.data.map((r) => ({ time: new Date(r.collectedAt), value: r.cpuPercent }));
    memData = data.data.map((r) => ({ time: new Date(r.collectedAt), value: r.memoryPercent }));
    netRxData = data.data.map((r) => ({
      time: new Date(r.collectedAt),
      value: r.networkRxBytes / 1024 / 1024,
    }));
    netTxData = data.data.map((r) => ({
      time: new Date(r.collectedAt),
      value: r.networkTxBytes / 1024 / 1024,
    }));
    blockReadData = data.data.map((r) => ({
      time: new Date(r.collectedAt),
      value: r.blockReadBytes / 1024 / 1024,
    }));
    blockWriteData = data.data.map((r) => ({
      time: new Date(r.collectedAt),
      value: r.blockWriteBytes / 1024 / 1024,
    }));
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load container data";
  } finally {
    loading = false;
  }
}

$effect(() => {
  load();
});
</script>

<svelte:head>
  <title>{container?.name ?? 'Container'} | Infrastructure | HiAi Observe</title>
</svelte:head>

<div class="space-y-6">
  <div class="flex items-center gap-3">
    <a href="/infrastructure" class="text-sm text-[var(--primary)] hover:text-[var(--primary-hover)]">← Back to Infrastructure</a>
  </div>

  {#if loading}
    <div class="space-y-4">
      <div class="h-8 w-48 animate-pulse rounded bg-[var(--accent)]"></div>
      <div class="h-40 animate-pulse rounded bg-[var(--accent)]"></div>
    </div>
  {:else if error}
    <div class="flex items-center gap-3 rounded-lg border border-[var(--destructive)]/50 bg-[color-mix(in_oklch,var(--destructive)_18%,transparent)] px-4 py-3 text-sm text-[var(--destructive)]">
      <span class="flex-1">{error}</span>
      <button type="button" onclick={() => load()} class="rounded border border-[var(--destructive)]/50 px-2.5 py-1 text-xs text-[var(--destructive)] hover:bg-[color-mix(in_oklch,var(--destructive)_18%,transparent)]">Retry</button>
    </div>
  {:else if container}
    <!-- Container header -->
    <div class="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold">{container.name}</h1>
          <p class="mt-1 text-sm text-[var(--muted-foreground)]">{container.image}</p>
        </div>
        <span class="rounded-full px-3 py-1 text-sm font-medium {container.status === 'running' ? 'bg-[color-mix(in_oklch,var(--success)_18%,transparent)] text-[var(--success)]' : 'bg-[var(--accent)] text-[var(--muted-foreground)]'}">
          {container.status}
        </span>
      </div>
    </div>

    <!-- Charts -->
    <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div class="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
        <TimeSeriesChart data={cpuData} label="CPU Usage" color="var(--destructive)" unit="%" height={200} />
      </div>
      <div class="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
        <TimeSeriesChart data={memData} label="Memory Usage" color="var(--info)" unit="%" height={200} />
      </div>
      <div class="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
        <TimeSeriesChart data={netRxData} label="Network RX" color="var(--success)" unit=" MB" height={200} />
      </div>
      <div class="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
        <TimeSeriesChart data={netTxData} label="Network TX" color="var(--warning)" unit=" MB" height={200} />
      </div>
      <div class="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
        <TimeSeriesChart data={blockReadData} label="Block Read" color="var(--violet)" unit=" MB" height={200} />
      </div>
      <div class="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
        <TimeSeriesChart data={blockWriteData} label="Block Write" color="var(--primary)" unit=" MB" height={200} />
      </div>
    </div>
  {/if}
</div>
