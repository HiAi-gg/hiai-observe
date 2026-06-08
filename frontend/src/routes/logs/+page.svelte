<script lang="ts">
  import {
    getLogs, getLogStats, getLogVolume, getSavedSearches,
    createSavedSearch, deleteSavedSearch, getLogsDownloadUrl,
    type LogEntry, type LogStats, type LogVolumeBucket, type SavedSearch,
  } from "$lib/api";
  import { wsManager } from "$lib/ws";
  import { apiKey } from "$lib/stores.svelte";
  import { debounce, stripAnsi, isJson, highlightJson, isStackTrace } from "$lib/utils";
  import LiveIndicator from "$lib/components/LiveIndicator.svelte";
  import AnsiText from "$lib/components/AnsiText.svelte";

  const MAX_LIVE_LOGS = 1000;
  const PAGE_SIZE = 100;

  let logs = $state<LogEntry[]>([]);
  let loading = $state(true);
  let loadingOlder = $state(false);
  let error = $state<string | null>(null);
  let connected = $state(false);
  let containerFilter = $state("");
  let levelFilter = $state("");
  let searchQuery = $state("");
  let regexMode = $state(false);
  let regexError = $state<string | null>(null);
  let paused = $state(false);
  let autoScroll = $state(true);
  let autoRefresh = $state(true);
  let logContainer = $state<HTMLDivElement | null>(null);
  let newCount = $state(0);
  let total = $state(0);
  let oldestLoaded = $state(false);

  // Stats
  let stats = $state<LogStats | null>(null);

  // Log volume chart
  let volumeData = $state<LogVolumeBucket[]>([]);
  let volumeLoading = $state(false);

  // Saved searches
  let savedSearches = $state<SavedSearch[]>([]);
  let showSaveDialog = $state(false);
  let saveName = $state("");

  // Track expanded JSON/stack-trace entries by log ID
  let expandedJson = $state<Set<string>>(new Set());
  let expandedStack = $state<Set<string>>(new Set());

  async function load() {
    try {
      loading = true;
      error = null;
      regexError = null;
      const params: Record<string, string | number> = { limit: PAGE_SIZE, offset: 0 };
      if (containerFilter) params.container = containerFilter;
      if (levelFilter) params.level = levelFilter;
      if (regexMode && searchQuery) {
        params.regex = searchQuery;
      } else if (searchQuery) {
        params.search = searchQuery;
      }
      const result = await getLogs(params as any);
      if (result.error) {
        regexError = result.error;
        logs = [];
        total = 0;
      } else {
        logs = result.data.logs;
        total = result.data.total;
      }
      oldestLoaded = logs.length < PAGE_SIZE;
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load logs";
    } finally {
      loading = false;
    }
  }

  async function loadOlder() {
    if (loadingOlder || oldestLoaded) return;
    try {
      loadingOlder = true;
      const params: Record<string, string | number> = { limit: PAGE_SIZE, offset: logs.length };
      if (containerFilter) params.container = containerFilter;
      if (levelFilter) params.level = levelFilter;
      if (regexMode && searchQuery) {
        params.regex = searchQuery;
      } else if (searchQuery) {
        params.search = searchQuery;
      }
      const result = await getLogs(params as any);
      const older = result.data.logs;
      if (older.length < PAGE_SIZE) oldestLoaded = true;
      logs = [...logs, ...older];
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load older logs";
    } finally {
      loadingOlder = false;
    }
  }

  async function loadStats() {
    try {
      stats = await getLogStats();
    } catch { /* optional */ }
  }

  async function loadVolume() {
    try {
      volumeLoading = true;
      const params: Record<string, string> = { interval: "1h" };
      if (containerFilter) params.containerId = containerFilter;
      const result = await getLogVolume(params);
      volumeData = result.data;
    } catch { /* optional */ }
    finally { volumeLoading = false; }
  }

  async function loadSavedSearches() {
    try {
      const result = await getSavedSearches();
      savedSearches = result.data;
    } catch { /* optional */ }
  }

  const debouncedLoad = debounce(load, 300);

  function clearLogList() {
    logs = [];
    total = 0;
  }

  function copyLogs() {
    const text = logs.map(l => `[${new Date(l.timestamp).toLocaleTimeString()}] [${l.level.toUpperCase()}] [${l.container}] ${stripAnsi(l.message)}`).join("\n");
    navigator.clipboard.writeText(text);
  }

  function ansiToHtml(text: string): string {
    let html = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    html = html.replace(/\x1b\[0m/g, "</span>");
    const colors: Record<string, string> = {
      "30": "ansi-black",
      "31": "ansi-red",
      "32": "ansi-green",
      "33": "ansi-yellow",
      "34": "ansi-blue",
      "35": "ansi-magenta",
      "36": "ansi-cyan",
      "37": "ansi-white",
      "90": "ansi-bright-black",
      "91": "ansi-bright-red",
      "92": "ansi-bright-green",
      "93": "ansi-bright-yellow",
      "94": "ansi-bright-blue",
      "95": "ansi-bright-magenta",
      "96": "ansi-bright-cyan",
      "97": "ansi-bright-white",
    };
    for (const [code, cls] of Object.entries(colors)) {
      const regex = new RegExp(`\\x1b\\[${code}m`, "g");
      html = html.replace(regex, `<span class="${cls}">`);
    }
    html = html.replace(/\x1b\[[0-9;]*m/g, "");
    return html;
  }

  function onWsMessage(data: unknown) {
    if (paused) {
      newCount++;
      return;
    }

    const entry = data as LogEntry;
    if (containerFilter && entry.container !== containerFilter) return;
    if (levelFilter && entry.level !== levelFilter) return;

    logs = [...logs, entry].slice(-MAX_LIVE_LOGS);
    total += 1;
    newCount = 0;
  }

  function scrollToBottom() {
    if (autoScroll && logContainer) {
      requestAnimationFrame(() => {
        logContainer!.scrollTop = logContainer!.scrollHeight;
      });
    }
  }

  $effect(() => {
    load();
    loadStats();
    loadVolume();
    loadSavedSearches();

    const key = apiKey.current;
    const sseUrl = `/api/logs/stream?key=${encodeURIComponent(key)}` + (containerFilter ? `&container=${encodeURIComponent(containerFilter)}` : "");
    const es = new EventSource(sseUrl);

    es.onopen = () => {
      connected = true;
    };

    es.onmessage = (event) => {
      try {
        const entry = JSON.parse(event.data);
        onWsMessage(entry);
      } catch {
      }
    };

    es.onerror = () => {
      connected = false;
    };

    let refreshInterval: ReturnType<typeof setInterval> | null = null;
    if (autoRefresh) {
      refreshInterval = setInterval(() => {
        if (!paused) load();
      }, 5_000);
    }

    const volumeInterval = setInterval(loadVolume, 60_000);

    return () => {
      es.close();
      clearInterval(volumeInterval);
      if (refreshInterval) clearInterval(refreshInterval);
    };
  });

  $effect(() => {
    if (logs.length) scrollToBottom();
  });

  function onSearch(e: Event) {
    searchQuery = (e.target as HTMLInputElement).value;
    oldestLoaded = false;
    debouncedLoad();
  }

  function levelColor(level: string) {
    if (level === "error") return "text-[var(--color-danger)]";
    if (level === "warn") return "text-[var(--color-warning)]";
    if (level === "info") return "text-[var(--color-info)]";
    return "text-[var(--color-text-muted)]";
  }

  function levelBg(level: string) {
    if (level === "error") return "bg-[var(--color-danger-bg)]";
    if (level === "warn") return "bg-[var(--color-warning-bg)]";
    return "";
  }

  function resume() {
    paused = false;
    newCount = 0;
    scrollToBottom();
  }

  function toggleJson(id: string) {
    const next = new Set(expandedJson);
    if (next.has(id)) next.delete(id); else next.add(id);
    expandedJson = next;
  }

  function toggleStack(id: string) {
    const next = new Set(expandedStack);
    if (next.has(id)) next.delete(id); else next.add(id);
    expandedStack = next;
  }

  function toggleAutoRefresh() {
    autoRefresh = !autoRefresh;
    if (autoRefresh) {
      load();
      loadStats();
    }
  }

  function toggleRegex() {
    regexMode = !regexMode;
    regexError = null;
    oldestLoaded = false;
    load();
  }

  function applySavedSearch(ss: SavedSearch) {
    searchQuery = ss.query;
    if (ss.filters) {
      if (ss.filters.level) levelFilter = ss.filters.level as string;
      if (ss.filters.container) containerFilter = ss.filters.container as string;
      if (ss.filters.regex) regexMode = true;
    }
    oldestLoaded = false;
    load();
  }

  async function saveCurrentSearch() {
    if (!saveName.trim() || !searchQuery.trim()) return;
    try {
      await createSavedSearch({
        name: saveName.trim(),
        query: searchQuery,
        filters: {
          level: levelFilter || undefined,
          container: containerFilter || undefined,
          regex: regexMode || undefined,
        } as Record<string, unknown>,
      });
      saveName = "";
      showSaveDialog = false;
      await loadSavedSearches();
    } catch { /* ignore */ }
  }

  async function removeSavedSearch(id: string) {
    try {
      await deleteSavedSearch(id);
      savedSearches = savedSearches.filter(s => s.id !== id);
    } catch { /* ignore */ }
  }

  async function downloadLogs() {
    const url = getLogsDownloadUrl({ container: containerFilter, level: levelFilter, format: "csv" });
    const key = apiKey.current;
    const headers = new Headers();
    if (key) headers.set("Authorization", `Bearer ${key}`);
    try {
      const res = await fetch(url, { headers });
      if (!res.ok) {
        error = `Download failed: HTTP ${res.status}`;
        return;
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = "logs.csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch (e) {
      error = `Download error: ${(e as Error).message}`;
    }
  }

  // Volume chart helpers
  function volumeMaxCount(): number {
    return Math.max(1, ...volumeData.map(b => b.count));
  }

  function jumpToTime(time: string) {
    // Set "from" to the clicked bucket's time and reload
    // For simplicity, just reload with the from parameter
    const from = new Date(time).toISOString();
    const params: Record<string, string | number> = { limit: PAGE_SIZE, offset: 0, from };
    if (containerFilter) params.container = containerFilter;
    if (levelFilter) params.level = levelFilter;
    if (regexMode && searchQuery) params.regex = searchQuery;
    else if (searchQuery) params.search = searchQuery;
    getLogs(params as any).then(result => {
      logs = result.data.logs;
      total = result.data.total;
      oldestLoaded = logs.length < PAGE_SIZE;
    }).catch(() => {});
  }

  function formatBucketLabel(time: string): string {
    const d = new Date(time);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
</script>

<svelte:head><title>Logs | HiAi Observe</title></svelte:head>

<div class="flex h-full flex-col space-y-4">
  {#if error}
    <div class="flex items-center gap-3 rounded-lg border border-[var(--color-danger)]/50 bg-[var(--color-danger-bg)] px-4 py-3 text-sm text-[var(--color-danger)]">
      <svg class="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <span class="flex-1">{error}</span>
      <button type="button" onclick={() => load()} class="rounded border border-[var(--color-danger)]/50 px-2.5 py-1 text-xs text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)] transition-colors">Retry</button>
    </div>
  {/if}

  {#if regexError}
    <div class="flex items-center gap-3 rounded-lg border border-[var(--color-warning)]/50 bg-[var(--color-warning-bg)] px-4 py-3 text-sm text-[var(--color-warning)]">
      <svg class="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <span class="flex-1">{regexError}</span>
    </div>
  {/if}

  <!-- Stats summary cards -->
  {#if stats}
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-3">
        <p class="text-xs text-[var(--color-text-muted)]">Total (24h)</p>
        <p class="text-lg font-bold">{stats.total24h.toLocaleString()}</p>
      </div>
      <div class="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-3">
        <p class="text-xs text-[var(--color-text-muted)]">Errors</p>
        <p class="text-lg font-bold text-[var(--color-danger)]">{(stats.byLevel['error'] ?? 0).toLocaleString()}</p>
      </div>
      <div class="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-3">
        <p class="text-xs text-[var(--color-text-muted)]">Warnings</p>
        <p class="text-lg font-bold text-[var(--color-warning)]">{(stats.byLevel['warn'] ?? 0).toLocaleString()}</p>
      </div>
      <div class="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-3">
        <p class="text-xs text-[var(--color-text-muted)]">Containers</p>
        <p class="text-lg font-bold">{stats.byContainer.length}</p>
      </div>
    </div>
  {/if}

  <!-- Log volume chart -->
  {#if volumeData.length > 0}
    <div class="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-3">
      <div class="mb-2 flex items-center justify-between">
        <p class="text-xs font-medium text-[var(--color-text-muted)]">Log Volume (24h)</p>
        {#if volumeLoading}
          <span class="text-xs text-[var(--color-text-muted)]">Loading...</span>
        {/if}
      </div>
      <div class="flex items-end gap-px" style="height: 48px;">
        {#each volumeData as bucket (bucket.time)}
          {@const pct = Math.max(2, (bucket.count / volumeMaxCount()) * 100)}
          <button type="button"
            onclick={() => jumpToTime(bucket.time)}
            title="{formatBucketLabel(bucket.time)}: {bucket.count} logs"
            class="flex-1 min-w-[4px] rounded-t bg-[var(--color-accent)]/70 hover:bg-[var(--color-accent)] transition-colors cursor-pointer"
            style="height: {pct}%;"
          ></button>
        {/each}
      </div>
      <div class="mt-1 flex justify-between text-[10px] text-[var(--color-text-muted)]">
        {#if volumeData.length > 0}
          <span>{formatBucketLabel(volumeData[0].time)}</span>
          <span>{formatBucketLabel(volumeData[volumeData.length - 1].time)}</span>
        {/if}
      </div>
    </div>
  {/if}

  <div class="flex items-center justify-between">
    <div class="flex items-center gap-3">
      <h1 class="text-2xl font-bold">Logs</h1>
      <LiveIndicator {connected} />
      {#if autoRefresh}
        <span class="rounded-full bg-[var(--color-surface-overlay)] px-2 py-0.5 text-xs text-[var(--color-text-secondary)]">Auto-refresh</span>
      {/if}
    </div>
    <div class="flex items-center gap-2">
      {#if paused && newCount > 0}
        <button type="button"
          onclick={resume}
          class="rounded-md border border-[var(--color-accent)] bg-[var(--color-accent)]/10 px-3 py-1.5 text-sm text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent)]/20"
        >
          {newCount} new {newCount === 1 ? "entry" : "entries"}
        </button>
      {/if}
      <button type="button"
        onclick={() => { paused = !paused; }}
        class="rounded-md border px-3 py-1.5 text-sm transition-colors"
        class:border-[var(--color-warning)]={paused}
        class:text-[var(--color-warning)]={paused}
        class:border-[var(--color-border)]={!paused}
        class:text-[var(--color-text-secondary)]={!paused}
      >
        {paused ? "Resume" : "Pause"}
      </button>
      <button type="button"
        onclick={toggleAutoRefresh}
        class="rounded-md border px-3 py-1.5 text-sm transition-colors"
        class:border-[var(--color-success)]={autoRefresh}
        class:text-[var(--color-success)]={autoRefresh}
        class:border-[var(--color-border)]={!autoRefresh}
        class:text-[var(--color-text-secondary)]={!autoRefresh}
      >
        {autoRefresh ? "Auto-refresh ON" : "Auto-refresh OFF"}
      </button>
      <label class="flex items-center gap-1.5 text-sm text-[var(--color-text-muted)]">
        <input type="checkbox" bind:checked={autoScroll} class="rounded" />
        Auto-scroll
      </label>
      <button type="button"
        onclick={clearLogList}
        class="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-raised)]"
        title="Clear current logs view"
      >
        Clear
      </button>
      <button type="button"
        onclick={copyLogs}
        class="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-raised)]"
        title="Copy logs to clipboard"
      >
        Copy
      </button>
      <button type="button"
        onclick={downloadLogs}
        class="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-raised)]"
        title="Download filtered logs as CSV"
      >
        <svg class="inline-block h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
        Download
      </button>
    </div>
  </div>

  <!-- Filters -->
  <div class="flex flex-wrap items-center gap-3">
    <select
      bind:value={levelFilter}
      onchange={() => { oldestLoaded = false; load(); }}
      class="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-1.5 text-sm"
    >
      <option value="">All levels</option>
      <option value="error">Error</option>
      <option value="warn">Warning</option>
      <option value="info">Info</option>
      <option value="debug">Debug</option>
    </select>
    <select
      bind:value={containerFilter}
      onchange={() => { oldestLoaded = false; load(); }}
      class="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-1.5 text-sm"
    >
      <option value="">All containers</option>
      {#if stats?.byContainer}
        {#each stats.byContainer as c}
          <option value={c.name}>{c.name}</option>
        {/each}
      {/if}
    </select>
    <div class="relative flex-1 flex items-center gap-2">
      <input
        type="text"
        placeholder={regexMode ? "Regex pattern (e.g. ERROR|WARN)" : "Search logs..."}
        value={searchQuery}
        oninput={onSearch}
        class="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-1.5 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:outline-none"
        class:border-[var(--color-accent)]={regexMode}
      />
      <button type="button"
        onclick={toggleRegex}
        class="rounded-md border px-2.5 py-1.5 text-xs font-mono transition-colors"
        class:border-[var(--color-accent)]={regexMode}
        class:bg-[var(--color-accent)]={regexMode}
        class:text-white={regexMode}
        class:border-[var(--color-border)]={!regexMode}
        class:text-[var(--color-text-muted)]={!regexMode}
        title="Toggle regex mode"
      >
        .*
      </button>
      {#if searchQuery}
        <button type="button"
          onclick={() => { searchQuery = ""; oldestLoaded = false; load(); }}
          class="rounded-md border border-[var(--color-border)] px-2 py-1.5 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-surface-raised)]"
          title="Clear search"
        >
          x
        </button>
      {/if}
    </div>
    <button type="button"
      onclick={() => { showSaveDialog = !showSaveDialog; }}
      class="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-raised)]"
      title="Save current search"
    >
      Save
    </button>
  </div>

  <!-- Save search dialog -->
  {#if showSaveDialog}
    <div class="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-3">
      <input
        type="text"
        placeholder="Search name..."
        bind:value={saveName}
        class="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:outline-none"
      />
      <button type="button"
        onclick={saveCurrentSearch}
        disabled={!saveName.trim() || !searchQuery.trim()}
        class="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm text-white transition-colors hover:opacity-90 disabled:opacity-50"
      >
        Save Search
      </button>
      <button type="button"
        onclick={() => { showSaveDialog = false; }}
        class="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-text-secondary)]"
      >
        Cancel
      </button>
    </div>
  {/if}

  <!-- Saved searches -->
  {#if savedSearches.length > 0}
    <div class="flex flex-wrap items-center gap-2">
      <span class="text-xs text-[var(--color-text-muted)]">Saved:</span>
      {#each savedSearches as ss (ss.id)}
        <span class="inline-flex items-center gap-1">
          <button type="button"
            onclick={() => applySavedSearch(ss)}
            class="rounded-full border border-[var(--color-border)] px-2.5 py-0.5 text-xs text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-raised)]"
          >
            {ss.name}
          </button>
          <button type="button"
            onclick={() => removeSavedSearch(ss.id)}
            class="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-danger)] px-1"
            title="Delete saved search"
          >
            x
          </button>
        </span>
      {/each}
    </div>
  {/if}

  <!-- Log stream -->
  <div
    bind:this={logContainer}
    class="flex-1 overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] font-mono text-xs"
  >
    {#if loading && logs.length === 0}
      <div class="p-4 space-y-2">
        {#each Array(15) as _, i (i)}
          <div class="flex gap-3 animate-pulse" style="opacity: {1 - i * 0.05}">
            <div class="h-4 w-16 rounded bg-[var(--color-surface-overlay)]"></div>
            <div class="h-4 w-10 rounded bg-[var(--color-surface-overlay)]"></div>
            <div class="h-4 w-20 rounded bg-[var(--color-surface-overlay)]"></div>
            <div class="h-4 flex-1 rounded bg-[var(--color-surface-overlay)]"></div>
          </div>
        {/each}
      </div>
    {:else if logs.length === 0}
      <div class="flex flex-col items-center justify-center py-20">
        <svg class="mb-4 h-12 w-12 text-[var(--color-text-muted)] opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
        <p class="text-sm font-medium text-[var(--color-text-secondary)]">No logs found</p>
        <p class="mt-1 text-xs text-[var(--color-text-muted)]">Check that Docker containers are running and the socket is mounted</p>
      </div>
    {:else}
      <!-- Load older button -->
      {#if !oldestLoaded && total > logs.length}
        <div class="border-b border-[var(--color-border)] p-2 text-center">
          <button type="button"
            onclick={loadOlder}
            disabled={loadingOlder}
            class="rounded-md px-4 py-1.5 text-sm text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent-bg)] disabled:opacity-50"
          >
            {loadingOlder ? "Loading..." : `Load older (${total - logs.length} remaining)`}
          </button>
        </div>
      {/if}
      <table class="w-full">
        <tbody>
          {#each logs as log (log.id)}
            {@const isJsonMsg = isJson(stripAnsi(log.message))}
            {@const isStack = isStackTrace(stripAnsi(log.message))}
            <tr class="border-b border-[var(--color-border)] {levelBg(log.level)} align-top">
              <td class="whitespace-nowrap px-3 py-1 text-[var(--color-text-muted)]">
                {new Date(log.timestamp).toLocaleTimeString()}
              </td>
              <td class="whitespace-nowrap px-3 py-1 {levelColor(log.level)} font-semibold uppercase">
                {log.level}
              </td>
              <td class="whitespace-nowrap px-3 py-1 text-[var(--color-text-secondary)]">
                {log.container}
              </td>
              <td class="px-3 py-1 text-[var(--color-text-primary)] break-all">
                {#if isJsonMsg}
                  {@const plainMsg = stripAnsi(log.message)}
                  <button type="button"
                    onclick={() => toggleJson(log.id)}
                    class="inline-flex items-center gap-1 text-[var(--color-accent)] hover:underline"
                  >
                    <span class="inline-block transition-transform {expandedJson.has(log.id) ? 'rotate-90' : ''}">&#9654;</span>
                    JSON
                  </button>
                  {#if expandedJson.has(log.id)}
                    <pre class="mt-1 overflow-x-auto rounded bg-[var(--color-surface-raised)] p-2 text-xs">{@html highlightJson(JSON.parse(plainMsg))}</pre>
                  {:else}
                    <span class="text-[var(--color-text-muted)]">{plainMsg.slice(0, 120)}{plainMsg.length > 120 ? "..." : ""}</span>
                  {/if}
                {:else if isStack}
                  {@const plainMsg = stripAnsi(log.message)}
                  {@const lines = plainMsg.split("\n")}
                  <button type="button"
                    onclick={() => toggleStack(log.id)}
                    class="inline-flex items-center gap-1 text-[var(--color-warning)] hover:underline"
                  >
                    <span class="inline-block transition-transform {expandedStack.has(log.id) ? 'rotate-90' : ''}">&#9654;</span>
                    Stack trace ({lines.length} lines)
                  </button>
                  {#if expandedStack.has(log.id)}
                    <pre class="mt-1 overflow-x-auto rounded bg-[var(--color-surface-raised)] p-2 text-xs">
{#each lines as line, i}<span class="{line.trimStart().startsWith('at ') || line.trimStart().startsWith('Traceback') ? 'text-[var(--color-danger)]' : 'text-[var(--color-text-secondary)]'}">{line}</span>{#if i < lines.length - 1}{"\n"}{/if}{/each}</pre>
                  {:else}
                    <span class="text-[var(--color-text-muted)]">{lines[0]?.slice(0, 120)}...</span>
                  {/if}
                {:else}
                  {@html ansiToHtml(log.message)}
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</div>

<style>
  :global(.ansi-black) { color: #000000; }
  :global(.ansi-red) { color: #ef4444; }
  :global(.ansi-green) { color: #22c55e; }
  :global(.ansi-yellow) { color: #eab308; }
  :global(.ansi-blue) { color: #3b82f6; }
  :global(.ansi-magenta) { color: #a855f7; }
  :global(.ansi-cyan) { color: #06b6d4; }
  :global(.ansi-white) { color: #f8fafc; }
  :global(.ansi-bright-black) { color: #64748b; }
  :global(.ansi-bright-red) { color: #f87171; }
  :global(.ansi-bright-green) { color: #4ade80; }
  :global(.ansi-bright-yellow) { color: #facc15; }
  :global(.ansi-bright-blue) { color: #60a5fa; }
  :global(.ansi-bright-magenta) { color: #c084fc; }
  :global(.ansi-bright-cyan) { color: #22d3ee; }
  :global(.ansi-bright-white) { color: #ffffff; }
</style>
