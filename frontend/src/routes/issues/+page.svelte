<script lang="ts">
  import { goto } from "$app/navigation";
  import { getIssues, type Issue } from "$lib/api";
  import { debounce, timeAgo } from "$lib/utils";
  import StatusBadge from "$lib/components/StatusBadge.svelte";

  let issues = $state<Issue[]>([]);
  let total = $state(0);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let statusFilter = $state<string>("all");
  let searchQuery = $state("");
  let offset = $state(0);
  const limit = 25;

  async function load() {
    try {
      loading = true;
      error = null;
      const params: Record<string, string | number> = { limit, offset };
      if (statusFilter !== "all") params.status = statusFilter;
      if (searchQuery) params.search = searchQuery;
      const result = await getIssues(params as any);
      issues = result.issues;
      total = result.total;
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load issues";
    } finally {
      loading = false;
    }
  }

  const debouncedLoad = debounce(load, 300);

  $effect(() => {
    statusFilter;
    searchQuery;
    offset = 0;
    load();
  });

  function onSearch(e: Event) {
    searchQuery = (e.target as HTMLInputElement).value;
    debouncedLoad();
  }

  const tabs = ["all", "unresolved", "resolved", "ignored"] as const;

  function statusDot(status: string) {
    if (status === "unresolved") return "bg-red-500";
    if (status === "resolved") return "bg-emerald-500";
    return "bg-gray-500";
  }

  const totalPages = $derived(Math.ceil(total / limit));
  const currentPage = $derived(Math.floor(offset / limit) + 1);
</script>

<svelte:head><title>Issues | HiAi Observe</title></svelte:head>

<div class="p-6 max-w-[1400px] mx-auto space-y-6">
  <!-- Header -->
  <div class="flex items-end justify-between">
    <div>
      <h1 class="text-2xl font-bold text-[var(--color-text-primary)]">Issues</h1>
      <p class="mt-1 text-sm text-[var(--color-text-muted)]">{total} total issues</p>
    </div>
  </div>

  <!-- Error banner -->
  {#if error}
    <div class="flex items-center gap-3 rounded-lg border border-[var(--color-danger)]/50 bg-[var(--color-danger-bg)] px-4 py-3 text-sm text-[var(--color-danger)]">
      <svg class="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <span class="flex-1">{error}</span>
      <button onclick={() => load()} class="rounded border border-[var(--color-danger)]/50 px-2.5 py-1 text-xs text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)] transition-colors">Retry</button>
    </div>
  {/if}

  <!-- Filters -->
  <div class="flex flex-wrap items-center gap-3">
    <div class="flex rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-0.5">
      {#each tabs as tab (tab)}
        <button
          onclick={() => { statusFilter = tab; }}
          class="rounded-md px-4 py-1.5 text-sm font-medium capitalize transition-all duration-150"
          class:bg-[var(--color-accent)]={statusFilter === tab}
          class:text-white={statusFilter === tab}
          class:shadow-sm={statusFilter === tab}
          class:text-[var(--color-text-secondary)]={statusFilter !== tab}
          class:hover:text-[var(--color-text-primary)]={statusFilter !== tab}
          class:hover:bg-[var(--color-surface-overlay)]={statusFilter !== tab}
        >
          {tab}
        </button>
      {/each}
    </div>

    <div class="relative flex-1 max-w-xs">
      <svg class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input
        type="text"
        placeholder="Search issues..."
        value={searchQuery}
        oninput={onSearch}
        class="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] py-2 pl-9 pr-3 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] transition-colors focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]/30"
      />
    </div>
  </div>

  <!-- Content -->
  {#if loading}
    <!-- Skeleton -->
    <div class="space-y-2">
      {#each Array(8) as _, i (i)}
        <div class="h-14 animate-pulse rounded-lg bg-[var(--color-surface-raised)]" style="opacity: {1 - i * 0.1}"></div>
      {/each}
    </div>
  {:else if issues.length === 0}
    <!-- Empty state -->
    <div class="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-raised)] py-20">
      <svg class="mb-4 h-12 w-12 text-[var(--color-text-muted)] opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
      <p class="text-sm font-medium text-[var(--color-text-secondary)]">No issues found</p>
      <p class="mt-1 text-xs text-[var(--color-text-muted)]">
        {#if searchQuery || statusFilter !== "all"}
          Try adjusting your filters
        {:else}
          Issues will appear here when errors are captured
        {/if}
      </p>
    </div>
  {:else}
    <!-- Table -->
    <div class="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)]">
      <table class="w-full text-left text-sm">
        <thead class="border-b border-[var(--color-border)] bg-[var(--color-surface-overlay)]/50">
          <tr>
            <th class="px-4 py-3 font-medium text-[var(--color-text-muted)] text-xs uppercase tracking-wider" style="width: 32px"></th>
            <th class="px-4 py-3 font-medium text-[var(--color-text-muted)] text-xs uppercase tracking-wider">Title</th>
            <th class="px-4 py-3 font-medium text-[var(--color-text-muted)] text-xs uppercase tracking-wider text-right">Occurrences</th>
            <th class="px-4 py-3 font-medium text-[var(--color-text-muted)] text-xs uppercase tracking-wider">First seen</th>
            <th class="px-4 py-3 font-medium text-[var(--color-text-muted)] text-xs uppercase tracking-wider">Last seen</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-[var(--color-border)]">
          {#each issues as issue (issue.id)}
            <tr
              class="cursor-pointer transition-colors hover:bg-[var(--color-accent)]/5 group"
              role="link"
              tabindex="0"
              onclick={() => goto(`/issues/${issue.id}`)}
              onkeydown={(e) => { if (e.key === 'Enter') goto(`/issues/${issue.id}`); }}
            >
              <td class="px-4 py-3.5">
                <StatusBadge status={issue.status} size="sm" />
              </td>
              <td class="px-4 py-3.5">
                <div class="flex flex-col gap-0.5">
                  <span class="font-medium text-[var(--color-text-primary)] group-hover:text-[var(--color-accent)] transition-colors">{issue.title}</span>
                  <span class="text-xs text-[var(--color-text-muted)]">{issue.type}</span>
                </div>
              </td>
              <td class="px-4 py-3.5 text-right tabular-nums text-[var(--color-text-secondary)]">{issue.count.toLocaleString()}</td>
              <td class="px-4 py-3.5 text-[var(--color-text-muted)] text-xs">{timeAgo(issue.first_seen)}</td>
              <td class="px-4 py-3.5 text-[var(--color-text-muted)] text-xs">{timeAgo(issue.last_seen)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    {#if total > limit}
      <div class="flex items-center justify-between pt-2">
        <span class="text-sm text-[var(--color-text-muted)]">
          Showing {offset + 1}&#8211;{Math.min(offset + limit, total)} of {total}
        </span>
        <div class="flex items-center gap-1">
          <button
            onclick={() => offset = Math.max(0, offset - limit)}
            disabled={offset === 0}
            class="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-overlay)] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            Previous
          </button>
          {#each Array(Math.min(totalPages, 5)) as _, i (i)}
            {@const page = i + 1}
            <button
              onclick={() => offset = (page - 1) * limit}
              class="h-8 w-8 rounded-md text-sm font-medium transition-all"
              class:bg-[var(--color-accent)]={currentPage === page}
              class:text-white={currentPage === page}
              class:text-[var(--color-text-secondary)]={currentPage !== page}
              class:hover:bg-[var(--color-surface-overlay)]={currentPage !== page}
            >
              {page}
            </button>
          {/each}
          <button
            onclick={() => offset += limit}
            disabled={offset + limit >= total}
            class="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-overlay)] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            Next
          </button>
        </div>
      </div>
    {/if}
  {/if}
</div>
