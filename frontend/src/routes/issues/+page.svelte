<script lang="ts">
  import { goto } from "$app/navigation";
  import { getIssues, getTeamMembers, getFingerprintRules, type Issue, type TeamMember, type FingerprintRule } from "$lib/api";
  import { debounce, timeAgo } from "$lib/utils";
  import StatusBadge from "$lib/components/StatusBadge.svelte";
  import Pagination from "$lib/components/Pagination.svelte";

  let issues = $state<Issue[]>([]);
  let teamMembers = $state<TeamMember[]>([]);
  let fingerprintRules = $state<FingerprintRule[]>([]);
  let total = $state(0);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let statusFilter = $state<string>("all");
  let environmentFilter = $state<string>("all");
  let levelFilter = $state<string>("all");
  let assignedToFilter = $state<string>("all");
  let fingerprintRuleFilter = $state<string>("all");
  let searchQuery = $state("");
  let page = $state(1);
  const perPage = 25;

  async function loadMetadata() {
    try {
      const [teamResult, rulesResult] = await Promise.all([
        getTeamMembers({ limit: 100 }).catch(() => ({ data: [] })),
        getFingerprintRules({ limit: 100 }).catch(() => ({ data: [] })),
      ]);
      teamMembers = teamResult.data ?? [];
      fingerprintRules = rulesResult.data ?? [];
    } catch {
      // silent
    }
  }

  async function load() {
    try {
      loading = true;
      error = null;
      const params: Record<string, string | number> = { limit: perPage, offset: (page - 1) * perPage };
      if (statusFilter !== "all") params.status = statusFilter;
      if (environmentFilter !== "all") params.environment = environmentFilter;
      if (levelFilter !== "all") params.level = levelFilter;
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
    loadMetadata();
  });

  $effect(() => {
    statusFilter;
    environmentFilter;
    levelFilter;
    searchQuery;
    page = 1;
    load();
  });

  // Client-side reactive filter for Assignee and Fingerprint Rule
  const filteredIssues = $derived.by(() => {
    return issues.filter((issue) => {
      // Filter by Assignee
      if (assignedToFilter !== "all") {
        if (assignedToFilter === "unassigned") {
          if (issue.assignedTo) return false;
        } else {
          if (issue.assignedTo !== assignedToFilter) return false;
        }
      }

      // Filter by Fingerprint Rule
      if (fingerprintRuleFilter !== "all") {
        const rule = fingerprintRules.find((r) => r.id === fingerprintRuleFilter);
        if (rule) {
          try {
            const regex = new RegExp(rule.pattern, "i");
            const textToMatch = rule.groupBy === "stack" ? (issue.metadata?.stackTrace as string || "") : rule.groupBy === "type" ? (issue.type || "") : (issue.title || "");
            if (!regex.test(textToMatch)) return false;
          } catch {
            return false;
          }
        }
      }
      return true;
    });
  });

  function getAssigneeName(assigneeId?: string | null): string {
    if (!assigneeId) return "Unassigned";
    return teamMembers.find((m) => m.id === assigneeId)?.name ?? "Unknown";
  }

  function getMatchingRuleName(issue: Issue): string | null {
    for (const rule of fingerprintRules) {
      if (!rule.isActive) continue;
      try {
        const regex = new RegExp(rule.pattern, "i");
        const textToMatch = rule.groupBy === "stack" ? (issue.metadata?.stackTrace as string || "") : rule.groupBy === "type" ? (issue.type || "") : (issue.title || "");
        if (regex.test(textToMatch)) {
          return rule.name;
        }
      } catch {
        // ignore
      }
    }
    return null;
  }

  function onSearch(e: Event) {
    searchQuery = (e.target as HTMLInputElement).value;
    page = 1;
    debouncedLoad();
  }

  const statusTabs = ["all", "unresolved", "resolved", "ignored"] as const;
  const envTabs = ["all", "production", "staging", "development"] as const;
  const levelTabs = ["all", "error", "warning", "info"] as const;


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
  <div class="space-y-3">
    <!-- Status filter -->
    <div class="flex flex-wrap items-center gap-3">
      <span class="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Status:</span>
      <div class="flex rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-0.5">
        {#each statusTabs as tab (tab)}
          <button
            onclick={() => { statusFilter = tab; }}
            class="rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-all duration-150"
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

      <!-- Search -->
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

    <!-- Environment + Level filters -->
    <div class="flex flex-wrap items-center gap-6">
      <!-- Environment filter -->
      <div class="flex items-center gap-2">
        <span class="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Env:</span>
        <div class="flex rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-0.5">
          {#each envTabs as tab (tab)}
            <button
              onclick={() => { environmentFilter = tab; }}
              class="rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-all duration-150"
              class:bg-[var(--color-accent)]={environmentFilter === tab}
              class:text-white={environmentFilter === tab}
              class:shadow-sm={environmentFilter === tab}
              class:text-[var(--color-text-secondary)]={environmentFilter !== tab}
              class:hover:text-[var(--color-text-primary)]={environmentFilter !== tab}
              class:hover:bg-[var(--color-surface-overlay)]={environmentFilter !== tab}
            >
              {tab === "development" ? "dev" : tab}
            </button>
          {/each}
        </div>
      </div>

      <!-- Level filter -->
      <div class="flex items-center gap-2">
        <span class="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Level:</span>
        <div class="flex rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-0.5">
          {#each levelTabs as tab (tab)}
            <button
              onclick={() => { levelFilter = tab; }}
              class="rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-all duration-150"
              class:bg-[var(--color-accent)]={levelFilter === tab}
              class:text-white={levelFilter === tab}
              class:shadow-sm={levelFilter === tab}
              class:text-[var(--color-text-secondary)]={levelFilter !== tab}
              class:hover:text-[var(--color-text-primary)]={levelFilter !== tab}
              class:hover:bg-[var(--color-surface-overlay)]={levelFilter !== tab}
            >
              {tab}
            </button>
          {/each}
        </div>
      </div>

      <!-- Assignee filter -->
      <div class="flex items-center gap-2">
        <span class="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Assignee:</span>
        <select
          bind:value={assignedToFilter}
          class="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] focus:border-[var(--color-accent)] focus:outline-none"
        >
          <option value="all">All</option>
          <option value="unassigned">Unassigned</option>
          {#each teamMembers as member (member.id)}
            <option value={member.id}>{member.name}</option>
          {/each}
        </select>
      </div>

      <!-- Fingerprint Rule filter -->
      <div class="flex items-center gap-2">
        <span class="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Rule:</span>
        <select
          bind:value={fingerprintRuleFilter}
          class="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] focus:border-[var(--color-accent)] focus:outline-none"
        >
          <option value="all">All</option>
          {#each fingerprintRules as rule (rule.id)}
            <option value={rule.id}>{rule.name}</option>
          {/each}
        </select>
      </div>
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
  {:else if filteredIssues.length === 0}
    <!-- Empty state -->
    <div class="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-raised)] py-20">
      <svg class="mb-4 h-12 w-12 text-[var(--color-text-muted)] opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
      <p class="text-sm font-medium text-[var(--color-text-secondary)]">No issues found</p>
      <p class="mt-1 text-xs text-[var(--color-text-muted)]">
        {#if searchQuery || statusFilter !== "all" || environmentFilter !== "all" || levelFilter !== "all" || assignedToFilter !== "all" || fingerprintRuleFilter !== "all"}
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
            <th class="px-4 py-3 font-medium text-[var(--color-text-muted)] text-xs uppercase tracking-wider">Assignee</th>
            <th class="px-4 py-3 font-medium text-[var(--color-text-muted)] text-xs uppercase tracking-wider">Matching Rule</th>
            <th class="px-4 py-3 font-medium text-[var(--color-text-muted)] text-xs uppercase tracking-wider text-right">Occurrences</th>
            <th class="px-4 py-3 font-medium text-[var(--color-text-muted)] text-xs uppercase tracking-wider">First seen</th>
            <th class="px-4 py-3 font-medium text-[var(--color-text-muted)] text-xs uppercase tracking-wider">Last seen</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-[var(--color-border)]">
          {#each filteredIssues as issue (issue.id)}
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
                  <div class="flex items-center gap-2">
                    <span class="text-xs text-[var(--color-text-muted)]">{issue.type}</span>
                    {#if issue.environment}
                      <span class="rounded-full px-1.5 py-0.5 text-[10px] font-medium {issue.environment === 'production' ? 'bg-red-900/40 text-red-300' : issue.environment === 'staging' ? 'bg-amber-900/40 text-amber-300' : 'bg-blue-900/40 text-blue-300'}">{issue.environment}</span>
                    {/if}
                  </div>
                </div>
              </td>
              <td class="px-4 py-3.5 text-xs text-[var(--color-text-secondary)]">
                {getAssigneeName(issue.assignedTo)}
              </td>
              <td class="px-4 py-3.5 text-xs">
                {#if getMatchingRuleName(issue)}
                  <span class="rounded-full bg-[var(--color-accent)]/10 px-2 py-0.5 font-medium text-[var(--color-accent)]">
                    {getMatchingRuleName(issue)}
                  </span>
                {:else}
                  <span class="text-[var(--color-text-muted)]">None</span>
                {/if}
              </td>
              <td class="px-4 py-3.5 text-right tabular-nums text-[var(--color-text-secondary)]">{issue.count.toLocaleString()}</td>
              <td class="px-4 py-3.5 text-[var(--color-text-muted)] text-xs">{timeAgo(issue.firstSeen)}</td>
              <td class="px-4 py-3.5 text-[var(--color-text-muted)] text-xs">{timeAgo(issue.lastSeen)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <Pagination {page} {perPage} total={filteredIssues.length} onPageChange={(p) => { page = p; load(); }} />
  {/if}
</div>
