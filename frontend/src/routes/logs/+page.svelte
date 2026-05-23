<script lang="ts">
  import { onMount } from "svelte";
  import { getLogs, type LogEntry } from "$lib/api";
  import { wsManager } from "$lib/ws";
  import { debounce } from "$lib/utils";
  import LiveIndicator from "$lib/components/LiveIndicator.svelte";
  import Pagination from "$lib/components/Pagination.svelte";

  const MAX_LOGS = 1000;

  let logs = $state<LogEntry[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let connected = $state(false);
  let containerFilter = $state("");
  let levelFilter = $state("");
  let searchQuery = $state("");
  let paused = $state(false);
  let autoScroll = $state(true);
  let logContainer = $state<HTMLDivElement | null>(null);
  let newCount = $state(0);
  let currentPage = $state(1);
  let perPage = $state(100);
  let total = $state(0);

  async function load() {
    try {
      loading = true;
      error = null;
      const offset = (currentPage - 1) * perPage;
      const params: Record<string, string> = { limit: String(perPage), offset: String(offset) };
      if (containerFilter) params.container = containerFilter;
      if (levelFilter) params.level = levelFilter;
      if (searchQuery) params.search = searchQuery;
      const result = await getLogs(params as any);
      logs = result.logs;
      total = result.total;
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load logs";
    } finally {
      loading = false;
    }
  }

  function onPageChange(page: number) {
    currentPage = page;
    load();
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

    logs = [...logs, entry].slice(-MAX_LOGS);
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

    wsManager.connect("/ws/logs");
    const unsub = wsManager.subscribe("*", onWsMessage);
    const connInterval = setInterval(() => {
      connected = wsManager.connected;
    }, 1000);

    return () => {
      unsub();
      wsManager.disconnect("/ws/logs");
      clearInterval(connInterval);
    };
  });

  $effect(() => {
    if (logs.length) scrollToBottom();
  });

  function onSearch(e: Event) {
    searchQuery = (e.target as HTMLInputElement).value;
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

  <div class="flex items-center justify-between">
    <div class="flex items-center gap-3">
      <h1 class="text-2xl font-bold">Logs</h1>
      <LiveIndicator {connected} />
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
      onchange={load}
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
      oninput={debouncedLoad}
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
      <p class="p-4 text-[var(--color-text-muted)]">Loading logs...</p>
    {:else if logs.length === 0}
      <p class="p-4 text-[var(--color-text-muted)]">No logs found</p>
    {:else}
      <table class="w-full">
        <tbody>
          {#each logs as log (log.id)}
            <tr class="border-b border-[var(--color-border)] {levelBg(log.level)}">
              <td class="whitespace-nowrap px-3 py-1 text-[var(--color-text-muted)]">
                {new Date(log.timestamp).toLocaleTimeString()}
              </td>
              <td class="whitespace-nowrap px-3 py-1 {levelColor(log.level)} font-semibold uppercase">
                {log.level}
              </td>
              <td class="whitespace-nowrap px-3 py-1 text-[var(--color-text-secondary)]">
                {log.container}
              </td>
              <td class="px-3 py-1 text-[var(--color-text-primary)] break-all">{log.message}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>

  <!-- Pagination -->
  {#if total > perPage}
    <div class="shrink-0">
      <Pagination {page} {perPage} {total} {onPageChange} />
    </div>
  {/if}
</div>
