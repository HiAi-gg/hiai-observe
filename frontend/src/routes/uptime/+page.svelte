<script lang="ts">
  import { getMonitors, createMonitor, deleteMonitor, type Monitor } from "$lib/api";

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
    return periods.find(p => p.label === selectedPeriod)?.hours ?? 24;
  }

  async function loadGroups() {
    try {
      const apiKey = localStorage.getItem("hiai-observe-api-key") ?? "";
      const res = await fetch("/api/monitors/groups", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (res.ok) {
        const data = await res.json() as { groups: Array<{ group: string; count: number }> };
        groups = data.groups;
      }
    } catch { }
  }

  async function load() {
    try {
      loading = true;
      error = null;
      const groupParam = selectedGroup ? `&group=${encodeURIComponent(selectedGroup)}` : "";
      const apiKey = localStorage.getItem("hiai-observe-api-key") ?? "";
      const res = await fetch(`/api/monitors?hours=${periodHours()}${groupParam}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) throw new Error("Failed to load monitors");
      const result = await res.json() as { monitors: Monitor[] };
      monitors = result.monitors;

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
        } catch { }
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
      let parsedHeaders: Record<string, string> | undefined = undefined;
      if (newHeaders.trim()) {
        try {
          parsedHeaders = JSON.parse(newHeaders);
        } catch {
          addError = "Headers must be a valid JSON object";
          addLoading = false;
          return;
        }
      }

      const projectId = localStorage.getItem("hiai-observe-project-id") ?? "";

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
        dns_expected_value: newType === "dns" && newDnsExpectedValue ? newDnsExpectedValue : undefined,
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
    const expiry = (monitor as unknown as Record<string, unknown>).cert_expiry as string | undefined;
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
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-3">
      <h1 class="text-2xl font-bold">Uptime Monitoring</h1>
      <button type="button"
        onclick={() => { showAddModal = true; }}
        class="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)] transition-colors"
      >
        Add Monitor
      </button>
    </div>
    <div class="flex items-center gap-2">
      <!-- Period tabs -->
      <div class="flex rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-0.5">
        {#each periods as period (period.label)}
          <button type="button"
            onclick={() => { selectedPeriod = period.label; }}
            class="rounded-md px-3 py-1.5 text-xs font-medium transition-colors {selectedPeriod === period.label ? 'bg-[var(--color-accent)] text-white' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'}"
          >{period.label}</button>
        {/each}
      </div>
      <!-- Group filter -->
      {#if groups.length > 0}
        <select
          bind:value={selectedGroup}
          class="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)]"
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
    <div class="flex items-center gap-3 rounded-lg border border-[var(--color-danger)]/50 bg-[var(--color-danger-bg)] px-4 py-3 text-sm text-[var(--color-danger)]">
      <span class="flex-1">{error}</span>
      <button type="button" onclick={() => load()} class="rounded border border-[var(--color-danger)]/50 px-2.5 py-1 text-xs text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)] transition-colors">Retry</button>
    </div>
  {/if}

  {#if loading}
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {#each Array(3) as _, i (i)}
        <div class="h-40 animate-pulse rounded-lg bg-[var(--color-surface-raised)]"></div>
      {/each}
    </div>
  {:else if monitors.length === 0}
    <div class="flex flex-col items-center justify-center py-16">
      <svg class="mb-4 h-12 w-12 text-[var(--color-text-muted)] opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
      <p class="text-sm font-medium text-[var(--color-text-secondary)]">No monitors configured yet</p>
      <p class="mt-1 text-xs text-[var(--color-text-muted)]">Add uptime monitors to track your services</p>
      <button type="button" onclick={() => { showAddModal = true; }} class="mt-3 inline-block rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)] transition-colors">
        Add Monitor
      </button>
    </div>
  {:else}
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {#each monitors as monitor (monitor.id)}
        {@const certWarn = certExpiryWarning(monitor)}
        <div class="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4 transition-colors hover:border-[var(--color-accent)]/30">
          <div class="flex items-center justify-between mb-1">
            <div class="flex items-center gap-3">
              <span class="h-2.5 w-2.5 rounded-full {statusDot(monitor)}"></span>
              <h3 class="font-medium">{monitor.name}</h3>
            </div>
            <button type="button"
              onclick={() => handleDeleteMonitor(monitor.id)}
              class="text-[var(--color-text-muted)] hover:text-[var(--color-danger)] transition-colors p-1"
              title="Delete Monitor"
            >
              <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>
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
              <p class="text-xs text-[var(--color-text-muted)]">Uptime {selectedPeriod}</p>
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

  {#if showAddModal}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div class="w-full max-w-lg rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-xl">
        <div class="mb-4 flex items-center justify-between">
          <h2 class="text-xl font-bold">Add New Monitor</h2>
          <button type="button" onclick={() => { showAddModal = false; }} class="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]" title="Close">
            <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        {#if addError}
          <div class="mb-4 rounded-lg bg-[var(--color-danger-bg)] p-3 text-sm text-[var(--color-danger)]">
            {addError}
          </div>
        {/if}

        <form onsubmit={(e) => { e.preventDefault(); handleAddMonitor(); }} class="space-y-4">
          <div>
            <label class="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Name</label>
            <input type="text" bind:value={newName} required placeholder="My Service" class="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none" />
          </div>

          <div>
            <label class="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">URL / Endpoint</label>
            <input type="url" bind:value={newUrl} required placeholder="https://example.com" class="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none" />
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Type</label>
              <select bind:value={newType} class="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none">
                <option value="http">HTTP</option>
                <option value="tcp">TCP</option>
                <option value="dns">DNS</option>
                <option value="ping">PING</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Interval (seconds)</label>
              <input type="number" bind:value={newInterval} min="10" required class="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none" />
            </div>
          </div>

          <div>
            <label class="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Group (Optional)</label>
            <input type="text" bind:value={newGroup} placeholder="Production" class="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none" />
          </div>

          {#if newType === "http"}
            <div class="border-t border-[var(--color-border)] pt-4 space-y-4">
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">HTTP Method</label>
                  <select bind:value={newMethod} class="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none">
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="HEAD">HEAD</option>
                  </select>
                </div>
                <div>
                  <label class="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Max Redirects</label>
                  <input type="number" bind:value={newMaxRedirects} min="0" max="20" class="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none" />
                </div>
              </div>

              <div>
                <label class="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Headers (JSON, Optional)</label>
                <textarea bind:value={newHeaders} placeholder="Example: Key: value" rows="2" class="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-2 text-sm font-mono focus:border-[var(--color-accent)] focus:outline-none"></textarea>
              </div>

              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Expected Keyword</label>
                  <input type="text" bind:value={newKeyword} placeholder="success" class="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none" />
                </div>
                <div>
                  <label class="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Excluded Keyword</label>
                  <input type="text" bind:value={newKeywordNot} placeholder="error" class="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none" />
                </div>
              </div>

              <label class="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
                <input type="checkbox" bind:checked={newIgnoreSsl} class="rounded" />
                Ignore SSL Errors
              </label>
            </div>
          {/if}

          {#if newType === "dns"}
            <div class="border-t border-[var(--color-border)] pt-4 space-y-4">
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">DNS Record Type</label>
                  <select bind:value={newDnsRecordType} class="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none">
                    <option value="A">A</option>
                    <option value="AAAA">AAAA</option>
                    <option value="CNAME">CNAME</option>
                    <option value="MX">MX</option>
                    <option value="TXT">TXT</option>
                    <option value="NS">NS</option>
                  </select>
                </div>
                <div>
                  <label class="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Expected Value</label>
                  <input type="text" bind:value={newDnsExpectedValue} placeholder="1.2.3.4" class="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none" />
                </div>
              </div>
              <div>
                <label class="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Custom Resolver (Optional)</label>
                <input type="text" bind:value={newDnsResolver} placeholder="8.8.8.8" class="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none" />
              </div>
            </div>
          {/if}

          <div class="mt-6 flex justify-end gap-3 border-t border-[var(--color-border)] pt-4">
            <button type="button" onclick={() => { showAddModal = false; }} class="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-raised)] transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={addLoading} class="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50">
              {addLoading ? "Adding..." : "Add Monitor"}
            </button>
          </div>
        </form>
      </div>
    </div>
  {/if}
</div>
