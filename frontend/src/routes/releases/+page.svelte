<script lang="ts">
import ConfirmDialog from "$lib/adapters/ConfirmDialogAdapter.svelte";
import {
  createRelease,
  deleteRelease,
  getProjects,
  getReleaseHealth,
  getReleases,
  type Project,
  type Release,
  type ReleaseHealth,
} from "$lib/api";
import { showToast } from "$lib/stores.svelte";
import { timeAgo } from "$lib/utils";

let releases = $state<Release[]>([]);
let healthMap = $state<Record<string, ReleaseHealth>>({});
let projects = $state<Project[]>([]);
let total = $state(0);
let loading = $state(true);
let error = $state<string | null>(null);
let expandedId = $state<string | null>(null);

// Create form
let showCreateForm = $state(false);
let newVersion = $state("");
let newEnvironment = $state("production");
let newProjectId = $state("");
let creating = $state(false);

// Delete
let confirmDeleteId = $state<string | null>(null);
let showDeleteDialog = $state(false);

async function load() {
  try {
    loading = true;
    error = null;
    const [releaseResult, projectResult] = await Promise.all([
      getReleases({ limit: 100 }),
      getProjects(),
    ]);
    releases = releaseResult.data;
    total = releaseResult.total;
    projects = projectResult.projects ?? [];

    // Load health for each release
    const healthResults = await Promise.all(
      releases.map((r) => getReleaseHealth(r.id).catch(() => null)),
    );
    const newMap: Record<string, ReleaseHealth> = {};
    for (const h of healthResults) {
      if (h) newMap[h.releaseId] = h;
    }
    healthMap = newMap;
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load releases";
  } finally {
    loading = false;
  }
}

$effect(() => {
  load();
});

function getProjectName(id: string): string {
  return projects.find((p) => p.id === id)?.name ?? "Unknown";
}

function healthColor(score: "green" | "yellow" | "red"): string {
  if (score === "green") return "text-emerald-400";
  if (score === "yellow") return "text-amber-400";
  return "text-red-400";
}

function healthBg(score: "green" | "yellow" | "red"): string {
  if (score === "green") return "bg-emerald-400";
  if (score === "yellow") return "bg-amber-400";
  return "bg-red-400";
}

function envBadgeColor(env: string): string {
  if (env === "production") return "bg-red-900/40 text-red-300";
  if (env === "staging") return "bg-amber-900/40 text-amber-300";
  return "bg-blue-900/40 text-blue-300";
}

function healthBadgeColor(score: "green" | "yellow" | "red"): string {
  if (score === "green") return "bg-emerald-900/40 text-emerald-300 border border-emerald-500/20";
  if (score === "yellow") return "bg-amber-900/40 text-amber-300 border border-amber-500/20";
  return "bg-red-900/40 text-red-300 border border-red-500/20";
}

async function handleCreate() {
  if (!newVersion.trim() || !newProjectId) return;
  try {
    creating = true;
    await createRelease({
      projectId: newProjectId,
      version: newVersion.trim(),
      environment: newEnvironment,
    });
    newVersion = "";
    showCreateForm = false;
    await load();
    showToast("Release created", "success");
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to create release";
  } finally {
    creating = false;
  }
}

async function handleDelete(id: string) {
  try {
    await deleteRelease(id);
    confirmDeleteId = null;
    showDeleteDialog = false;
    await load();
    showToast("Release deleted", "success");
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to delete release";
  }
}

function toggleExpand(id: string) {
  expandedId = expandedId === id ? null : id;
}
</script>

<svelte:head><title>Releases | HiAi Observe</title></svelte:head>

<div class="p-6 max-w-[1400px] mx-auto space-y-6">
  <!-- Header -->
  <div class="flex items-end justify-between">
    <div>
      <h1 class="text-2xl font-bold text-[var(--foreground)]">Releases</h1>
      <p class="mt-1 text-sm text-[var(--muted-foreground)]">{total} releases tracked</p>
    </div>
    <button type="button"
      onclick={() => { showCreateForm = !showCreateForm; }}
      class="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)] transition-colors"
    >
      <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M12 4v16m8-8H4"/></svg>
      Create Release
    </button>
  </div>

  <!-- Error banner -->
  {#if error}
    <div class="flex items-center gap-3 rounded-lg border border-[var(--destructive)]/50 bg-[color-mix(in_oklch,var(--destructive)_18%,transparent)] px-4 py-3 text-sm text-[var(--destructive)]">
      <svg class="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <span class="flex-1">{error}</span>
      <button type="button" onclick={() => load()} class="rounded border border-[var(--destructive)]/50 px-2.5 py-1 text-xs text-[var(--destructive)] hover:bg-[color-mix(in_oklch,var(--destructive)_18%,transparent)] transition-colors">Retry</button>
    </div>
  {/if}

  <!-- Create form -->
  {#if showCreateForm}
    <div class="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 space-y-4">
      <h3 class="text-sm font-semibold text-[var(--muted-foreground)]">New Release</h3>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <select
          bind:value={newProjectId}
          class="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none"
        >
          <option value="">Select project...</option>
          {#each projects as project (project.id)}
            <option value={project.id}>{project.name}</option>
          {/each}
        </select>
        <input
          type="text"
          bind:value={newVersion}
          placeholder="Version (e.g. 1.2.0)"
          class="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none"
        />
        <select
          bind:value={newEnvironment}
          class="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none"
        >
          <option value="production">Production</option>
          <option value="staging">Staging</option>
          <option value="development">Development</option>
        </select>
      </div>
      <div class="flex items-center gap-3">
        <button type="button"
          onclick={handleCreate}
          disabled={!newVersion.trim() || !newProjectId || creating}
          class="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-40 transition-colors"
        >
          {creating ? "Creating..." : "Create"}
        </button>
        <button type="button"
          onclick={() => { showCreateForm = false; }}
          class="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--muted-foreground)] hover:bg-[var(--accent)] transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  {/if}

  <!-- Content -->
  {#if loading}
    <div class="space-y-2">
      {#each Array(6) as _, i (i)}
        <div class="h-16 animate-pulse rounded-lg bg-[var(--card)]" style="opacity: {1 - i * 0.1}"></div>
      {/each}
    </div>
  {:else if releases.length === 0}
    <div class="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] py-20">
      <svg class="mb-4 h-12 w-12 text-[var(--muted-foreground)] opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z"/></svg>
      <p class="text-sm font-medium text-[var(--muted-foreground)]">No releases yet</p>
      <p class="mt-1 text-xs text-[var(--muted-foreground)]">Create a release to track deployments and their health</p>
    </div>
  {:else}
    <div class="space-y-2">
      {#each releases as release (release.id)}
        {@const health = healthMap[release.id]}
        <div class="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
          <!-- Release row -->
          <button type="button"
            onclick={() => toggleExpand(release.id)}
            class="flex w-full items-center gap-4 px-4 py-3.5 text-left transition-colors hover:bg-[var(--primary)]/5"
          >
            <!-- Health indicator -->
            <div class="flex items-center gap-2">
              {#if health}
                <span class="h-3 w-3 rounded-full {healthBg(health.healthScore)}"></span>
              {:else}
                <span class="h-3 w-3 rounded-full bg-[var(--muted-foreground)]"></span>
              {/if}
            </div>

            <!-- Version -->
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="font-medium text-[var(--foreground)]">{release.version}</span>
                <span class="rounded-full px-2 py-0.5 text-xs font-medium {envBadgeColor(release.environment)}">
                  {release.environment}
                </span>
                {#if health}
                  <span class="rounded-full px-2 py-0.5 text-xs font-medium uppercase {healthBadgeColor(health.healthScore)}">
                    {health.healthScore}
                  </span>
                {/if}
              </div>
              <p class="text-xs text-[var(--muted-foreground)]">{getProjectName(release.projectId)}</p>
            </div>

            <!-- Stats -->
            <div class="flex items-center gap-6 text-sm">
              {#if health}
                <div class="text-right">
                  <p class="font-medium {healthColor(health.healthScore)}">{health.healthScore}</p>
                  <p class="text-[10px] text-[var(--muted-foreground)]">health</p>
                </div>
                <div class="text-right">
                  <p class="font-medium text-[var(--muted-foreground)]">{health.newIssuesCount}</p>
                  <p class="text-[10px] text-[var(--muted-foreground)]">new issues</p>
                </div>
              {/if}
              <div class="text-right">
                <p class="text-xs text-[var(--muted-foreground)]">{timeAgo(release.deployedAt ?? release.createdAt)}</p>
                <p class="text-[10px] text-[var(--muted-foreground)]">deployed</p>
              </div>
            </div>

            <!-- Expand icon -->
            <svg class="h-4 w-4 shrink-0 text-[var(--muted-foreground)] transition-transform {expandedId === release.id ? 'rotate-180' : ''}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path d="M19 9l-7 7-7-7"/>
            </svg>
          </button>

          <!-- Expanded details -->
          {#if expandedId === release.id && health}
            <div class="border-t border-[var(--border)] bg-[var(--background)] px-4 py-3 space-y-3">
              <div class="grid grid-cols-2 gap-4 sm:grid-cols-5">
                <div>
                  <p class="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">Error Rate</p>
                  <p class="mt-0.5 text-lg font-semibold text-[var(--foreground)]">{health.errorRate}/hr</p>
                </div>
                <div>
                  <p class="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">New Issues</p>
                  <p class="mt-0.5 text-lg font-semibold text-[var(--foreground)]">{health.newIssuesCount}</p>
                </div>
                <div>
                  <p class="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">Window</p>
                  <p class="mt-0.5 text-lg font-semibold text-[var(--foreground)]">{Math.round(health.windowHours)}h</p>
                </div>
                <div>
                  <p class="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">Deployed</p>
                  <p class="mt-0.5 text-sm text-[var(--muted-foreground)]">{release.deployedAt ? new Date(release.deployedAt).toLocaleString() : "N/A"}</p>
                </div>
                <div class="flex flex-col justify-center">
                  <a
                    href="/releases/{release.id}"
                    class="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[var(--primary)]/10 px-3 py-2 text-xs font-semibold text-[var(--primary)] hover:bg-[var(--primary)]/20 transition-all duration-150"
                  >
                    View Detail Page
                    <svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
                  </a>
                </div>
              </div>
              <div class="flex justify-end">
                <button type="button"
                  onclick={() => { confirmDeleteId = release.id; showDeleteDialog = true; }}
                  class="text-xs text-[var(--destructive)] hover:underline"
                >
                  Delete release
                </button>
              </div>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<ConfirmDialog
  bind:open={showDeleteDialog}
  title="Delete Release"
  message="Are you sure you want to delete this release? This action cannot be undone."
  confirmLabel="Delete"
  variant="danger"
  onconfirm={() => { if (confirmDeleteId) handleDelete(confirmDeleteId); }}
  oncancel={() => { confirmDeleteId = null; }}
/>
