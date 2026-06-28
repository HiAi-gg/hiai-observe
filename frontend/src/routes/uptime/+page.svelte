<script lang="ts">
import {
  createMonitor,
  deleteMonitor,
  getMonitorChecks,
  getMonitorGroups,
  getMonitors,
  type Monitor,
} from "$lib/api";
import { currentProject } from "$lib/stores.svelte";

let monitors = $state<Monitor[]>([]);
let loading = $state(true);
let error = $state<string | null>(null);
let selectedPeriod = $state<"24h" | "7d" | "30d" | "90d">("24h");
let selectedGroup = $state<string>("");
let groups = $state<Array<{ group: string; count: number }>>([]);

let showAddModal = $state(false);
let newName = $state("");
let newUrl = $state("");
let newType = $state("http");
let newGroup = $state("");
let newInterval = $state(60);
let newMethod = $state("GET");
let newHeaders = $state("");
let newBody = $state("");
let newIgnoreSsl = $state(false);
let newMaxRedirects = $state(5);
let newKeyword = $state("");
let newKeywordNot = $state("");
let newDnsRecordType = $state("A");
let newDnsExpectedValue = $state("");
let newDnsResolver = $state("");

let addError = $state<string | null>(null);
let addLoading = $state(false);

let sparklineData = $state<Map<string, number[]>>(new Map());

const periods = [
  { label: "24h", hours: 24 },
  { label: "7d", hours: 168 },
  { label: "30d", hours: 720 },
  { label: "90d", hours: 2160 },
] as const;

function periodHours(): number {
  return periods.find((p) => p.label === selectedPeriod)?.hours ?? 24;
}

async function loadGroups() {
  try {
    const res = await getMonitorGroups();
    groups = res.groups ?? [];
  } catch {
    // Silent: groups filter is non-critical.
  }
}

async function load() {
  try {
    loading = true;
    error = null;
    const result = await getMonitors({ hours: periodHours(), group: selectedGroup || undefined });
    monitors = result.monitors ?? [];

    // Fetch all per-monitor checks in parallel — the previous sequential
    // loop (one await per monitor) made large fleets noticeably slow.
    const dataMap = new Map<string, number[]>();
    const checkResults = await Promise.allSettled(monitors.map((m) => getMonitorChecks(m.id, 48)));
    for (let i = 0; i < monitors.length; i++) {
      const r = checkResults[i];
      const m = monitors[i];
      if (r.status !== "fulfilled" || !r.value) continue;
      // Backend returns camelCase (responseTimeMs). Fall back to snake_case
      // (response_time_ms) for forward-compat with any older payloads.
      dataMap.set(
        m.id,
        r.value.checks.map((c) => c.responseTimeMs ?? c.response_time_ms ?? 0).reverse(),
      );
    }
    sparklineData = dataMap;
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load monitors";
  } finally {
    loading = false;
  }
}

async function handleAddMonitor() {
  if (!newName || !newUrl) {
    addError = "Name and URL are required";
    return;
  }
  try {
    addLoading = true;
    addError = null;
    let parsedHeaders: Record<string, string> | undefined;
    if (newHeaders.trim()) {
      try {
        parsedHeaders = JSON.parse(newHeaders);
      } catch {
        addError = "Headers must be a valid JSON object";
        addLoading = false;
        return;
      }
    }

    const projectId = currentProject.current;

    await createMonitor({
      name: newName,
      url: newUrl,
      type: newType,
      group: newGroup || undefined,
      interval_seconds: newInterval,
      project_id: projectId,
      method: newType === "http" ? newMethod : undefined,
      headers: newType === "http" ? parsedHeaders : undefined,
      body: newType === "http" && newBody ? newBody : undefined,
      ignore_ssl: newType === "http" ? newIgnoreSsl : undefined,
      max_redirects: newType === "http" ? newMaxRedirects : undefined,
      keyword: newType === "http" && newKeyword ? newKeyword : undefined,
      keyword_not: newType === "http" && newKeywordNot ? newKeywordNot : undefined,
      dns_record_type: newType === "dns" ? newDnsRecordType : undefined,
      dns_expected_value:
        newType === "dns" && newDnsExpectedValue ? newDnsExpectedValue : undefined,
      dns_resolver: newType === "dns" && newDnsResolver ? newDnsResolver : undefined,
    });

    newName = "";
    newUrl = "";
    newType = "http";
    newGroup = "";
    newInterval = 60;
    newMethod = "GET";
    newHeaders = "";
    newBody = "";
    newIgnoreSsl = false;
    newMaxRedirects = 5;
    newKeyword = "";
    newKeywordNot = "";
    newDnsRecordType = "A";
    newDnsExpectedValue = "";
    newDnsResolver = "";
    showAddModal = false;

    await load();
    await loadGroups();
  } catch (err) {
    addError = err instanceof Error ? err.message : "Failed to add monitor";
  } finally {
    addLoading = false;
  }
}

async function handleDeleteMonitor(id: string) {
  if (!confirm("Are you sure you want to delete this monitor?")) return;
  try {
    await deleteMonitor(id);
    await load();
    await loadGroups();
  } catch (err) {
    error = err instanceof Error ? err.message : "Failed to delete monitor";
  }
}

$effect(() => {
  load();
  loadGroups();
  const interval = setInterval(load, 60_000);
  return () => clearInterval(interval);
});

$effect(() => {
  selectedPeriod;
  selectedGroup;
  load();
});

function statusDot(monitor: Monitor) {
  // The list endpoint does not include the latest check (only the single
  // monitor endpoint returns `latestCheck`). When unavailable we fall back
  // to uptime24h for color and treat the dot as "unknown".
  const last =
    (monitor as unknown as { latestCheck?: { success?: boolean } }).latestCheck ??
    (monitor as unknown as { lastCheck?: { success?: boolean } }).lastCheck ??
    (monitor as unknown as { last_check?: { success?: boolean } }).last_check;
  if (!last) return "bg-[var(--muted-foreground)]";
  if (!last.success) return "bg-[var(--destructive)]";
  if (monitor.uptime24h !== undefined && monitor.uptime24h < 99.9) return "bg-[var(--warning)]";
  return "bg-[var(--success)]";
}

function uptimeColor(pct?: number) {
  if (pct === undefined) return "text-[var(--muted-foreground)]";
  if (pct >= 99.9) return "text-[var(--success)]";
  if (pct >= 95) return "text-[var(--warning)]";
  return "text-[var(--destructive)]";
}

function certExpiryWarning(monitor: Monitor): string | null {
  // `certExpiry` lives on the latest check, not on the monitor itself.
  // The list endpoint does not return the latest check, so this is
  // normally only populated for single monitor lookups. Fall back to
  // snake_case for forward-compat with any older payloads.
  const latest = (
    monitor as unknown as { latestCheck?: { certExpiry?: string; cert_expiry?: string } }
  ).latestCheck;
  const expiry = latest?.certExpiry ?? latest?.cert_expiry;
  if (!expiry) return null;
  const daysLeft = (new Date(expiry).getTime() - Date.now()) / 86400_000;
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
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-3">
      <h1 class="text-2xl font-bold">Uptime Monitoring</h1>
      <button type="button"
        onclick={() => { showAddModal = true; }}
        class="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)] transition-colors"
      >
        Add Monitor
      </button>
    </div>
    <div class="flex items-center gap-2">
      <!-- Period tabs -->
      <div class="flex rounded-lg border border-[var(--border)] bg-[var(--card)] p-0.5">
        {#each periods as period (period.label)}
          <button type="button"
            onclick={() => { selectedPeriod = period.label; }}
            class="rounded-md px-3 py-1.5 text-xs font-medium transition-colors {selectedPeriod === period.label ? 'bg-[var(--primary)] text-white' : 'text-[var(--muted-foreground)] hover:text-[var(--muted-foreground)]'}"
          >{period.label}</button>
        {/each}
      </div>
      <!-- Group filter -->
      {#if groups.length > 0}
        <select
          bind:value={selectedGroup}
          class="rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs text-[var(--muted-foreground)]"
        >
          <option value="">All groups</option>
          {#each groups as g (g.group)}
            <option value={g.group}>{g.group} ({g.count})</option>
          {/each}
        </select>
      {/if}
    </div>
  </div>

  {#if error}
    <div class="flex items-center gap-3 rounded-lg border border-[var(--destructive)]/50 bg-[color-mix(in_oklch,var(--destructive)_18%,transparent)] px-4 py-3 text-sm text-[var(--destructive)]">
      <span class="flex-1">{error}</span>
      <button type="button" onclick={() => load()} class="rounded border border-[var(--destructive)]/50 px-2.5 py-1 text-xs text-[var(--destructive)] hover:bg-[color-mix(in_oklch,var(--destructive)_18%,transparent)] transition-colors">Retry</button>
    </div>
  {/if}

  {#if loading}
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {#each Array(3) as _, i (i)}
        <div class="h-40 animate-pulse rounded-lg bg-[var(--card)]"></div>
      {/each}
    </div>
  {:else if monitors.length === 0}
    <div class="flex flex-col items-center justify-center py-16">
      <svg class="mb-4 h-12 w-12 text-[var(--muted-foreground)] opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
      <p class="text-sm font-medium text-[var(--muted-foreground)]">No monitors configured yet</p>
      <p class="mt-1 text-xs text-[var(--muted-foreground)]">Add uptime monitors to track your services</p>
      <button type="button" onclick={() => { showAddModal = true; }} class="mt-3 inline-block rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)] transition-colors">
        Add Monitor
      </button>
    </div>
  {:else}
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {#each monitors as monitor (monitor.id)}
        {@const certWarn = certExpiryWarning(monitor)}
        <div class="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 transition-colors hover:border-[var(--primary)]/30">
          <div class="flex items-center justify-between mb-1">
            <div class="flex items-center gap-3">
              <span class="h-2.5 w-2.5 rounded-full {statusDot(monitor)}"></span>
              <h3 class="font-medium">{monitor.name}</h3>
            </div>
            <button type="button"
              onclick={() => handleDeleteMonitor(monitor.id)}
              class="text-[var(--muted-foreground)] hover:text-[var(--destructive)] transition-colors p-1"
              title="Delete Monitor"
            >
              <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>
          </div>
          <p class="mt-1 truncate text-xs text-[var(--muted-foreground)]">{monitor.url}</p>

          {#if certWarn}
            <div class="mt-2 rounded bg-[color-mix(in_oklch,var(--warning)_18%,transparent)] px-2 py-1 text-xs text-[var(--warning)]">
              SSL: {certWarn}
            </div>
          {/if}

          <!-- Response time sparkline -->
          {#if sparklineData.has(monitor.id) && (sparklineData.get(monitor.id) ?? []).length > 1}
            <div class="mt-3">
              <svg width="120" height="32" class="text-[var(--primary)]" aria-label="Response time trend">
                <path d={sparklinePath(sparklineData.get(monitor.id) ?? [])} fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </div>
          {/if}

          <div class="mt-3 flex items-end justify-between">
            <div>
              <p class="text-xs text-[var(--muted-foreground)]">Uptime {selectedPeriod}</p>
              <p class="text-xl font-bold {uptimeColor(monitor.uptime24h)}">
                {monitor.uptime24h !== undefined ? `${monitor.uptime24h.toFixed(2)}%` : "N/A"}
              </p>
            </div>
            <span class="rounded-full px-2 py-0.5 text-xs font-medium {uptimeColor(monitor.uptime24h)}">
              {monitor.uptime24h !== undefined ? (monitor.uptime24h >= 99.9 ? "Operational" : monitor.uptime24h >= 95 ? "Degraded" : "Down") : "Unknown"}
            </span>
          </div>

          {#if (monitor as unknown as { latestCheck?: unknown }).latestCheck
            ?? (monitor as unknown as { lastCheck?: unknown }).lastCheck
            ?? (monitor as unknown as { last_check?: unknown }).last_check}
            {@const lc = ((monitor as unknown as { latestCheck?: { statusCode?: number | null; status_code?: number | null; responseTimeMs?: number; response_time_ms?: number } }).latestCheck
              ?? (monitor as unknown as { lastCheck?: { statusCode?: number | null; status_code?: number | null; responseTimeMs?: number; response_time_ms?: number } }).lastCheck
              ?? (monitor as unknown as { last_check?: { statusCode?: number | null; status_code?: number | null; responseTimeMs?: number; response_time_ms?: number } }).last_check)!}
            <div class="mt-3 flex items-center justify-between border-t border-[var(--border)] pt-3 text-xs text-[var(--muted-foreground)]">
              <span>Status: {lc.statusCode ?? lc.status_code ?? "N/A"}</span>
              <span>{lc.responseTimeMs ?? lc.response_time_ms ?? "?"}ms</span>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  {#if showAddModal}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div class="w-full max-w-lg rounded-xl border border-[var(--border)] bg-[var(--background)] p-6 shadow-xl">
        <div class="mb-4 flex items-center justify-between">
          <h2 class="text-xl font-bold">Add New Monitor</h2>
          <button type="button" onclick={() => { showAddModal = false; }} class="text-[var(--muted-foreground)] hover:text-[var(--foreground)]" title="Close">
            <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        {#if addError}
          <div class="mb-4 rounded-lg bg-[color-mix(in_oklch,var(--destructive)_18%,transparent)] p-3 text-sm text-[var(--destructive)]">
            {addError}
          </div>
        {/if}

        <form onsubmit={(e) => { e.preventDefault(); handleAddMonitor(); }} class="space-y-4">
          <div>
            <label class="block text-xs font-medium text-[var(--muted-foreground)] mb-1">Name</label>
            <input type="text" bind:value={newName} required placeholder="My Service" class="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none" />
          </div>

          <div>
            <label class="block text-xs font-medium text-[var(--muted-foreground)] mb-1">URL / Endpoint</label>
            <input type="url" bind:value={newUrl} required placeholder="https://example.com" class="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none" />
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-medium text-[var(--muted-foreground)] mb-1">Type</label>
              <select bind:value={newType} class="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none">
                <option value="http">HTTP</option>
                <option value="tcp">TCP</option>
                <option value="dns">DNS</option>
                <option value="ping">PING</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-medium text-[var(--muted-foreground)] mb-1">Interval (seconds)</label>
              <input type="number" bind:value={newInterval} min="10" required class="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none" />
            </div>
          </div>

          <div>
            <label class="block text-xs font-medium text-[var(--muted-foreground)] mb-1">Group (Optional)</label>
            <input type="text" bind:value={newGroup} placeholder="Production" class="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none" />
          </div>

          {#if newType === "http"}
            <div class="border-t border-[var(--border)] pt-4 space-y-4">
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-xs font-medium text-[var(--muted-foreground)] mb-1">HTTP Method</label>
                  <select bind:value={newMethod} class="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none">
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="HEAD">HEAD</option>
                  </select>
                </div>
                <div>
                  <label class="block text-xs font-medium text-[var(--muted-foreground)] mb-1">Max Redirects</label>
                  <input type="number" bind:value={newMaxRedirects} min="0" max="20" class="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none" />
                </div>
              </div>

              <div>
                <label class="block text-xs font-medium text-[var(--muted-foreground)] mb-1">Headers (JSON, Optional)</label>
                <textarea bind:value={newHeaders} placeholder="Example: Key: value" rows="2" class="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-mono focus:border-[var(--primary)] focus:outline-none"></textarea>
              </div>

              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-xs font-medium text-[var(--muted-foreground)] mb-1">Expected Keyword</label>
                  <input type="text" bind:value={newKeyword} placeholder="success" class="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none" />
                </div>
                <div>
                  <label class="block text-xs font-medium text-[var(--muted-foreground)] mb-1">Excluded Keyword</label>
                  <input type="text" bind:value={newKeywordNot} placeholder="error" class="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none" />
                </div>
              </div>

              <label class="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
                <input type="checkbox" bind:checked={newIgnoreSsl} class="rounded" />
                Ignore SSL Errors
              </label>
            </div>
          {/if}

          {#if newType === "dns"}
            <div class="border-t border-[var(--border)] pt-4 space-y-4">
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-xs font-medium text-[var(--muted-foreground)] mb-1">DNS Record Type</label>
                  <select bind:value={newDnsRecordType} class="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none">
                    <option value="A">A</option>
                    <option value="AAAA">AAAA</option>
                    <option value="CNAME">CNAME</option>
                    <option value="MX">MX</option>
                    <option value="TXT">TXT</option>
                    <option value="NS">NS</option>
                  </select>
                </div>
                <div>
                  <label class="block text-xs font-medium text-[var(--muted-foreground)] mb-1">Expected Value</label>
                  <input type="text" bind:value={newDnsExpectedValue} placeholder="1.2.3.4" class="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none" />
                </div>
              </div>
              <div>
                <label class="block text-xs font-medium text-[var(--muted-foreground)] mb-1">Custom Resolver (Optional)</label>
                <input type="text" bind:value={newDnsResolver} placeholder="8.8.8.8" class="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none" />
              </div>
            </div>
          {/if}

          <div class="mt-6 flex justify-end gap-3 border-t border-[var(--border)] pt-4">
            <button type="button" onclick={() => { showAddModal = false; }} class="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--muted-foreground)] hover:bg-[var(--card)] transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={addLoading} class="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)] transition-colors disabled:opacity-50">
              {addLoading ? "Adding..." : "Add Monitor"}
            </button>
          </div>
        </form>
      </div>
    </div>
  {/if}
</div>
