<script lang="ts">
import {
  createSavedSearch,
  deleteSavedSearch,
  getLogStats,
  getLogs,
  getLogsDownloadUrl,
  getLogVolume,
  getSavedSearches,
  type LogEntry,
  type LogStats,
  type LogVolumeBucket,
  type SavedSearch,
} from "$lib/api";
import AnsiText from "$lib/components/AnsiText.svelte";
import LiveIndicator from "$lib/components/LiveIndicator.svelte";
import { apiKey } from "$lib/stores.svelte";
import { debounce, highlightJson, isJson, isStackTrace, stripAnsi } from "$lib/utils";
import { wsManager } from "$lib/ws";

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
  } catch {
    /* optional */
  }
}

async function loadVolume() {
  try {
    volumeLoading = true;
    const params: Record<string, string> = { interval: "1h" };
    if (containerFilter) params.containerId = containerFilter;
    const result = await getLogVolume(params);
    volumeData = result.data;
  } catch {
    /* optional */
  } finally {
    volumeLoading = false;
  }
}

async function loadSavedSearches() {
  try {
    const result = await getSavedSearches();
    savedSearches = result.data;
  } catch {
    /* optional */
  }
}

const debouncedLoad = debounce(load, 300);

function clearLogList() {
  logs = [];
  total = 0;
}

function copyLogs() {
  const text = logs
    .map(
      (l) =>
        `[${new Date(l.timestamp).toLocaleTimeString()}] [${l.level.toUpperCase()}] [${l.container}] ${stripAnsi(l.message)}`,
    )
    .join("\n");
  navigator.clipboard.writeText(text);
}

function ansiToHtml(text: string): string {
  let html = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  html = html.replace(/\x1b\[0m/g, "</span>");
  const colors: Record<string, string> = {
    30: "ansi-black",
    31: "ansi-red",
    32: "ansi-green",
    33: "ansi-yellow",
    34: "ansi-blue",
    35: "ansi-magenta",
    36: "ansi-cyan",
    37: "ansi-white",
    90: "ansi-bright-black",
    91: "ansi-bright-red",
    92: "ansi-bright-green",
    93: "ansi-bright-yellow",
    94: "ansi-bright-blue",
    95: "ansi-bright-magenta",
    96: "ansi-bright-cyan",
    97: "ansi-bright-white",
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
  const sseUrl =
    `/api/logs/stream?key=${encodeURIComponent(key)}` +
    (containerFilter ? `&container=${encodeURIComponent(containerFilter)}` : "");
  const es = new EventSource(sseUrl);

  es.onopen = () => {
    connected = true;
  };

  es.onmessage = (event) => {
    try {
      const entry = JSON.parse(event.data);
      onWsMessage(entry);
    } catch {}
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
  if (level === "error") return "text-[var(--destructive)]";
  if (level === "warn") return "text-[var(--warning)]";
  if (level === "info") return "text-[var(--info)]";
  return "text-[var(--muted-foreground)]";
}

function levelBg(level: string) {
  if (level === "error") return "bg-[color-mix(in_oklch,var(--destructive)_18%,transparent)]";
  if (level === "warn") return "bg-[color-mix(in_oklch,var(--warning)_18%,transparent)]";
  return "";
}

function resume() {
  paused = false;
  newCount = 0;
  scrollToBottom();
}

function toggleJson(id: string) {
  const next = new Set(expandedJson);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expandedJson = next;
}

function toggleStack(id: string) {
  const next = new Set(expandedStack);
  if (next.has(id)) next.delete(id);
  else next.add(id);
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
  } catch {
    /* ignore */
  }
}

async function removeSavedSearch(id: string) {
  try {
    await deleteSavedSearch(id);
    savedSearches = savedSearches.filter((s) => s.id !== id);
  } catch {
    /* ignore */
  }
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

function sanitizeForFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "all";
}

function downloadLogsAsText() {
  if (logs.length === 0) return;
  const lines = logs.map((l) => {
    const ts = new Date(l.timestamp).toISOString();
    const level = (l.level || "").toUpperCase();
    const container = l.container || "unknown";
    const message = stripAnsi(l.message);
    return `[${ts}] [${level}] [${container}] ${message}`;
  });
  const content = lines.join("\n") + "\n";
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  const datePart = new Date().toISOString().slice(0, 10);
  const containerPart = sanitizeForFilename(containerFilter || "all");
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = `logs-${containerPart}-${datePart}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objectUrl);
}

// Volume chart helpers
function volumeMaxCount(): number {
  return Math.max(1, ...volumeData.map((b) => b.count));
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
  getLogs(params as any)
    .then((result) => {
      logs = result.data.logs;
      total = result.data.total;
      oldestLoaded = logs.length < PAGE_SIZE;
    })
    .catch(() => {});
}

function formatBucketLabel(time: string): string {
  const d = new Date(time);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
</script>

<svelte:head><title>Logs | HiAi Observe</title></svelte:head>

<div class="flex h-full flex-col space-y-4">
  {#if error}
    <div class="flex items-center gap-3 rounded-lg border border-[var(--destructive)]/50 bg-[color-mix(in_oklch,var(--destructive)_18%,transparent)] px-4 py-3 text-sm text-[var(--destructive)]">
      <svg class="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <span class="flex-1">{error}</span>
      <button type="button" onclick={() => load()} class="rounded border border-[var(--destructive)]/50 px-2.5 py-1 text-xs text-[var(--destructive)] hover:bg-[color-mix(in_oklch,var(--destructive)_18%,transparent)] transition-colors">Retry</button>
    </div>
  {/if}

  {#if regexError}
    <div class="flex items-center gap-3 rounded-lg border border-[var(--warning)]/50 bg-[color-mix(in_oklch,var(--warning)_18%,transparent)] px-4 py-3 text-sm text-[var(--warning)]">
      <svg class="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <span class="flex-1">{regexError}</span>
    </div>
  {/if}

  <!-- Stats summary cards -->
  {#if stats}
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
        <p class="text-xs text-[var(--muted-foreground)]">Total (24h)</p>
        <p class="text-lg font-bold">{stats.total24h.toLocaleString()}</p>
      </div>
      <div class="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
        <p class="text-xs text-[var(--muted-foreground)]">Errors</p>
        <p class="text-lg font-bold text-[var(--destructive)]">{(stats.byLevel['error'] ?? 0).toLocaleString()}</p>
      </div>
      <div class="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
        <p class="text-xs text-[var(--muted-foreground)]">Warnings</p>
        <p class="text-lg font-bold text-[var(--warning)]">{(stats.byLevel['warn'] ?? 0).toLocaleString()}</p>
      </div>
      <div class="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
        <p class="text-xs text-[var(--muted-foreground)]">Containers</p>
        <p class="text-lg font-bold">{stats.byContainer.length}</p>
      </div>
    </div>
  {/if}

  <!-- Log volume chart -->
  {#if volumeData.length > 0}
    <div class="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
      <div class="mb-2 flex items-center justify-between">
        <p class="text-xs font-medium text-[var(--muted-foreground)]">Log Volume (24h)</p>
        {#if volumeLoading}
          <span class="text-xs text-[var(--muted-foreground)]">Loading...</span>
        {/if}
      </div>
      <div class="flex items-end gap-px" style="height: 48px;">
        {#each volumeData as bucket (bucket.time)}
          {@const pct = Math.max(2, (bucket.count / volumeMaxCount()) * 100)}
          <button type="button"
            onclick={() => jumpToTime(bucket.time)}
            title="{formatBucketLabel(bucket.time)}: {bucket.count} logs"
            class="flex-1 min-w-[4px] rounded-t bg-[var(--primary)]/70 hover:bg-[var(--primary)] transition-colors cursor-pointer"
            style="height: {pct}%;"
          ></button>
        {/each}
      </div>
      <div class="mt-1 flex justify-between text-[10px] text-[var(--muted-foreground)]">
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
        <span class="rounded-full bg-[var(--accent)] px-2 py-0.5 text-xs text-[var(--muted-foreground)]">Auto-refresh</span>
      {/if}
    </div>
    <div class="flex items-center gap-2">
      {#if paused && newCount > 0}
        <button type="button"
          onclick={resume}
          class="rounded-md border border-[var(--primary)] bg-[var(--primary)]/10 px-3 py-1.5 text-sm text-[var(--primary)] transition-colors hover:bg-[var(--primary)]/20"
        >
          {newCount} new {newCount === 1 ? "entry" : "entries"}
        </button>
      {/if}
      <button type="button"
        onclick={() => { paused = !paused; }}
        class="rounded-md border px-3 py-1.5 text-sm transition-colors"
        class:border-[var(--warning)]={paused}
        class:text-[var(--warning)]={paused}
        class:border-[var(--border)]={!paused}
        class:text-[var(--muted-foreground)]={!paused}
      >
        {paused ? "Resume" : "Pause"}
      </button>
      <button type="button"
        onclick={toggleAutoRefresh}
        class="rounded-md border px-3 py-1.5 text-sm transition-colors"
        class:border-[var(--success)]={autoRefresh}
        class:text-[var(--success)]={autoRefresh}
        class:border-[var(--border)]={!autoRefresh}
        class:text-[var(--muted-foreground)]={!autoRefresh}
      >
        {autoRefresh ? "Auto-refresh ON" : "Auto-refresh OFF"}
      </button>
      <label class="flex items-center gap-1.5 text-sm text-[var(--muted-foreground)]">
        <input type="checkbox" bind:checked={autoScroll} class="rounded" />
        Auto-scroll
      </label>
      <button type="button"
        onclick={clearLogList}
        class="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--muted-foreground)] transition-colors hover:bg-[var(--card)]"
        title="Clear current logs view"
      >
        Clear
      </button>
      <button type="button"
        onclick={copyLogs}
        class="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--muted-foreground)] transition-colors hover:bg-[var(--card)]"
        title="Copy logs to clipboard"
      >
        Copy
      </button>
      <button type="button"
        onclick={downloadLogs}
        class="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--muted-foreground)] transition-colors hover:bg-[var(--card)]"
        title="Download filtered logs as CSV"
      >
        <svg class="inline-block h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
        Download
      </button>
      <button type="button"
        onclick={downloadLogsAsText}
        disabled={logs.length === 0}
        class="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--muted-foreground)] transition-colors hover:bg-[var(--card)] disabled:opacity-50 disabled:cursor-not-allowed"
        title="Download visible logs as a plain text file"
      >
        <svg class="inline-block h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
        Download .txt
      </button>
    </div>
  </div>

  <!-- Filters -->
  <div class="flex flex-wrap items-center gap-3">
    <select
      bind:value={levelFilter}
      onchange={() => { oldestLoaded = false; load(); }}
      class="rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm"
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
      class="rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm"
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
        class="flex-1 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:border-[var(--primary)] focus:outline-none"
        class:border-[var(--primary)]={regexMode}
      />
      <button type="button"
        onclick={toggleRegex}
        class="rounded-md border px-2.5 py-1.5 text-xs font-mono transition-colors"
        class:border-[var(--primary)]={regexMode}
        class:bg-[var(--primary)]={regexMode}
        class:text-white={regexMode}
        class:border-[var(--border)]={!regexMode}
        class:text-[var(--muted-foreground)]={!regexMode}
        title="Toggle regex mode"
      >
        .*
      </button>
      {#if searchQuery}
        <button type="button"
          onclick={() => { searchQuery = ""; oldestLoaded = false; load(); }}
          class="rounded-md border border-[var(--border)] px-2 py-1.5 text-xs text-[var(--muted-foreground)] hover:bg-[var(--card)]"
          title="Clear search"
        >
          x
        </button>
      {/if}
    </div>
    <button type="button"
      onclick={() => { showSaveDialog = !showSaveDialog; }}
      class="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--muted-foreground)] transition-colors hover:bg-[var(--card)]"
      title="Save current search"
    >
      Save
    </button>
  </div>

  <!-- Save search dialog -->
  {#if showSaveDialog}
    <div class="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--card)] p-3">
      <input
        type="text"
        placeholder="Search name..."
        bind:value={saveName}
        class="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-sm text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:border-[var(--primary)] focus:outline-none"
      />
      <button type="button"
        onclick={saveCurrentSearch}
        disabled={!saveName.trim() || !searchQuery.trim()}
        class="rounded-md bg-[var(--primary)] px-3 py-1.5 text-sm text-white transition-colors hover:opacity-90 disabled:opacity-50"
      >
        Save Search
      </button>
      <button type="button"
        onclick={() => { showSaveDialog = false; }}
        class="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--muted-foreground)]"
      >
        Cancel
      </button>
    </div>
  {/if}

  <!-- Saved searches -->
  {#if savedSearches.length > 0}
    <div class="flex flex-wrap items-center gap-2">
      <span class="text-xs text-[var(--muted-foreground)]">Saved:</span>
      {#each savedSearches as ss (ss.id)}
        <span class="inline-flex items-center gap-1">
          <button type="button"
            onclick={() => applySavedSearch(ss)}
            class="rounded-full border border-[var(--border)] px-2.5 py-0.5 text-xs text-[var(--muted-foreground)] transition-colors hover:bg-[var(--card)]"
          >
            {ss.name}
          </button>
          <button type="button"
            onclick={() => removeSavedSearch(ss.id)}
            class="text-xs text-[var(--muted-foreground)] hover:text-[var(--destructive)] px-1"
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
    class="flex-1 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--background)] font-mono text-xs"
  >
    {#if loading && logs.length === 0}
      <div class="p-4 space-y-2">
        {#each Array(15) as _, i (i)}
          <div class="flex gap-3 animate-pulse" style="opacity: {1 - i * 0.05}">
            <div class="h-4 w-16 rounded bg-[var(--accent)]"></div>
            <div class="h-4 w-10 rounded bg-[var(--accent)]"></div>
            <div class="h-4 w-20 rounded bg-[var(--accent)]"></div>
            <div class="h-4 flex-1 rounded bg-[var(--accent)]"></div>
          </div>
        {/each}
      </div>
    {:else if logs.length === 0}
      <div class="flex flex-col items-center justify-center py-20">
        <svg class="mb-4 h-12 w-12 text-[var(--muted-foreground)] opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
        <p class="text-sm font-medium text-[var(--muted-foreground)]">No logs found</p>
        <p class="mt-1 text-xs text-[var(--muted-foreground)]">Check that Docker containers are running and the socket is mounted</p>
      </div>
    {:else}
      <!-- Load older button -->
      {#if !oldestLoaded && total > logs.length}
        <div class="border-b border-[var(--border)] p-2 text-center">
          <button type="button"
            onclick={loadOlder}
            disabled={loadingOlder}
            class="rounded-md px-4 py-1.5 text-sm text-[var(--primary)] transition-colors hover:bg-[color-mix(in_oklch,var(--primary)_12%,transparent)] disabled:opacity-50"
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
            <tr class="border-b border-[var(--border)] {levelBg(log.level)} align-top">
              <td class="whitespace-nowrap px-3 py-1 text-[var(--muted-foreground)]">
                {new Date(log.timestamp).toLocaleTimeString()}
              </td>
              <td class="whitespace-nowrap px-3 py-1 {levelColor(log.level)} font-semibold uppercase">
                {log.level}
              </td>
              <td class="whitespace-nowrap px-3 py-1 text-[var(--muted-foreground)]">
                {log.container}
              </td>
              <td class="px-3 py-1 text-[var(--foreground)] break-all">
                {#if isJsonMsg}
                  {@const plainMsg = stripAnsi(log.message)}
                  <button type="button"
                    onclick={() => toggleJson(log.id)}
                    class="inline-flex items-center gap-1 text-[var(--primary)] hover:underline"
                  >
                    <span class="inline-block transition-transform {expandedJson.has(log.id) ? 'rotate-90' : ''}">&#9654;</span>
                    JSON
                  </button>
                  {#if expandedJson.has(log.id)}
                    <pre class="mt-1 overflow-x-auto rounded bg-[var(--card)] p-2 text-xs">{@html highlightJson(JSON.parse(plainMsg))}</pre>
                  {:else}
                    <span class="text-[var(--muted-foreground)]">{plainMsg.slice(0, 120)}{plainMsg.length > 120 ? "..." : ""}</span>
                  {/if}
                {:else if isStack}
                  {@const plainMsg = stripAnsi(log.message)}
                  {@const lines = plainMsg.split("\n")}
                  <button type="button"
                    onclick={() => toggleStack(log.id)}
                    class="inline-flex items-center gap-1 text-[var(--warning)] hover:underline"
                  >
                    <span class="inline-block transition-transform {expandedStack.has(log.id) ? 'rotate-90' : ''}">&#9654;</span>
                    Stack trace ({lines.length} lines)
                  </button>
                  {#if expandedStack.has(log.id)}
                    <pre class="mt-1 overflow-x-auto rounded bg-[var(--card)] p-2 text-xs">
{#each lines as line, i}<span class="{line.trimStart().startsWith('at ') || line.trimStart().startsWith('Traceback') ? 'text-[var(--destructive)]' : 'text-[var(--muted-foreground)]'}">{line}</span>{#if i < lines.length - 1}{"\n"}{/if}{/each}</pre>
                  {:else}
                    <span class="text-[var(--muted-foreground)]">{lines[0]?.slice(0, 120)}...</span>
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
