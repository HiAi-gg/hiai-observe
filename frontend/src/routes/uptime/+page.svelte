<script lang="ts">
  import { getMonitors, type Monitor } from "$lib/api";

  let monitors = $state<Monitor[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  // Sparkline data per monitor
  let sparklineData = $state<Map<string, number[]>>(new Map());

  async function load() {
    try {
      loading = true;
      error = null;
      const result = await getMonitors();
      monitors = result.monitors;

      // Fetch response time history for sparklines
      const apiKey = localStorage.getItem("hiai-observe-api-key") ?? "";
      const dataMap = new Map<string, number[]>();
      for (const m of monitors) {
        try {
          const res = await fetch(`/api/monitors/${m.id}/checks?limit=48`, {
            headers: { Authorization: `Bearer ${apiKey}` },
          });
          if (res.ok) {
            const data = await res.json() as { checks: Array<{ response_time_ms: number }> };
            dataMap.set(m.id, data.checks.map(c => c.response_time_ms).reverse());
          }
        } catch { /* skip */ }
      }
      sparklineData = dataMap;
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

  function statusDot(monitor: Monitor) {
    if (!monitor.last_check) return "bg-[var(--color-text-muted)]";
    if (!monitor.last_check.success) return "bg-[var(--color-danger)]";
    if (monitor.uptime24h !== undefined && monitor.uptime24h < 99.9) return "bg-[var(--color-warning)]";
    return "bg-[var(--color-success)]";
  }

  function uptimeColor(pct?: number) {
    if (pct === undefined) return "text-[var(--color-text-muted)]";
    if (pct >= 99.9) return "text-[var(--color-success)]";
    if (pct >= 95) return "text-[var(--color-warning)]";
    return "text-[var(--color-danger)]";
  }

  function certExpiryWarning(monitor: Monitor): string | null {
    // certExpiry would come from the API if populated
    const expiry = (monitor as Record<string, unknown>).cert_expiry as string | undefined;
    if (!expiry) return null;
    const daysLeft = (new Date(expiry).getTime() - Date.now()) / (86400_000);
    if (daysLeft < 0) return "Expired";
    if (daysLeft < 7) return `Expires in ${Math.floor(daysLeft)} days!`;
    if (daysLeft < 30) return `Expires in ${Math.floor(daysLeft)} days`;
    return null;
  }

  function sparklinePath(data: number[]): string {
    if (data.length < 2) return "";
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;
    const w = 120;
    const h = 32;
    const points = data.map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x},${y}`;
    });
    return `M ${points.join(" L ")}`;
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
        <div class="h-40 animate-pulse rounded-lg bg-[var(--color-surface-raised)]"></div>
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
        {@const certWarn = certExpiryWarning(monitor)}
        <div class="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4 transition-colors hover:border-[var(--color-accent)]/30">
          <div class="flex items-center gap-3">
            <span class="h-2.5 w-2.5 rounded-full {statusDot(monitor)}"></span>
            <h3 class="font-medium">{monitor.name}</h3>
          </div>
          <p class="mt-1 truncate text-xs text-[var(--color-text-muted)]">{monitor.url}</p>

          {#if certWarn}
            <div class="mt-2 rounded bg-[var(--color-warning-bg)] px-2 py-1 text-xs text-[var(--color-warning)]">
              SSL: {certWarn}
            </div>
          {/if}

          <!-- Response time sparkline -->
          {#if sparklineData.has(monitor.id) && (sparklineData.get(monitor.id) ?? []).length > 1}
            <div class="mt-3">
              <svg width="120" height="32" class="text-[var(--color-accent)]" aria-label="Response time trend">
                <path d={sparklinePath(sparklineData.get(monitor.id) ?? [])} fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </div>
          {/if}

          <div class="mt-3 flex items-end justify-between">
            <div>
              <p class="text-xs text-[var(--color-text-muted)]">Uptime 24h</p>
              <p class="text-xl font-bold {uptimeColor(monitor.uptime24h)}">
                {monitor.uptime24h !== undefined ? `${monitor.uptime24h.toFixed(2)}%` : "N/A"}
              </p>
            </div>
            <span class="rounded-full px-2 py-0.5 text-xs font-medium {uptimeColor(monitor.uptime24h)}">
              {monitor.uptime24h !== undefined ? (monitor.uptime24h >= 99.9 ? "Operational" : monitor.uptime24h >= 95 ? "Degraded" : "Down") : "Unknown"}
            </span>
          </div>

          {#if monitor.last_check}
            <div class="mt-3 flex items-center justify-between border-t border-[var(--color-border)] pt-3 text-xs text-[var(--color-text-muted)]">
              <span>Status: {monitor.last_check.status_code ?? "N/A"}</span>
              <span>{monitor.last_check.response_time_ms}ms</span>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>
