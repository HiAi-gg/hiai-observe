<script lang="ts">
  import { getLogs, getLogStats, type LogEntry, type LogStats } from "$lib/api";
  import { wsManager } from "$lib/ws";
  import { debounce, stripAnsi, isJson, highlightJson, isStackTrace } from "$lib/utils";
  import LiveIndicator from "$lib/components/LiveIndicator.svelte";

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
  let paused = $state(false);
  let autoScroll = $state(true);
  let autoRefresh = $state(true);
  let logContainer = $state<HTMLDivElement | null>(null);
  let newCount = $state(0);
  let total = $state(0);
  let oldestLoaded = $state(false);

  // Stats
  let stats = $state<LogStats | null>(null);

  // Track expanded JSON/stack-trace entries by log ID
  let expandedJson = $state<Set<string>>(new Set());
  let expandedStack = $state<Set<string>>(new Set());

  async function load() {
    try {
      loading = true;
      error = null;
      const params: Record<string, string | number> = { limit: PAGE_SIZE, offset: 0 };
      if (containerFilter) params.container = containerFilter;
      if (levelFilter) params.level = levelFilter;
      if (searchQuery) params.search = searchQuery;
      const result = await getLogs(params as any);
      logs = result.data.logs;
      total = result.data.total;
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
      if (searchQuery) params.search = searchQuery;
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

  const debouncedLoad = debounce(load, 300);

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

    wsManager.connect("/ws/logs");
    const unsub = wsManager.subscribe("*", onWsMessage);
    const connInterval = setInterval(() => {
      connected = wsManager.connected;
    }, 1000);

    // Auto-refresh polling (every 5s when enabled)
    let refreshInterval: ReturnType<typeof setInterval> | null = null;
    if (autoRefresh) {
      refreshInterval = setInterval(() => {
        if (!paused) load();
      }, 5_000);
    }

    return () => {
      unsub();
      wsManager.disconnect("/ws/logs");
      clearInterval(connInterval);
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

  function cleanMessage(msg: string): string {
    return stripAnsi(msg);
  }

  function toggleAutoRefresh() {
    autoRefresh = !autoRefresh;
    if (autoRefresh) {
      load();
      loadStats();
    }
  }
</script>

<svelte:head><title>Logs | HiAi Observe</title></svelte:head>

<div class="flex h-full flex-col space-y-4">
  {#if error}
    <div class="flex items-center gap-3 rounded-lg border border-[var(--color-danger)]/50 bg-[var(--color-danger-bg)] px-4 py-3 text-sm text-[var(--color-danger)]">
      <svg class="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <span class="flex-1">{error}</span>
      <button onclick={() => load()} class="rounded border border-[var(--color-danger)]/50 px-2.5 py-1 text-xs text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)] transition-colors">Retry</button>
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

  <div class="flex items-center justify-between">
    <div class="flex items-center gap-3">
      <h1 class="text-2xl font-bold">Logs</h1>
      <LiveIndicator {connected} />
      {#if autoRefresh}
        <span class="rounded-full bg-[var(--color-success-bg)] px-2 py-0.5 text-xs text-[var(--color-success)]">Live</span>
      {/if}
    </div>
    <div class="flex items-center gap-2">
      {#if paused && newCount > 0}
        <button
          onclick={resume}
          class="rounded-md border border-[var(--color-accent)] bg-[var(--color-accent)]/10 px-3 py-1.5 text-sm text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent)]/20"
        >
          {newCount} new {newCount === 1 ? "entry" : "entries"}
        </button>
      {/if}
      <button
        onclick={() => { paused = !paused; }}
        class="rounded-md border px-3 py-1.5 text-sm transition-colors"
        class:border-[var(--color-warning)]={paused}
        class:text-[var(--color-warning)]={paused}
        class:border-[var(--color-border)]={!paused}
        class:text-[var(--color-text-secondary)]={!paused}
      >
        {paused ? "Resume" : "Pause"}
      </button>
      <button
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
    <input
      type="text"
      placeholder="Container filter..."
      bind:value={containerFilter}
      oninput={() => { oldestLoaded = false; debouncedLoad(); }}
      class="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-1.5 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:outline-none"
    />
    <input
      type="text"
      placeholder="Search logs..."
      value={searchQuery}
      oninput={onSearch}
      class="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-1.5 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:outline-none"
    />
  </div>

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
          <button
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
            {@const msg = cleanMessage(log.message)}
            {@const isJsonMsg = isJson(msg)}
            {@const isStack = isStackTrace(msg)}
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
                  <button
                    onclick={() => toggleJson(log.id)}
                    class="inline-flex items-center gap-1 text-[var(--color-accent)] hover:underline"
                  >
                    <span class="inline-block transition-transform {expandedJson.has(log.id) ? 'rotate-90' : ''}">&#9654;</span>
                    JSON
                  </button>
                  {#if expandedJson.has(log.id)}
                    <pre class="mt-1 overflow-x-auto rounded bg-[var(--color-surface-raised)] p-2 text-xs">{@html highlightJson(JSON.parse(msg))}</pre>
                  {:else}
                    <span class="text-[var(--color-text-muted)]">{msg.slice(0, 120)}{msg.length > 120 ? "..." : ""}</span>
                  {/if}
                {:else if isStack}
                  {@const lines = msg.split("\n")}
                  <button
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
                  {msg}
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</div>
