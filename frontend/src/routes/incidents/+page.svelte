<script lang="ts">
  import { currentProject, showToast } from "$lib/stores.svelte";
  import { getIncidents, createIncident, updateIncident, deleteIncident, getMonitors, type Incident, type Monitor } from "$lib/api";
  import { onMount } from "svelte";

  let incidentsList = $state<Incident[]>([]);
  let monitorsList = $state<Monitor[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  let newIncidentModalOpen = $state(false);
  let dialogEl = $state<HTMLDialogElement | null>(null);

  let newTitle = $state("");
  let newDescription = $state("");
  let newSeverity = $state<"minor" | "major" | "critical">("minor");
  let newMonitorId = $state("");

  let submitLoading = $state(false);

  async function loadIncidents(silent = false) {
    if (!currentProject.current) {
      incidentsList = [];
      loading = false;
      return;
    }
    try {
      if (!silent) loading = true;
      error = null;
      const res = await getIncidents({ projectId: currentProject.current });
      incidentsList = res.items || [];
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load incidents";
    } finally {
      loading = false;
    }
  }

  async function loadMonitors() {
    if (!currentProject.current) return;
    try {
      const res = await getMonitors();
      monitorsList = res.monitors || [];
    } catch {
      monitorsList = [];
    }
  }

  $effect(() => {
    if (currentProject.current) {
      loadIncidents();
      loadMonitors();
    } else {
      incidentsList = [];
      monitorsList = [];
      loading = false;
    }
  });

  $effect(() => {
    const interval = setInterval(() => { if (currentProject.current) loadIncidents(true); }, 15_000);
    return () => clearInterval(interval);
  });

  $effect(() => {
    if (dialogEl) {
      if (newIncidentModalOpen && !dialogEl.open) {
        dialogEl.showModal();
      } else if (!newIncidentModalOpen && dialogEl.open) {
        dialogEl.close();
      }
    }
  });

  async function handleCreateIncident(e: SubmitEvent) {
    e.preventDefault();
    if (!currentProject.current || !newTitle.trim()) return;

    try {
      submitLoading = true;
      const data = {
        projectId: currentProject.current,
        title: newTitle.trim(),
        severity: newSeverity,
        description: newDescription.trim() || undefined,
        monitorId: newMonitorId || undefined,
      };
      await createIncident(data);
      showToast("Incident created successfully", "success");
      newIncidentModalOpen = false;
      newTitle = "";
      newDescription = "";
      newSeverity = "minor";
      newMonitorId = "";
      await loadIncidents();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to create incident", "error");
    } finally {
      submitLoading = false;
    }
  }

  async function handleStatusTransition(incident: Incident, nextStatus: string) {
    try {
      await updateIncident(incident.id, { status: nextStatus });
      showToast(`Incident status updated to ${nextStatus}`, "success");
      await loadIncidents();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to update status", "error");
    }
  }

  async function handleDeleteIncident(id: string) {
    if (!confirm("Are you sure you want to delete this incident?")) return;
    try {
      await deleteIncident(id);
      showToast("Incident deleted", "success");
      await loadIncidents();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to delete incident", "error");
    }
  }

  function getStatusTransitions(status: string): string[] {
    if (status === "investigating") return ["identified", "monitoring", "resolved"];
    if (status === "identified") return ["investigating", "monitoring", "resolved"];
    if (status === "monitoring") return ["investigating", "identified", "resolved"];
    return [];
  }
</script>

<div class="space-y-6">
  <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
    <div>
      <h1 class="text-2xl font-bold text-[var(--color-text-primary)]">Incident Management</h1>
      <p class="text-sm text-[var(--color-text-muted)]">Track, update, and resolve active service outages</p>
    </div>
    {#if currentProject.current}
      <button type="button"
        onclick={() => { newIncidentModalOpen = true; }}
        class="inline-flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[var(--color-accent-hover)] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
      >
        <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        New Incident
      </button>
    {/if}
  </div>

  {#if !currentProject.current}
    <div class="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-12 text-center">
      <svg class="mx-auto h-12 w-12 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
      <h3 class="mt-4 text-lg font-bold text-[var(--color-text-primary)]">No project selected</h3>
      <p class="mt-2 text-sm text-[var(--color-text-muted)]">Please select a project from the sidebar to manage its incidents.</p>
    </div>
  {:else if loading}
    <div class="flex flex-col items-center justify-center py-24 space-y-4">
      <div class="h-8 w-8 animate-spin rounded-full border-4 border-[var(--color-accent)] border-t-transparent"></div>
      <p class="text-sm font-medium text-[var(--color-text-muted)]">Loading incidents...</p>
    </div>
  {:else if error}
    <div class="rounded-xl border border-red-900/30 bg-red-950/20 p-8 text-center">
      <svg class="mx-auto h-12 w-12 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
      </svg>
      <h3 class="mt-4 text-lg font-bold text-[var(--color-text-primary)]">Failed to load incidents</h3>
      <p class="mt-2 text-sm text-red-300">{error}</p>
      <button type="button" onclick={() => loadIncidents()} class="mt-6 inline-flex items-center rounded-lg bg-[var(--color-surface-raised)] border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text-secondary)] shadow-sm hover:bg-[var(--color-surface-overlay)] transition-colors">
        Retry
      </button>
    </div>
  {:else if incidentsList.length === 0}
    <div class="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-12 text-center">
      <svg class="mx-auto h-12 w-12 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <h3 class="mt-4 text-lg font-bold text-[var(--color-text-primary)]">No incidents found</h3>
      <p class="mt-2 text-sm text-[var(--color-text-muted)]">All systems are operational. Create a new incident to report an issue.</p>
    </div>
  {:else}
    <div class="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] shadow-sm">
      <table class="min-w-full divide-y divide-[var(--color-border)]">
        <thead class="bg-[var(--color-surface-overlay)]">
          <tr>
            <th scope="col" class="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Incident</th>
            <th scope="col" class="px-6 py-3.5 class:hidden sm:table-cell text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Severity</th>
            <th scope="col" class="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Status</th>
            <th scope="col" class="px-6 py-3.5 class:hidden md:table-cell text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Created At</th>
            <th scope="col" class="px-6 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-[var(--color-border)]">
          {#each incidentsList as incident (incident.id)}
            <tr class="hover:bg-[var(--color-surface-overlay)] transition-colors">
              <td class="px-6 py-4">
                <div class="flex flex-col">
                  <span class="font-semibold text-[var(--color-text-primary)]">{incident.title}</span>
                  {#if incident.description}
                    <span class="text-xs text-[var(--color-text-muted)] mt-1 line-clamp-1">{incident.description}</span>
                  {/if}
                  {#if incident.monitorId}
                    {@const mon = monitorsList.find(m => m.id === incident.monitorId)}
                    {#if mon}
                      <span class="inline-flex items-center gap-1 text-[10px] text-[var(--color-accent)] mt-1.5 font-medium">
                        <svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Linked to: {mon.name}
                      </span>
                    {/if}
                  {/if}
                </div>
              </td>
              <td class="px-6 py-4 class:hidden sm:table-cell whitespace-nowrap">
                <span class="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset
                  {incident.severity === 'critical' ? 'bg-red-500/10 text-red-400 ring-red-500/20' : ''}
                  {incident.severity === 'major' ? 'bg-amber-500/10 text-amber-400 ring-amber-500/20' : ''}
                  {incident.severity === 'minor' ? 'bg-blue-500/10 text-blue-400 ring-blue-500/20' : ''}"
                >
                  {incident.severity}
                </span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <div class="flex items-center gap-2">
                  <span class="inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium ring-1 ring-inset
                    {incident.status === 'resolved' ? 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20' : 'bg-slate-500/10 text-slate-400 ring-slate-500/20'}"
                  >
                    {incident.status}
                  </span>
                </div>
              </td>
              <td class="px-6 py-4 class:hidden md:table-cell whitespace-nowrap text-sm text-[var(--color-text-muted)]">
                {new Date(incident.createdAt).toLocaleString()}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                <div class="flex items-center justify-end gap-3">
                  {#if getStatusTransitions(incident.status).length > 0}
                    <div class="relative inline-block text-left">
                      <select
                        onchange={(e) => handleStatusTransition(incident, e.currentTarget.value)}
                        class="block w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-xs text-[var(--color-text-primary)] shadow-sm focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                      >
                        <option value="" disabled selected>Update Status</option>
                        {#each getStatusTransitions(incident.status) as nextStatus}
                          <option value={nextStatus}>{nextStatus}</option>
                        {/each}
                      </select>
                    </div>
                  {/if}
                  <button type="button"
                    onclick={() => handleDeleteIncident(incident.id)}
                    class="rounded-lg p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-overlay)] hover:text-[var(--color-danger)] transition-colors"
                    aria-label="Delete incident"
                  >
                    <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<dialog
  bind:this={dialogEl}
  onclose={() => { newIncidentModalOpen = false; }}
  class="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-0 shadow-2xl backdrop:bg-black/50 w-full max-w-lg"
>
  <div class="p-6">
    <div class="flex items-center justify-between border-b border-[var(--color-border)] pb-4">
      <h3 class="text-lg font-bold text-[var(--color-text-primary)]">Report New Incident</h3>
      <button type="button" onclick={() => { newIncidentModalOpen = false; }} class="rounded-lg p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-overlay)] transition-colors">
        <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <form onsubmit={handleCreateIncident} class="mt-4 space-y-4">
      <div>
        <label for="title" class="block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Title</label>
        <input
          type="text"
          id="title"
          required
          bind:value={newTitle}
          placeholder="e.g. Major Database Latency Spike"
          class="mt-1.5 block w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm text-[var(--color-text-primary)] shadow-sm focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
        />
      </div>

      <div>
        <label for="description" class="block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Description</label>
        <textarea
          id="description"
          bind:value={newDescription}
          placeholder="Describe the symptoms, impact, and current investigation steps..."
          rows="3"
          class="mt-1.5 block w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm text-[var(--color-text-primary)] shadow-sm focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
        ></textarea>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div>
          <label for="severity" class="block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Severity</label>
          <select
            id="severity"
            bind:value={newSeverity}
            class="mt-1.5 block w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-[var(--color-text-primary)] shadow-sm focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
          >
            <option value="minor">Minor</option>
            <option value="major">Major</option>
            <option value="critical">Critical</option>
          </select>
        </div>

        <div>
          <label for="monitor" class="block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Linked Monitor</label>
          <select
            id="monitor"
            bind:value={newMonitorId}
            class="mt-1.5 block w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-[var(--color-text-primary)] shadow-sm focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
          >
            <option value="">None</option>
            {#each monitorsList as monitor}
              <option value={monitor.id}>{monitor.name}</option>
            {/each}
          </select>
        </div>
      </div>

      <div class="mt-6 flex justify-end gap-3 border-t border-[var(--color-border)] pt-4">
        <button type="button"
          onclick={() => { newIncidentModalOpen = false; }}
          class="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-overlay)]"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitLoading}
          class="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
        >
          {#if submitLoading}
            Creating...
          {:else}
            Report Incident
          {/if}
        </button>
      </div>
    </form>
  </div>
</dialog>