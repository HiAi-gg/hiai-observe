<script lang="ts">
import ConfirmDialog from "$lib/adapters/ConfirmDialogAdapter.svelte";
import {
  type AlertRule,
  createAlert,
  createProject,
  deleteAlert,
  deleteProject,
  getAlerts,
  getProjects,
  type Project,
  rotateApiKey,
} from "$lib/api";
import { apiKey, currentProject, showToast } from "$lib/stores.svelte";

let alerts = $state<AlertRule[]>([]);
let projects = $state<Project[]>([]);
let loading = $state(true);
let error = $state<string | null>(null);
let apiKeyInput = $state(apiKey.current);
let newAlertName = $state("");
let newAlertMetric = $state("error_rate");
let newAlertOperator = $state(">");
let newAlertThreshold = $state(10);
let newAlertDuration = $state(300);
let newAlertChannel = $state<"telegram" | "discord" | "email">("telegram");
let newAlertTarget = $state("");
let newProjectName = $state("");
let newProjectKey = $state<string | null>(null);
let rotatedKey = $state<string | null>(null);
let confirmDelete = $state<string | null>(null);
let confirmDeleteAlert = $state<string | null>(null);
let showDeleteProject = $state(false);
let showDeleteAlert = $state(false);

async function loadAlerts() {
  try {
    loading = true;
    error = null;
    const result = await getAlerts();
    alerts = result.alerts ?? [];
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load alerts";
  } finally {
    loading = false;
  }
}

$effect(() => {
  loadAlerts();
});

function saveApiKey() {
  apiKey.current = apiKeyInput;
  showToast("API key saved", "success");
}

async function handleCreateAlert() {
  if (!newAlertName || !newAlertTarget) return;
  await createAlert({
    project_id: "default",
    name: newAlertName,
    condition: {
      metric: newAlertMetric,
      operator: newAlertOperator,
      threshold: newAlertThreshold,
      duration_seconds: newAlertDuration,
    },
    channels: [{ type: newAlertChannel, target: newAlertTarget }],
    is_active: true,
    cooldown_seconds: 300,
  });
  newAlertName = "";
  newAlertTarget = "";
  await loadAlerts();
  showToast("Alert rule created", "success");
}

async function handleDeleteAlert(id: string) {
  await deleteAlert(id);
  await loadAlerts();
  showToast("Alert rule deleted", "success");
}

async function loadProjects() {
  try {
    const result = await getProjects();
    projects = result.projects ?? [];
  } catch {
    // silent
  }
}

async function handleCreateProject() {
  if (!newProjectName.trim()) return;
  try {
    const result = await createProject(newProjectName.trim());
    newProjectKey = result.apiKey;
    newProjectName = "";
    await loadProjects();
    showToast("Project created", "success");
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to create project";
  }
}

async function handleDeleteProject(id: string) {
  try {
    await deleteProject(id);
    confirmDelete = null;
    if (currentProject.current === id) currentProject.current = "";
    await loadProjects();
    showToast("Project deleted", "success");
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to delete project";
  }
}

async function handleRotateKey(id: string) {
  try {
    const result = await rotateApiKey(id);
    rotatedKey = result.apiKey;
    showToast("API key rotated", "success");
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to rotate key";
  }
}

$effect(() => {
  loadProjects();
});
</script>

<svelte:head><title>Settings | HiAi Observe</title></svelte:head>

<div class="space-y-8">
  <h1 class="text-2xl font-bold">Settings</h1>

  {#if error}
    <div class="flex items-center gap-3 rounded-lg border border-[var(--destructive)]/50 bg-[color-mix(in_oklch,var(--destructive)_18%,transparent)] px-4 py-3 text-sm text-[var(--destructive)]">
      <svg class="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <span class="flex-1">{error}</span>
      <button type="button" onclick={() => loadAlerts()} class="rounded border border-[var(--destructive)]/50 px-2.5 py-1 text-xs text-[var(--destructive)] hover:bg-[color-mix(in_oklch,var(--destructive)_18%,transparent)] transition-colors">Retry</button>
    </div>
  {/if}

  <!-- Projects -->
  <section id="projects" class="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
    <h2 class="mb-3 text-lg font-semibold">Projects</h2>

    <!-- Create form -->
    <div class="mb-4 flex items-center gap-3">
      <input
        type="text"
        bind:value={newProjectName}
        placeholder="New project name..."
        class="flex-1 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none"
      />
      <button type="button"
        onclick={handleCreateProject}
        disabled={!newProjectName.trim()}
        class="rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-40"
      >
        Create
      </button>
    </div>

    {#if newProjectKey}
      <div class="mb-4 rounded-md border border-[var(--success)]/30 bg-[color-mix(in_oklch,var(--success)_18%,transparent)] p-3">
        <p class="text-sm font-medium text-[var(--success)]">Project created! Save this API key:</p>
        <code class="mt-1 block break-all text-xs text-[var(--foreground)]">{newProjectKey}</code>
        <button type="button" onclick={() => { newProjectKey = null; }} class="mt-2 text-xs text-[var(--muted-foreground)] hover:underline">Dismiss</button>
      </div>
    {/if}

    {#if rotatedKey}
      <div class="mb-4 rounded-md border border-[var(--warning)]/30 bg-[color-mix(in_oklch,var(--warning)_18%,transparent)] p-3">
        <p class="text-sm font-medium text-[var(--warning)]">New API key (save it now, it won't be shown again):</p>
        <code class="mt-1 block break-all text-xs text-[var(--foreground)]">{rotatedKey}</code>
        <button type="button" onclick={() => { rotatedKey = null; }} class="mt-2 text-xs text-[var(--muted-foreground)] hover:underline">Dismiss</button>
      </div>
    {/if}

    <!-- Project list -->
    {#if projects.length === 0}
      <p class="text-sm text-[var(--muted-foreground)]">No projects yet</p>
    {:else}
      <div class="space-y-2">
        {#each projects as project (project.id)}
          <div class="flex items-center justify-between rounded-md border border-[var(--border)] p-3">
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium">{project.name}</p>
              <p class="text-xs text-[var(--muted-foreground)]">
                {project.slug} &middot; created {new Date(project.createdAt).toLocaleDateString()}
              </p>
            </div>
            <div class="flex items-center gap-2">
              <button type="button"
                onclick={() => handleRotateKey(project.id)}
                class="rounded border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted-foreground)] hover:bg-[var(--accent)]"
              >
                Rotate Key
              </button>
              <button type="button"
                onclick={() => { confirmDelete = project.id; showDeleteProject = true; }}
                class="text-xs text-[var(--destructive)] hover:underline"
              >
                Delete
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </section>

  <!-- API Key -->
  <section class="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
    <h2 class="mb-3 text-lg font-semibold">API Key</h2>
    <div class="flex items-center gap-3">
      <input
        type="password"
        bind:value={apiKeyInput}
        placeholder="Enter your API key..."
        class="flex-1 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none"
      />
      <button type="button"
        onclick={saveApiKey}
        class="rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
      >
        Save
      </button>
    </div>
    <p class="mt-2 text-xs text-[var(--muted-foreground)]">
      Used to authenticate API requests. Generate in your HiAi Observe instance.
    </p>
  </section>

  <!-- Alert Rules -->
  <section class="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
    <h2 class="mb-3 text-lg font-semibold">Alert Rules</h2>

    <!-- Create form -->
    <div class="mb-4 grid grid-cols-1 gap-3 rounded-md border border-[var(--border)] bg-[var(--background)] p-4 sm:grid-cols-2 lg:grid-cols-4">
      <input
        type="text"
        bind:value={newAlertName}
        placeholder="Alert name..."
        class="rounded border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm focus:border-[var(--primary)] focus:outline-none"
      />
      <select bind:value={newAlertMetric} class="rounded border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm">
        <option value="error_rate">Error rate</option>
        <option value="uptime">Uptime %</option>
        <option value="cpu">CPU usage</option>
        <option value="memory">Memory usage</option>
      </select>
      <div class="flex items-center gap-2">
        <select bind:value={newAlertOperator} class="rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-sm">
          <option value=">">&gt;</option>
          <option value="<">&lt;</option>
          <option value=">=">&ge;</option>
          <option value="<=">&le;</option>
        </select>
        <input
          type="number"
          bind:value={newAlertThreshold}
          class="w-20 rounded border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm focus:border-[var(--primary)] focus:outline-none"
        />
      </div>
      <select bind:value={newAlertChannel} class="rounded border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm">
        <option value="telegram">Telegram</option>
        <option value="discord">Discord</option>
        <option value="email">Email</option>
      </select>
      <input
        type="text"
        bind:value={newAlertTarget}
        placeholder="Target (chat ID / webhook / email)..."
        class="rounded border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm focus:border-[var(--primary)] focus:outline-none sm:col-span-2 lg:col-span-3"
      />
      <button type="button"
        onclick={handleCreateAlert}
        disabled={!newAlertName || !newAlertTarget}
        class="rounded-md bg-[var(--primary)] px-4 py-1.5 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-40"
      >
        Add Alert
      </button>
    </div>

    <!-- Alert list -->
    {#if loading}
      <p class="text-sm text-[var(--muted-foreground)]">Loading...</p>
    {:else if alerts.length === 0}
      <p class="text-sm text-[var(--muted-foreground)]">No alert rules configured</p>
    {:else}
      <div class="space-y-2">
        {#each alerts as alert (alert.id)}
          <div class="flex items-center justify-between rounded-md border border-[var(--border)] p-3">
            <div>
              <p class="text-sm font-medium">{alert.name}</p>
              <p class="text-xs text-[var(--muted-foreground)]">
                {alert.condition.metric} {alert.condition.operator} {alert.condition.threshold}
                for {alert.condition.duration_seconds}s
                &middot; {alert.channels.map((c) => c.type).join(", ")}
              </p>
            </div>
            <div class="flex items-center gap-2">
              <span class="h-2 w-2 rounded-full {alert.is_active ? 'bg-[var(--success)]' : 'bg-[var(--muted-foreground)]'}"></span>
              <button type="button"
                onclick={() => { confirmDeleteAlert = alert.id; showDeleteAlert = true; }}
                class="text-xs text-[var(--destructive)] hover:underline"
              >
                Delete
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </section>

  <!-- Notifications -->
  <section class="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
    <div class="mb-3 flex items-center justify-between">
      <h2 class="text-lg font-semibold">Notification Channels</h2>
      <a
        href="/settings/notifications"
        class="rounded-md bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
      >
        Configure
      </a>
    </div>
    <div class="space-y-3">
      <div class="flex items-center justify-between rounded-md border border-[var(--border)] p-3">
        <div>
          <p class="text-sm font-medium">Telegram</p>
          <p class="text-xs text-[var(--muted-foreground)]">Bot API alerts with MarkdownV2 formatting</p>
        </div>
        <span class="rounded-full px-2 py-0.5 text-xs bg-[var(--accent)] text-[var(--muted-foreground)]">Configure in .env</span>
      </div>
      <div class="flex items-center justify-between rounded-md border border-[var(--border)] p-3">
        <div>
          <p class="text-sm font-medium">Discord</p>
          <p class="text-xs text-[var(--muted-foreground)]">Webhook alerts with rich embeds</p>
        </div>
        <span class="rounded-full px-2 py-0.5 text-xs bg-[var(--accent)] text-[var(--muted-foreground)]">Configure in .env</span>
      </div>
      <div class="flex items-center justify-between rounded-md border border-[var(--border)] p-3">
        <div>
          <p class="text-sm font-medium">Email (SMTP)</p>
          <p class="text-xs text-[var(--muted-foreground)]">HTML email alerts via SMTP</p>
        </div>
        <span class="rounded-full px-2 py-0.5 text-xs bg-[var(--accent)] text-[var(--muted-foreground)]">Configure in .env</span>
      </div>
    </div>
  </section>

  <!-- Data Retention -->
  <section class="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
    <div class="mb-3 flex items-center justify-between">
      <h2 class="text-lg font-semibold">Data Retention</h2>
      <a
        href="/settings/retention"
        class="rounded-md bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
      >
        Manage
      </a>
    </div>
    <div class="flex items-center justify-between rounded-md border border-[var(--border)] p-3">
      <div>
        <p class="text-sm font-medium">Storage & Retention Policies</p>
        <p class="text-xs text-[var(--muted-foreground)]">View table sizes and configure per-table data retention periods</p>
      </div>
      <svg class="h-5 w-5 text-[var(--muted-foreground)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    </div>
  </section>

  <!-- Team Management -->
  <section class="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
    <div class="mb-3 flex items-center justify-between">
      <h2 class="text-lg font-semibold">Team</h2>
      <a
        href="/settings/team"
        class="rounded-md bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
      >
        Manage
      </a>
    </div>
    <a
      href="/settings/team"
      class="flex items-center justify-between rounded-md border border-[var(--border)] p-3 transition-colors hover:bg-[var(--primary)]/5"
    >
      <div>
        <p class="text-sm font-medium">Team Members</p>
        <p class="text-xs text-[var(--muted-foreground)]">Manage team members, roles, and issue assignments</p>
      </div>
      <svg class="h-5 w-5 text-[var(--muted-foreground)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    </a>
  </section>
</div>

<!-- Confirm delete project dialog -->
<ConfirmDialog
  bind:open={showDeleteProject}
  title="Delete Project"
  message="Are you sure you want to delete this project? All associated data (issues, traces, alerts) will be permanently removed."
  confirmLabel="Delete Project"
  variant="danger"
  onconfirm={() => { if (confirmDelete) { handleDeleteProject(confirmDelete); } }}
  oncancel={() => { confirmDelete = null; }}
/>

<!-- Confirm delete alert dialog -->
<ConfirmDialog
  bind:open={showDeleteAlert}
  title="Delete Alert Rule"
  message="Are you sure you want to delete this alert rule? You will no longer receive notifications for this condition."
  confirmLabel="Delete Alert"
  variant="danger"
  onconfirm={() => { if (confirmDeleteAlert) { handleDeleteAlert(confirmDeleteAlert); confirmDeleteAlert = null; } }}
  oncancel={() => { confirmDeleteAlert = null; }}
/>
