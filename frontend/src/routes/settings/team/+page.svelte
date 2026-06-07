<script lang="ts">
  import { getTeamMembers, createTeamMember, updateTeamMember, deleteTeamMember, getProjects, type TeamMember, type Project } from "$lib/api";
  import { showToast } from "$lib/stores.svelte";
  import { timeAgo } from "$lib/utils";
  import ConfirmDialog from "$lib/components/ConfirmDialog.svelte";

  let members = $state<TeamMember[]>([]);
  let projects = $state<Project[]>([]);
  let total = $state(0);
  let loading = $state(true);
  let error = $state<string | null>(null);

  // Create form
  let showCreateForm = $state(false);
  let newName = $state("");
  let newEmail = $state("");
  let newRole = $state("member");
  let newProjectId = $state("");
  let creating = $state(false);

  // Edit
  let editingId = $state<string | null>(null);
  let editName = $state("");
  let editEmail = $state("");
  let editRole = $state("");

  // Delete
  let confirmDeleteId = $state<string | null>(null);
  let showDeleteDialog = $state(false);

  const roles = ["owner", "admin", "member", "viewer"] as const;

  async function load() {
    try {
      loading = true;
      error = null;
      const [memberResult, projectResult] = await Promise.all([
        getTeamMembers({ limit: 200 }),
        getProjects(),
      ]);
      members = memberResult.data;
      total = memberResult.total;
      projects = projectResult.projects ?? [];
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load team members";
    } finally {
      loading = false;
    }
  }

  $effect(() => { load(); });

  function getProjectName(id: string): string {
    return projects.find((p) => p.id === id)?.name ?? "Unknown";
  }

  function roleBadgeColor(role: string): string {
    if (role === "owner") return "bg-purple-900/40 text-purple-300";
    if (role === "admin") return "bg-blue-900/40 text-blue-300";
    if (role === "member") return "bg-emerald-900/40 text-emerald-300";
    return "bg-slate-800/60 text-slate-400";
  }

  function getInitials(name: string): string {
    return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  }

  async function handleCreate() {
    if (!newName.trim() || !newEmail.trim() || !newProjectId) return;
    try {
      creating = true;
      await createTeamMember({
        projectId: newProjectId,
        name: newName.trim(),
        email: newEmail.trim(),
        role: newRole,
      });
      newName = "";
      newEmail = "";
      newRole = "member";
      showCreateForm = false;
      await load();
      showToast("Team member added", "success");
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to add team member";
    } finally {
      creating = false;
    }
  }

  function startEdit(member: TeamMember) {
    editingId = member.id;
    editName = member.name;
    editEmail = member.email;
    editRole = member.role;
  }

  function cancelEdit() {
    editingId = null;
  }

  async function saveEdit() {
    if (!editingId) return;
    try {
      await updateTeamMember(editingId, {
        name: editName.trim(),
        email: editEmail.trim(),
        role: editRole,
      });
      editingId = null;
      await load();
      showToast("Team member updated", "success");
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to update team member";
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteTeamMember(id);
      confirmDeleteId = null;
      showDeleteDialog = false;
      await load();
      showToast("Team member removed", "success");
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to remove team member";
    }
  }
</script>

<svelte:head><title>Team | HiAi Observe</title></svelte:head>

<div class="space-y-6">
  <!-- Header -->
  <div class="flex items-center gap-3">
    <a href="/settings" class="text-sm text-[var(--color-accent)] hover:underline">Settings</a>
    <svg class="h-4 w-4 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M9 5l7 7-7 7"/></svg>
    <h1 class="text-2xl font-bold text-[var(--color-text-primary)]">Team</h1>
  </div>

  <!-- Error banner -->
  {#if error}
    <div class="flex items-center gap-3 rounded-lg border border-[var(--color-danger)]/50 bg-[var(--color-danger-bg)] px-4 py-3 text-sm text-[var(--color-danger)]">
      <svg class="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <span class="flex-1">{error}</span>
      <button type="button" onclick={() => load()} class="rounded border border-[var(--color-danger)]/50 px-2.5 py-1 text-xs text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)] transition-colors">Retry</button>
    </div>
  {/if}

  <!-- Add member button -->
  <div class="flex items-center justify-between">
    <p class="text-sm text-[var(--color-text-muted)]">{total} team members</p>
    <button type="button"
      onclick={() => { showCreateForm = !showCreateForm; }}
      class="inline-flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)] transition-colors"
    >
      <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M12 4v16m8-8H4"/></svg>
      Add Member
    </button>
  </div>

  <!-- Create form -->
  {#if showCreateForm}
    <div class="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4 space-y-4">
      <h3 class="text-sm font-semibold text-[var(--color-text-secondary)]">Add Team Member</h3>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <select
          bind:value={newProjectId}
          class="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none"
        >
          <option value="">Select project...</option>
          {#each projects as project (project.id)}
            <option value={project.id}>{project.name}</option>
          {/each}
        </select>
        <input
          type="text"
          bind:value={newName}
          placeholder="Name"
          class="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none"
        />
        <input
          type="email"
          bind:value={newEmail}
          placeholder="Email"
          class="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none"
        />
        <select
          bind:value={newRole}
          class="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none"
        >
          {#each roles as role}
            <option value={role}>{role}</option>
          {/each}
        </select>
      </div>
      <div class="flex items-center gap-3">
        <button type="button"
          onclick={handleCreate}
          disabled={!newName.trim() || !newEmail.trim() || !newProjectId || creating}
          class="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-40 transition-colors"
        >
          {creating ? "Adding..." : "Add Member"}
        </button>
        <button type="button"
          onclick={() => { showCreateForm = false; }}
          class="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-overlay)] transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  {/if}

  <!-- Content -->
  {#if loading}
    <div class="space-y-2">
      {#each Array(4) as _, i (i)}
        <div class="h-16 animate-pulse rounded-lg bg-[var(--color-surface-raised)]" style="opacity: {1 - i * 0.15}"></div>
      {/each}
    </div>
  {:else if members.length === 0}
    <div class="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-raised)] py-20">
      <svg class="mb-4 h-12 w-12 text-[var(--color-text-muted)] opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
      <p class="text-sm font-medium text-[var(--color-text-secondary)]">No team members</p>
      <p class="mt-1 text-xs text-[var(--color-text-muted)]">Add team members to assign issues and collaborate</p>
    </div>
  {:else}
    <div class="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] overflow-hidden">
      <table class="w-full text-left text-sm">
        <thead class="border-b border-[var(--color-border)] bg-[var(--color-surface-overlay)]/50">
          <tr>
            <th class="px-4 py-3 font-medium text-[var(--color-text-muted)] text-xs uppercase tracking-wider">Member</th>
            <th class="px-4 py-3 font-medium text-[var(--color-text-muted)] text-xs uppercase tracking-wider">Email</th>
            <th class="px-4 py-3 font-medium text-[var(--color-text-muted)] text-xs uppercase tracking-wider">Role</th>
            <th class="px-4 py-3 font-medium text-[var(--color-text-muted)] text-xs uppercase tracking-wider">Project</th>
            <th class="px-4 py-3 font-medium text-[var(--color-text-muted)] text-xs uppercase tracking-wider text-right">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-[var(--color-border)]">
          {#each members as member (member.id)}
            {#if editingId === member.id}
              <!-- Edit row -->
              <tr class="bg-[var(--color-accent)]/5">
                <td class="px-4 py-3">
                  <input type="text" bind:value={editName} class="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm focus:border-[var(--color-accent)] focus:outline-none" />
                </td>
                <td class="px-4 py-3">
                  <input type="email" bind:value={editEmail} class="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm focus:border-[var(--color-accent)] focus:outline-none" />
                </td>
                <td class="px-4 py-3">
                  <select bind:value={editRole} class="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm focus:border-[var(--color-accent)] focus:outline-none">
                    {#each roles as role}
                      <option value={role}>{role}</option>
                    {/each}
                  </select>
                </td>
                <td class="px-4 py-3 text-xs text-[var(--color-text-muted)]">{getProjectName(member.projectId)}</td>
                <td class="px-4 py-3 text-right">
                  <div class="flex items-center justify-end gap-2">
                    <button type="button" onclick={saveEdit} class="rounded bg-[var(--color-accent)] px-2.5 py-1 text-xs font-medium text-white hover:bg-[var(--color-accent-hover)]">Save</button>
                    <button type="button" onclick={cancelEdit} class="rounded border border-[var(--color-border)] px-2.5 py-1 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-overlay)]">Cancel</button>
                  </div>
                </td>
              </tr>
            {:else}
              <!-- Display row -->
              <tr class="transition-colors hover:bg-[var(--color-accent)]/5">
                <td class="px-4 py-3.5">
                  <div class="flex items-center gap-3">
                    <div class="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-surface-overlay)] text-xs font-medium text-[var(--color-text-secondary)]">
                      {getInitials(member.name)}
                    </div>
                    <span class="font-medium text-[var(--color-text-primary)]">{member.name}</span>
                  </div>
                </td>
                <td class="px-4 py-3.5 text-[var(--color-text-secondary)]">{member.email}</td>
                <td class="px-4 py-3.5">
                  <span class="rounded-full px-2 py-0.5 text-xs font-medium {roleBadgeColor(member.role)}">{member.role}</span>
                </td>
                <td class="px-4 py-3.5 text-xs text-[var(--color-text-muted)]">{getProjectName(member.projectId)}</td>
                <td class="px-4 py-3.5 text-right">
                  <div class="flex items-center justify-end gap-2">
                    <button type="button"
                      onclick={() => startEdit(member)}
                      class="rounded border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-overlay)]"
                    >
                      Edit
                    </button>
                    <button type="button"
                      onclick={() => { confirmDeleteId = member.id; showDeleteDialog = true; }}
                      class="text-xs text-[var(--color-danger)] hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            {/if}
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<ConfirmDialog
  bind:open={showDeleteDialog}
  title="Remove Team Member"
  message="Are you sure you want to remove this team member? Any issues assigned to them will be unassigned."
  confirmLabel="Remove"
  variant="danger"
  onconfirm={() => { if (confirmDeleteId) handleDelete(confirmDeleteId); }}
  oncancel={() => { confirmDeleteId = null; }}
/>
