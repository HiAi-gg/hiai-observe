<script lang="ts">
  import { goto } from "$app/navigation";
  import { searchAll, type SearchResult } from "$lib/api";
  import { debounce, timeAgo } from "$lib/utils";

  let query = $state("");
  let results = $state<SearchResult | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let searched = $state(false);

  async function doSearch() {
    if (!query.trim() || query.trim().length < 2) {
      results = null;
      searched = false;
      return;
    }
    try {
      loading = true;
      error = null;
      results = await searchAll(query.trim());
      searched = true;
    } catch (e) {
      error = e instanceof Error ? e.message : "Search failed";
    } finally {
      loading = false;
    }
  }

  const debouncedSearch = debounce(doSearch, 400);

  function onInput(e: Event) {
    query = (e.target as HTMLInputElement).value;
    debouncedSearch();
  }

  function onSubmit(e: Event) {
    e.preventDefault();
    doSearch();
  }

  const totalResults = $derived(
    results ? results.issues.length + results.events.length + results.traces.length : 0
  );

  // Group results by project
  const groupedIssues = $derived.by(() => {
    if (!results) return new Map<string, typeof results.issues>();
    const map = new Map<string, typeof results.issues>();
    for (const issue of results.issues) {
      const list = map.get(issue.projectName) ?? [];
      list.push(issue);
      map.set(issue.projectName, list);
    }
    return map;
  });
</script>

<svelte:head><title>Search | HiAi Observe</title></svelte:head>

<div class="p-6 max-w-[1400px] mx-auto space-y-6">
  <!-- Header -->
  <div>
    <h1 class="text-2xl font-bold text-[var(--color-text-primary)]">Search</h1>
    <p class="mt-1 text-sm text-[var(--color-text-muted)]">Search across issues, events, and traces</p>
  </div>

  <!-- Search bar -->
  <form onsubmit={onSubmit} class="relative">
    <svg class="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
    <input
      type="text"
      placeholder="Search issues, events, traces..."
      value={query}
      oninput={onInput}
      class="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] py-3.5 pl-12 pr-4 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] transition-colors focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30"
    />
    {#if loading}
      <div class="absolute right-4 top-1/2 -translate-y-1/2">
        <div class="h-5 w-5 animate-spin rounded-full border-2 border-[var(--color-accent)] border-t-transparent"></div>
      </div>
    {/if}
  </form>

  <!-- Error -->
  {#if error}
    <div class="flex items-center gap-3 rounded-lg border border-[var(--color-danger)]/50 bg-[var(--color-danger-bg)] px-4 py-3 text-sm text-[var(--color-danger)]">
      <svg class="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <span>{error}</span>
    </div>
  {/if}

  <!-- Results summary -->
  {#if searched && results}
    <p class="text-sm text-[var(--color-text-muted)]">
      {totalResults} result{totalResults !== 1 ? 's' : ''} for "<span class="text-[var(--color-text-secondary)]">{query}</span>"
    </p>
  {/if}

  <!-- Results -->
  {#if searched && results && totalResults > 0}
    <!-- Issues grouped by project -->
    {#if results.issues.length > 0}
      <section class="space-y-3">
        <h2 class="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Issues ({results.issues.length})</h2>
        {#each [...groupedIssues.entries()] as [projectName, issues] (projectName)}
          <div class="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] overflow-hidden">
            <div class="border-b border-[var(--color-border)] bg-[var(--color-surface-overlay)]/50 px-4 py-2">
              <span class="text-xs font-medium text-[var(--color-text-muted)]">{projectName}</span>
            </div>
            <div class="divide-y divide-[var(--color-border)]">
              {#each issues as issue (issue.id)}
                <button
                  onclick={() => goto(`/issues/${issue.id}`)}
                  class="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-[var(--color-accent)]/5"
                >
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-sm font-medium text-[var(--color-text-primary)]">{issue.title}</p>
                    <p class="text-xs text-[var(--color-text-muted)]">{issue.type} &middot; {issue.count} occurrences</p>
                  </div>
                  <div class="flex items-center gap-3">
                    <span class="rounded-full px-2 py-0.5 text-xs font-medium {issue.status === 'resolved' ? 'bg-emerald-900/40 text-emerald-300' : issue.status === 'ignored' ? 'bg-slate-800/60 text-slate-400' : 'bg-red-900/40 text-red-300'}">{issue.status}</span>
                    <span class="text-xs text-[var(--color-text-muted)]">{timeAgo(issue.lastSeen)}</span>
                  </div>
                </button>
              {/each}
            </div>
          </div>
        {/each}
      </section>
    {/if}

    <!-- Events -->
    {#if results.events.length > 0}
      <section class="space-y-3">
        <h2 class="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Events ({results.events.length})</h2>
        <div class="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] overflow-hidden divide-y divide-[var(--color-border)]">
          {#each results.events as event (event.id)}
            <div class="flex items-center justify-between px-4 py-3">
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm text-[var(--color-text-primary)]">{event.message ?? event.exceptionType ?? "Event"}</p>
                <p class="text-xs text-[var(--color-text-muted)]">{event.projectName} &middot; {event.level ?? "unknown"}</p>
              </div>
              <span class="text-xs text-[var(--color-text-muted)]">{timeAgo(event.createdAt)}</span>
            </div>
          {/each}
        </div>
      </section>
    {/if}

    <!-- Traces -->
    {#if results.traces.length > 0}
      <section class="space-y-3">
        <h2 class="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Traces ({results.traces.length})</h2>
        <div class="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] overflow-hidden divide-y divide-[var(--color-border)]">
          {#each results.traces as trace (trace.id)}
            <button
              onclick={() => goto(`/traces/${trace.id}`)}
              class="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-[var(--color-accent)]/5"
            >
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium text-[var(--color-text-primary)]">{trace.name}</p>
                <p class="text-xs text-[var(--color-text-muted)]">{trace.projectName} &middot; {trace.status}</p>
              </div>
              <div class="flex items-center gap-3">
                {#if trace.durationMs}
                  <span class="text-xs text-[var(--color-text-secondary)]">{trace.durationMs}ms</span>
                {/if}
                <span class="text-xs text-[var(--color-text-muted)]">{timeAgo(trace.startTime)}</span>
              </div>
            </button>
          {/each}
        </div>
      </section>
    {/if}
  {:else if searched && results && totalResults === 0}
    <!-- Empty state -->
    <div class="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-raised)] py-20">
      <svg class="mb-4 h-12 w-12 text-[var(--color-text-muted)] opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <p class="text-sm font-medium text-[var(--color-text-secondary)]">No results found</p>
      <p class="mt-1 text-xs text-[var(--color-text-muted)]">Try a different search term</p>
    </div>
  {:else if !searched}
    <!-- Initial state -->
    <div class="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-raised)] py-20">
      <svg class="mb-4 h-12 w-12 text-[var(--color-text-muted)] opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <p class="text-sm font-medium text-[var(--color-text-secondary)]">Search across your projects</p>
      <p class="mt-1 text-xs text-[var(--color-text-muted)]">Type at least 2 characters to search</p>
    </div>
  {/if}
</div>
