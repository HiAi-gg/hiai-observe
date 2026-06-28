<script lang="ts">
import ConfirmDialog from "$lib/adapters/ConfirmDialogAdapter.svelte";
import {
  createFingerprintRule,
  deleteFingerprintRule,
  type FingerprintRule,
  getFingerprintRules,
  getProjects,
  type Project,
  updateFingerprintRule,
} from "$lib/api";
import { currentProject, showToast } from "$lib/stores.svelte";

let rules = $state<FingerprintRule[]>([]);
let projects = $state<Project[]>([]);
let loading = $state(true);
let error = $state<string | null>(null);

// Form state
let showForm = $state(false);
let editingRule = $state<FingerprintRule | null>(null);
let name = $state("");
let pattern = $state("");
let groupBy = $state<"message" | "stack" | "type">("message");
let isActive = $state(true);
let selectedProjectId = $state("");
let submitting = $state(false);
let regexError = $state<string | null>(null);

// Delete modal state
let confirmDeleteId = $state<string | null>(null);
let showDeleteDialog = $state(false);

// Computed active project ID
const activeProjectId = $derived(currentProject.current || selectedProjectId);

async function load() {
  try {
    loading = true;
    error = null;
    const [projectsResult] = await Promise.all([getProjects()]);
    projects = projectsResult.projects ?? [];

    if (projects.length > 0 && !selectedProjectId) {
      selectedProjectId = projects[0].id;
    }

    await loadRules();
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load page data";
  } finally {
    loading = false;
  }
}

async function loadRules() {
  if (!activeProjectId) {
    rules = [];
    return;
  }
  try {
    const result = await getFingerprintRules({ projectId: activeProjectId, limit: 100 });
    rules = result.data ?? [];
  } catch (e) {
    showToast("Failed to load fingerprint rules", "error");
  }
}

$effect(() => {
  load();
});

$effect(() => {
  if (activeProjectId) {
    loadRules();
  }
});

// Validate regex on input
$effect(() => {
  if (!pattern) {
    regexError = null;
    return;
  }
  try {
    new RegExp(pattern);
    regexError = null;
  } catch (e) {
    regexError = e instanceof Error ? e.message : "Invalid regular expression";
  }
});

function getProjectName(projId: string): string {
  return projects.find((p) => p.id === projId)?.name ?? "Unknown";
}

function openCreate() {
  editingRule = null;
  name = "";
  pattern = "";
  groupBy = "message";
  isActive = true;
  showForm = true;
}

function openEdit(rule: FingerprintRule) {
  editingRule = rule;
  name = rule.name;
  pattern = rule.pattern;
  groupBy = rule.groupBy;
  isActive = rule.isActive;
  showForm = true;
}

async function handleSubmit() {
  if (!name.trim() || !pattern.trim() || !activeProjectId || regexError) return;
  try {
    submitting = true;
    if (editingRule) {
      await updateFingerprintRule(editingRule.id, {
        name: name.trim(),
        pattern: pattern.trim(),
        groupBy,
        isActive,
      });
      showToast("Fingerprint rule updated successfully", "success");
    } else {
      await createFingerprintRule({
        projectId: activeProjectId,
        name: name.trim(),
        pattern: pattern.trim(),
        groupBy,
        isActive,
      });
      showToast("Fingerprint rule created successfully", "success");
    }
    showForm = false;
    await loadRules();
  } catch (e) {
    showToast(e instanceof Error ? e.message : "Failed to save rule", "error");
  } finally {
    submitting = false;
  }
}

async function handleToggleActive(rule: FingerprintRule) {
  try {
    await updateFingerprintRule(rule.id, { isActive: !rule.isActive });
    showToast(`Rule ${!rule.isActive ? "activated" : "deactivated"}`, "success");
    await loadRules();
  } catch (e) {
    showToast("Failed to toggle rule status", "error");
  }
}

async function handleDelete(id: string) {
  try {
    await deleteFingerprintRule(id);
    confirmDeleteId = null;
    showDeleteDialog = false;
    showToast("Rule deleted successfully", "success");
    await loadRules();
  } catch (e) {
    showToast("Failed to delete rule", "error");
  }
}
</script>

<svelte:head>
  <title>Fingerprint Rules | HiAi Observe</title>
</svelte:head>

<div class="p-6 max-w-[1400px] mx-auto space-y-6">
  <!-- Header -->
  <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <h1 class="text-2xl font-bold text-[var(--foreground)]">Fingerprint Rules</h1>
      <p class="mt-1 text-sm text-[var(--muted-foreground)]">
        Define custom regular expressions to merge similar error events into single issues.
      </p>
    </div>
    <div class="flex items-center gap-3">
      {#if !currentProject.current && projects.length > 0}
        <select
          bind:value={selectedProjectId}
          class="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none"
        >
          {#each projects as project (project.id)}
            <option value={project.id}>{project.name}</option>
          {/each}
        </select>
      {/if}
      <button type="button"
        onclick={openCreate}
        disabled={!activeProjectId}
        class="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-40 transition-colors"
      >
        <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        Add Rule
      </button>
    </div>
  </div>

  <!-- Error banner -->
  {#if error}
    <div class="flex items-center gap-3 rounded-lg border border-[var(--destructive)]/50 bg-[color-mix(in_oklch,var(--destructive)_18%,transparent)] px-4 py-3 text-sm text-[var(--destructive)]">
      <svg class="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <span class="flex-1">{error}</span>
      <button type="button" onclick={() => load()} class="rounded border border-[var(--destructive)]/50 px-2.5 py-1 text-xs text-[var(--destructive)] hover:bg-[color-mix(in_oklch,var(--destructive)_18%,transparent)] transition-colors">Retry</button>
    </div>
  {/if}

  <!-- Layout Grid -->
  <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
    <!-- Rules Table (Left 2 Columns) -->
    <div class="lg:col-span-2 space-y-4">
      {#if loading}
        <div class="space-y-2">
          {#each Array(5) as _, i (i)}
            <div class="h-16 animate-pulse rounded-lg bg-[var(--card)]" style="opacity: {1 - i * 0.15}"></div>
          {/each}
        </div>
      {:else if rules.length === 0}
        <div class="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] py-20">
          <svg class="mb-4 h-12 w-12 text-[var(--muted-foreground)] opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
          <p class="text-sm font-medium text-[var(--muted-foreground)]">No fingerprint rules yet</p>
          <p class="mt-1 text-xs text-[var(--muted-foreground)]">
            Create a custom rule to define custom error grouping parameters.
          </p>
        </div>
      {:else}
        <div class="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <table class="w-full text-left text-sm">
            <thead class="border-b border-[var(--border)] bg-[var(--accent)]/50">
              <tr>
                <th class="px-4 py-3 font-medium text-[var(--muted-foreground)] text-xs uppercase tracking-wider">Rule Name</th>
                <th class="px-4 py-3 font-medium text-[var(--muted-foreground)] text-xs uppercase tracking-wider">Regex Pattern</th>
                <th class="px-4 py-3 font-medium text-[var(--muted-foreground)] text-xs uppercase tracking-wider">Target Field</th>
                <th class="px-4 py-3 font-medium text-[var(--muted-foreground)] text-xs uppercase tracking-wider">Status</th>
                <th class="px-4 py-3 font-medium text-[var(--muted-foreground)] text-xs uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-[var(--border)]">
              {#each rules as rule (rule.id)}
                <tr class="hover:bg-[var(--accent)]/30 transition-colors">
                  <td class="px-4 py-3.5 font-medium text-[var(--foreground)]">
                    {rule.name}
                  </td>
                  <td class="px-4 py-3.5 font-mono text-xs text-[var(--muted-foreground)] max-w-xs truncate" title={rule.pattern}>
                    {rule.pattern}
                  </td>
                  <td class="px-4 py-3.5">
                    <span class="rounded bg-[var(--accent)] px-2 py-0.5 text-xs font-semibold text-[var(--muted-foreground)] capitalize">
                      {rule.groupBy}
                    </span>
                  </td>
                  <td class="px-4 py-3.5">
                    <button type="button"
                      onclick={() => handleToggleActive(rule)}
                      class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors {rule.isActive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}"
                    >
                      <span class="h-1.5 w-1.5 rounded-full {rule.isActive ? 'bg-emerald-400' : 'bg-red-400'}"></span>
                      {rule.isActive ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td class="px-4 py-3.5 text-right space-x-2">
                    <button type="button"
                      onclick={() => openEdit(rule)}
                      class="text-xs text-[var(--primary)] hover:underline"
                    >
                      Edit
                    </button>
                    <button type="button"
                      onclick={() => { confirmDeleteId = rule.id; showDeleteDialog = true; }}
                      class="text-xs text-[var(--destructive)] hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>

    <!-- Form Panel (Right 1 Column) -->
    <div>
      {#if showForm}
        <div class="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 space-y-4 sticky top-6">
          <div class="flex items-center justify-between border-b border-[var(--border)] pb-3">
            <h2 class="text-lg font-bold text-[var(--foreground)]">
              {editingRule ? "Edit Rule" : "Add New Rule"}
            </h2>
            <button type="button" aria-label="Close"
              onclick={() => { showForm = false; }}
              class="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            >
              <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div class="space-y-4">
            <!-- Name -->
            <div class="space-y-1">
              <label for="rule-name" class="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">
                Rule Name
              </label>
              <input
                id="rule-name"
                type="text"
                bind:value={name}
                placeholder="e.g. Group Minified React Errors"
                class="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-[var(--primary)] focus:outline-none"
              />
            </div>

            <!-- Pattern -->
            <div class="space-y-1">
              <label for="rule-pattern" class="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">
                Regex Pattern
              </label>
              <input
                id="rule-pattern"
                type="text"
                bind:value={pattern}
                placeholder="e.g. Minified React error #\d+"
                class="w-full font-mono text-sm rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[var(--foreground)] focus:border-[var(--primary)] focus:outline-none"
                class:border-red-500={regexError}
              />
              {#if regexError}
                <p class="text-xs text-red-400 font-medium mt-1">{regexError}</p>
              {:else if pattern}
                <p class="text-xs text-emerald-400 font-medium mt-1">✓ Valid regular expression</p>
              {/if}
            </div>

            <!-- Group By -->
            <div class="space-y-1">
              <label for="rule-groupby" class="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">
                Apply Regex To
              </label>
              <select
                id="rule-groupby"
                bind:value={groupBy}
                class="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-[var(--primary)] focus:outline-none"
              >
                <option value="message">Error Message</option>
                <option value="stack">Stack Trace</option>
                <option value="type">Exception Type</option>
              </select>
            </div>

            <!-- Active -->
            <div class="flex items-center gap-2 pt-2">
              <input
                id="rule-active"
                type="checkbox"
                bind:checked={isActive}
                class="h-4 w-4 rounded border-[var(--border)] text-[var(--primary)] focus:ring-[var(--primary)]"
              />
              <label for="rule-active" class="text-sm font-medium text-[var(--muted-foreground)]">
                Enable Rule Immediately
              </label>
            </div>

            <!-- Submit -->
            <div class="flex gap-3 pt-4 border-t border-[var(--border)]">
              <button type="button"
                onclick={handleSubmit}
                disabled={submitting || !name.trim() || !pattern.trim() || !!regexError}
                class="flex-1 rounded-lg bg-[var(--primary)] py-2 text-sm font-semibold text-white hover:bg-[var(--primary-hover)] disabled:opacity-40 transition-colors"
              >
                {submitting ? "Saving..." : "Save Rule"}
              </button>
              <button type="button"
                onclick={() => { showForm = false; }}
                class="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--muted-foreground)] hover:bg-[var(--accent)] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      {:else}
        <div class="rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] p-6 text-center space-y-3 sticky top-6">
          <svg class="mx-auto h-8 w-8 text-[var(--muted-foreground)] opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          <h3 class="text-sm font-bold text-[var(--muted-foreground)]">Grouping Rules</h3>
          <p class="text-xs text-[var(--muted-foreground)] leading-relaxed">
            Rules are applied sequentially to incoming error events. The first rule that matches will determine the event's fingerprint and group it accordingly.
          </p>
          <button type="button"
            onclick={openCreate}
            disabled={!activeProjectId}
            class="w-full rounded-lg bg-[var(--primary)]/10 py-2 text-xs font-bold text-[var(--primary)] hover:bg-[var(--primary)]/20 transition-all duration-150"
          >
            Create Your First Rule
          </button>
        </div>
      {/if}
    </div>
  </div>
</div>

<ConfirmDialog
  bind:open={showDeleteDialog}
  title="Delete Fingerprint Rule"
  message="Are you sure you want to delete this fingerprint rule? This will not re-group previously processed events."
  confirmLabel="Delete"
  variant="danger"
  onconfirm={() => { if (confirmDeleteId) handleDelete(confirmDeleteId); }}
  oncancel={() => { confirmDeleteId = null; }}
/>
