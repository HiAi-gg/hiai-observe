<script lang="ts">
import { goto } from "$app/navigation";
import Pagination from "$lib/adapters/PaginationAdapter.svelte";
import StatusBadge from "$lib/adapters/StatusBadgeAdapter.svelte";
import {
  type FingerprintRule,
  getFingerprintRules,
  getIssues,
  getTeamMembers,
  type Issue,
  type TeamMember,
} from "$lib/api";
import { debounce, timeAgo } from "$lib/utils";

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

async function load(silent = false) {
  try {
    if (!silent) loading = true;
    error = null;
    const params: Record<string, string | number> = {
      limit: perPage,
      offset: (page - 1) * perPage,
    };
    if (statusFilter !== "all") params.status = statusFilter;
    if (environmentFilter !== "all") params.environment = environmentFilter;
    if (levelFilter !== "all") params.level = levelFilter;
    if (searchQuery) params.search = searchQuery;
    const result = await getIssues(params as any);
    issues = result.issues ?? [];
    total = result.total ?? 0;
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load issues";
  } finally {
    loading = false;
  }
}

const debouncedLoad = debounce(() => load(), 300);

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

// Background auto-refresh (silent — keeps current data/filters, no spinner)
$effect(() => {
  const interval = setInterval(() => load(true), 15_000);
  return () => clearInterval(interval);
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
          const textToMatch =
            rule.groupBy === "stack"
              ? (issue.metadata?.stackTrace as string) || ""
              : rule.groupBy === "type"
                ? issue.type || ""
                : issue.title || "";
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
      const textToMatch =
        rule.groupBy === "stack"
          ? (issue.metadata?.stackTrace as string) || ""
          : rule.groupBy === "type"
            ? issue.type || ""
            : issue.title || "";
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
      <h1 class="text-2xl font-bold text-[var(--foreground)]">Issues</h1>
      <p class="mt-1 text-sm text-[var(--muted-foreground)]">{total} total issues</p>
    </div>
  </div>

  <!-- Error banner -->
  {#if error}
    <div class="flex items-center gap-3 rounded-lg border border-[var(--destructive)]/50 bg-[color-mix(in_oklch,var(--destructive)_18%,transparent)] px-4 py-3 text-sm text-[var(--destructive)]">
      <svg class="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <span class="flex-1">{error}</span>
      <button type="button" onclick={() => load()} class="rounded border border-[var(--destructive)]/50 px-2.5 py-1 text-xs text-[var(--destructive)] hover:bg-[color-mix(in_oklch,var(--destructive)_18%,transparent)] transition-colors">Retry</button>
    </div>
  {/if}

  <!-- Filters -->
  <div class="space-y-3">
    <!-- Status filter -->
    <div class="flex flex-wrap items-center gap-3">
      <span class="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">Status:</span>
      <div class="flex rounded-lg border border-[var(--border)] bg-[var(--card)] p-0.5">
        {#each statusTabs as tab (tab)}
          <button type="button"
            onclick={() => { statusFilter = tab; }}
            class="rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-all duration-150"
            class:bg-[var(--primary)]={statusFilter === tab}
            class:text-white={statusFilter === tab}
            class:shadow-sm={statusFilter === tab}
            class:text-[var(--muted-foreground)]={statusFilter !== tab}
            class:hover:text-[var(--foreground)]={statusFilter !== tab}
            class:hover:bg-[var(--accent)]={statusFilter !== tab}
          >
            {tab}
          </button>
        {/each}
      </div>

      <!-- Search -->
      <div class="relative flex-1 max-w-xs">
        <svg class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input
          type="text"
          placeholder="Search issues..."
          value={searchQuery}
          oninput={onSearch}
          class="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] py-2 pl-9 pr-3 text-sm text-[var(--foreground)] placeholder-[var(--muted-foreground)] transition-colors focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]/30"
        />
      </div>
    </div>

    <!-- Environment + Level filters -->
    <div class="flex flex-wrap items-center gap-6">
      <!-- Environment filter -->
      <div class="flex items-center gap-2">
        <span class="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">Env:</span>
        <div class="flex rounded-lg border border-[var(--border)] bg-[var(--card)] p-0.5">
          {#each envTabs as tab (tab)}
            <button type="button"
              onclick={() => { environmentFilter = tab; }}
              class="rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-all duration-150"
              class:bg-[var(--primary)]={environmentFilter === tab}
              class:text-white={environmentFilter === tab}
              class:shadow-sm={environmentFilter === tab}
              class:text-[var(--muted-foreground)]={environmentFilter !== tab}
              class:hover:text-[var(--foreground)]={environmentFilter !== tab}
              class:hover:bg-[var(--accent)]={environmentFilter !== tab}
            >
              {tab === "development" ? "dev" : tab}
            </button>
          {/each}
        </div>
      </div>

      <!-- Level filter -->
      <div class="flex items-center gap-2">
        <span class="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">Level:</span>
        <div class="flex rounded-lg border border-[var(--border)] bg-[var(--card)] p-0.5">
          {#each levelTabs as tab (tab)}
            <button type="button"
              onclick={() => { levelFilter = tab; }}
              class="rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-all duration-150"
              class:bg-[var(--primary)]={levelFilter === tab}
              class:text-white={levelFilter === tab}
              class:shadow-sm={levelFilter === tab}
              class:text-[var(--muted-foreground)]={levelFilter !== tab}
              class:hover:text-[var(--foreground)]={levelFilter !== tab}
              class:hover:bg-[var(--accent)]={levelFilter !== tab}
            >
              {tab}
            </button>
          {/each}
        </div>
      </div>

      <!-- Assignee filter -->
      <div class="flex items-center gap-2">
        <span class="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">Assignee:</span>
        <select
          bind:value={assignedToFilter}
          class="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2.5 py-1.5 text-xs font-medium text-[var(--muted-foreground)] focus:border-[var(--primary)] focus:outline-none"
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
        <span class="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">Rule:</span>
        <select
          bind:value={fingerprintRuleFilter}
          class="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2.5 py-1.5 text-xs font-medium text-[var(--muted-foreground)] focus:border-[var(--primary)] focus:outline-none"
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
        <div class="h-14 animate-pulse rounded-lg bg-[var(--card)]" style="opacity: {1 - i * 0.1}"></div>
      {/each}
    </div>
  {:else if filteredIssues.length === 0}
    <!-- Empty state -->
    <div class="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] py-20">
      <svg class="mb-4 h-12 w-12 text-[var(--muted-foreground)] opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
      <p class="text-sm font-medium text-[var(--muted-foreground)]">No issues found</p>
      <p class="mt-1 text-xs text-[var(--muted-foreground)]">
        {#if searchQuery || statusFilter !== "all" || environmentFilter !== "all" || levelFilter !== "all" || assignedToFilter !== "all" || fingerprintRuleFilter !== "all"}
          Try adjusting your filters
        {:else}
          Issues will appear here when errors are captured
        {/if}
      </p>
    </div>
  {:else}
    <!-- Table -->
    <div class="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
      <table class="w-full text-left text-sm">
        <thead class="border-b border-[var(--border)] bg-[var(--accent)]/50">
          <tr>
            <th class="px-4 py-3 font-medium text-[var(--muted-foreground)] text-xs uppercase tracking-wider" style="width: 32px"></th>
            <th class="px-4 py-3 font-medium text-[var(--muted-foreground)] text-xs uppercase tracking-wider">Title</th>
            <th class="px-4 py-3 font-medium text-[var(--muted-foreground)] text-xs uppercase tracking-wider">Assignee</th>
            <th class="px-4 py-3 font-medium text-[var(--muted-foreground)] text-xs uppercase tracking-wider">Matching Rule</th>
            <th class="px-4 py-3 font-medium text-[var(--muted-foreground)] text-xs uppercase tracking-wider text-right">Occurrences</th>
            <th class="px-4 py-3 font-medium text-[var(--muted-foreground)] text-xs uppercase tracking-wider">First seen</th>
            <th class="px-4 py-3 font-medium text-[var(--muted-foreground)] text-xs uppercase tracking-wider">Last seen</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-[var(--border)]">
          {#each filteredIssues as issue (issue.id)}
            <tr
              class="cursor-pointer transition-colors hover:bg-[var(--primary)]/5 group"
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
                  <span class="font-medium text-[var(--foreground)] group-hover:text-[var(--primary)] transition-colors">{issue.title}</span>
                  <div class="flex items-center gap-2">
                    <span class="text-xs text-[var(--muted-foreground)]">{issue.type}</span>
                    {#if issue.environment}
                      <span class="rounded-full px-1.5 py-0.5 text-[10px] font-medium {issue.environment === 'production' ? 'bg-red-900/40 text-red-300' : issue.environment === 'staging' ? 'bg-amber-900/40 text-amber-300' : 'bg-blue-900/40 text-blue-300'}">{issue.environment}</span>
                    {/if}
                  </div>
                </div>
              </td>
              <td class="px-4 py-3.5 text-xs text-[var(--muted-foreground)]">
                {getAssigneeName(issue.assignedTo)}
              </td>
              <td class="px-4 py-3.5 text-xs">
                {#if getMatchingRuleName(issue)}
                  <span class="rounded-full bg-[var(--primary)]/10 px-2 py-0.5 font-medium text-[var(--primary)]">
                    {getMatchingRuleName(issue)}
                  </span>
                {:else}
                  <span class="text-[var(--muted-foreground)]">None</span>
                {/if}
              </td>
              <td class="px-4 py-3.5 text-right tabular-nums text-[var(--muted-foreground)]">{issue.count.toLocaleString()}</td>
              <td class="px-4 py-3.5 text-[var(--muted-foreground)] text-xs">{timeAgo(issue.firstSeen)}</td>
              <td class="px-4 py-3.5 text-[var(--muted-foreground)] text-xs">{timeAgo(issue.lastSeen)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <Pagination {page} {perPage} total={filteredIssues.length} onPageChange={(p) => { page = p; load(); }} />
  {/if}
</div>
