<script lang="ts">
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { getRelease, getReleaseHealth, getIssues, getProjects, type Release, type ReleaseHealth, type Issue, type Project } from "$lib/api";
  import { currentProject, showToast } from "$lib/stores.svelte";
  import { timeAgo } from "$lib/utils";
  import StatusBadge from "$lib/components/StatusBadge.svelte";
  import Pagination from "$lib/components/Pagination.svelte";

  const id: string = page.params.id ?? "";

  let release = $state<Release | null>(null);
  let health = $state<ReleaseHealth | null>(null);
  let projects = $state<Project[]>([]);
  let issues = $state<Issue[]>([]);
  let totalIssues = $state(0);
  let loading = $state(true);
  let issuesLoading = $state(false);
  let error = $state<string | null>(null);

  let pageNum = $state(1);
  const perPage = 10;

  async function loadReleaseData() {
    try {
      loading = true;
      error = null;

      // Load release, health and projects
      const [rel, hlth, projResult] = await Promise.all([
        getRelease(id),
        getReleaseHealth(id),
        getProjects(),
      ]);

      release = rel;
      health = hlth;
      projects = projResult.projects ?? [];

      // Set current project context to match this release
      if (release) {
        currentProject.current = release.projectId;
      }

      await loadIssues();
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load release details";
    } finally {
      loading = false;
    }
  }

  async function loadIssues() {
    if (!release) return;
    try {
      issuesLoading = true;
      // Fetch issues filtered by release environment
      const result = await getIssues({
        environment: release.environment,
        limit: perPage,
        offset: (pageNum - 1) * perPage,
      });
      issues = result.issues;
      totalIssues = result.total;
    } catch (e) {
      showToast("Failed to load issues for this release", "error");
    } finally {
      issuesLoading = false;
    }
  }

  $effect(() => {
    loadReleaseData();
  });

  $effect(() => {
    if (pageNum && release) {
      loadIssues();
    }
  });

  function getProjectName(projId: string): string {
    return projects.find((p) => p.id === projId)?.name ?? "Unknown";
  }

  function healthColor(score: "green" | "yellow" | "red"): string {
    if (score === "green") return "text-emerald-400";
    if (score === "yellow") return "text-amber-400";
    return "text-red-400";
  }

  function healthBg(score: "green" | "yellow" | "red"): string {
    if (score === "green") return "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
    if (score === "yellow") return "bg-amber-500/10 text-amber-400 border border-amber-500/20";
    return "bg-red-500/10 text-red-400 border border-red-500/20";
  }

  function envBadgeColor(env: string): string {
    if (env === "production") return "bg-red-900/40 text-red-300";
    if (env === "staging") return "bg-amber-900/40 text-amber-300";
    return "bg-blue-900/40 text-blue-300";
  }
</script>

<svelte:head>
  <title>Release {release?.version ?? ""} | HiAi Observe</title>
</svelte:head>

<div class="p-6 max-w-[1400px] mx-auto space-y-6">
  <!-- Back Button & Header -->
  <div class="space-y-4">
    <button
      onclick={() => goto("/releases")}
      class="inline-flex items-center gap-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
    >
      <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
      </svg>
      Back to Releases
    </button>

    {#if loading}
      <div class="h-12 w-1/3 animate-pulse rounded bg-[var(--color-surface-raised)]"></div>
    {:else if error}
      <div class="rounded-lg border border-[var(--color-danger)]/50 bg-[var(--color-danger-bg)] p-4 text-sm text-[var(--color-danger)]">
        {error}
      </div>
    {:else if release}
      <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div class="flex flex-wrap items-center gap-3">
            <h1 class="text-3xl font-extrabold tracking-tight text-[var(--color-text-primary)]">
              Release {release.version}
            </h1>
            <span class="rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider {envBadgeColor(release.environment)}">
              {release.environment}
            </span>
            {#if health}
              <span class="rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider {healthBg(health.healthScore)}">
                {health.healthScore} Health
              </span>
            {/if}
          </div>
          <p class="mt-2 text-sm text-[var(--color-text-muted)]">
            Project: <span class="font-semibold text-[var(--color-text-secondary)]">{getProjectName(release.projectId)}</span>
          </p>
        </div>
      </div>

      <!-- Stats Row -->
      {#if health}
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <!-- Health Score Card -->
          <div class="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-5 space-y-2">
            <span class="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Health Status</span>
            <div class="flex items-baseline gap-2">
              <span class="text-2xl font-bold capitalize {healthColor(health.healthScore)}">{health.healthScore}</span>
            </div>
            <p class="text-xs text-[var(--color-text-muted)]">Based on new issues rate</p>
          </div>

          <!-- New Issues Card -->
          <div class="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-5 space-y-2">
            <span class="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">New Issues</span>
            <div class="flex items-baseline gap-2">
              <span class="text-3xl font-extrabold text-[var(--color-text-primary)]">{health.newIssuesCount}</span>
            </div>
            <p class="text-xs text-[var(--color-text-muted)]">First seen after deployment</p>
          </div>

          <!-- Error Rate Card -->
          <div class="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-5 space-y-2">
            <span class="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Error Rate</span>
            <div class="flex items-baseline gap-2">
              <span class="text-3xl font-extrabold text-[var(--color-text-primary)]">{health.errorRate}</span>
              <span class="text-sm text-[var(--color-text-muted)]">/ hr</span>
            </div>
            <p class="text-xs text-[var(--color-text-muted)]">Events in observation window</p>
          </div>

          <!-- Window Card -->
          <div class="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-5 space-y-2">
            <span class="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Observation Window</span>
            <div class="flex items-baseline gap-2">
              <span class="text-3xl font-extrabold text-[var(--color-text-primary)]">{Math.round(health.windowHours)}</span>
              <span class="text-sm text-[var(--color-text-muted)]">hours</span>
            </div>
            <p class="text-xs text-[var(--color-text-muted)]">Deployed {timeAgo(release.deployedAt ?? release.createdAt)}</p>
          </div>
        </div>
      {/if}

      <!-- Issues Table Section -->
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-bold text-[var(--color-text-primary)]">Issues in this Environment</h2>
          <span class="text-xs text-[var(--color-text-muted)]">{totalIssues} issues found</span>
        </div>

        {#if issuesLoading && issues.length === 0}
          <div class="space-y-2">
            {#each Array(4) as _, i (i)}
              <div class="h-14 animate-pulse rounded-lg bg-[var(--color-surface-raised)]" style="opacity: {1 - i * 0.15}"></div>
            {/each}
          </div>
        {:else if issues.length === 0}
          <div class="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-raised)] py-16">
            <svg class="mb-4 h-12 w-12 text-[var(--color-text-muted)] opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
            <p class="text-sm font-medium text-[var(--color-text-secondary)]">No issues in this environment</p>
            <p class="mt-1 text-xs text-[var(--color-text-muted)]">Excellent! No errors have been reported for this release's environment.</p>
          </div>
        {:else}
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
                        <div class="flex items-center gap-2">
                          <span class="text-xs text-[var(--color-text-muted)]">{issue.type}</span>
                          {#if issue.environment}
                            <span class="rounded-full px-1.5 py-0.5 text-[10px] font-medium {issue.environment === 'production' ? 'bg-red-900/40 text-red-300' : issue.environment === 'staging' ? 'bg-amber-900/40 text-amber-300' : 'bg-blue-900/40 text-blue-300'}">{issue.environment}</span>
                          {/if}
                        </div>
                      </div>
                    </td>
                    <td class="px-4 py-3.5 text-right tabular-nums text-[var(--color-text-secondary)]">{issue.count.toLocaleString()}</td>
                    <td class="px-4 py-3.5 text-[var(--color-text-muted)] text-xs">{timeAgo(issue.firstSeen)}</td>
                    <td class="px-4 py-3.5 text-[var(--color-text-muted)] text-xs">{timeAgo(issue.lastSeen)}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>

          <Pagination page={pageNum} {perPage} total={totalIssues} onPageChange={(p) => pageNum = p} />
        {/if}
      </div>
    {/if}
  </div>
</div>
