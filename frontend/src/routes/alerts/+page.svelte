<script lang="ts">
  import { getNotificationChannels, getNotificationConfig, updateNotificationConfig, deleteNotificationConfig, testNotificationChannel, getProjects, type Project } from "$lib/api";
  import { currentProject, showToast } from "$lib/stores.svelte";

  interface ConfigField {
    key: string;
    label: string;
    envVar: string;
    required: boolean;
  }

  interface Channel {
    type: string;
    name: string;
    description: string;
    configFields: ConfigField[];
    configured: boolean;
  }

  let channels = $state<Channel[]>([]);
  let projects = $state<Project[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let selectedProjectId = $state("");

  // Modal / Editing state
  let activeChannel = $state<Channel | null>(null);
  let modalOpen = $state(false);
  let configValues = $state<Record<string, string>>({});
  let isEnabled = $state(true);
  let loadingConfig = $state(false);
  let saving = $state(false);
  let testing = $state(false);
  let configSource = $state<"db" | "env" | "none">("env");

  const activeProjectId = $derived(currentProject.current || selectedProjectId);

  async function loadData() {
    try {
      loading = true;
      error = null;

      const [channelsResult, projectsResult] = await Promise.all([
        getNotificationChannels(),
        getProjects(),
      ]);

      channels = channelsResult.channels ?? [];
      projects = projectsResult.projects ?? [];

      if (projects.length > 0 && !selectedProjectId) {
        selectedProjectId = projects[0].id;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load notification channels";
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    loadData();
  });

  async function openConfigure(channel: Channel) {
    if (!activeProjectId) {
      showToast("Please select a project first", "error");
      return;
    }

    activeChannel = channel;
    modalOpen = true;
    loadingConfig = true;
    configValues = {};
    isEnabled = true;
    configSource = "none";

    try {
      const existing = await getNotificationConfig(channel.type, activeProjectId);
      if (existing) {
        isEnabled = existing.enabled !== false;
        configSource = existing.source || "db";
        // Pre-fill values
        channel.configFields.forEach((field) => {
          configValues[field.key] = existing.config?.[field.key] || "";
        });
      }
    } catch (e) {
      // Fallback: initialize empty
      channel.configFields.forEach((field) => {
        configValues[field.key] = "";
      });
    } finally {
      loadingConfig = false;
    }
  }

  async function handleSave() {
    if (!activeChannel || !activeProjectId) return;

    // Validate required fields
    const missingFields = activeChannel.configFields
      .filter((f) => f.required && !configValues[f.key]?.trim())
      .map((f) => f.label);

    if (missingFields.length > 0) {
      showToast(`Missing required fields: ${missingFields.join(", ")}`, "error");
      return;
    }

    try {
      saving = true;
      await updateNotificationConfig(activeChannel.type, {
        projectId: activeProjectId,
        enabled: isEnabled,
        config: configValues,
      });
      showToast(`${activeChannel.name} configuration saved`, "success");
      modalOpen = false;
      await loadData();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to save configuration", "error");
    } finally {
      saving = false;
    }
  }

  async function handleTest() {
    if (!activeChannel || !activeProjectId) return;
    try {
      testing = true;
      showToast(`Sending test notification to ${activeChannel.name}...`, "info");
      const result = await testNotificationChannel(activeChannel.type, activeProjectId);
      if (result.ok) {
        showToast("Test notification sent successfully!", "success");
      } else {
        showToast(result.error || "Failed to send test notification", "error");
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Test failed", "error");
    } finally {
      testing = false;
    }
  }

  async function handleDelete() {
    if (!activeChannel || !activeProjectId) return;
    try {
      await deleteNotificationConfig(activeChannel.type, activeProjectId);
      showToast(`${activeChannel.name} configuration removed from DB`, "success");
      modalOpen = false;
      await loadData();
    } catch (e) {
      showToast("Failed to remove configuration", "error");
    }
  }
</script>

<svelte:head>
  <title>Alert Channels | HiAi Observe</title>
</svelte:head>

<div class="p-6 max-w-[1400px] mx-auto space-y-6">
  <!-- Header -->
  <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <h1 class="text-2xl font-bold text-[var(--color-text-primary)]">Alert Channels</h1>
      <p class="mt-1 text-sm text-[var(--color-text-muted)]">
        Configure notification channels to receive instant alerts when your metrics cross thresholds.
      </p>
    </div>
    <div class="flex items-center gap-3">
      {#if !currentProject.current && projects.length > 0}
        <select
          bind:value={selectedProjectId}
          class="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none"
        >
          {#each projects as project (project.id)}
            <option value={project.id}>{project.name}</option>
          {/each}
        </select>
      {/if}
    </div>
  </div>

  <!-- Error banner -->
  {#if error}
    <div class="flex items-center gap-3 rounded-lg border border-[var(--color-danger)]/50 bg-[var(--color-danger-bg)] px-4 py-3 text-sm text-[var(--color-danger)]">
      <svg class="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <span class="flex-1">{error}</span>
      <button type="button" onclick={() => loadData()} class="rounded border border-[var(--color-danger)]/50 px-2.5 py-1 text-xs text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)] transition-colors">Retry</button>
    </div>
  {/if}

  <!-- Grid of 10 Channel Cards -->
  {#if loading}
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {#each Array(10) as _, i (i)}
        <div class="h-40 animate-pulse rounded-xl bg-[var(--color-surface-raised)]" style="opacity: {1 - i * 0.08}"></div>
      {/each}
    </div>
  {:else}
    <div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {#each channels as channel (channel.type)}
        <div class="flex flex-col justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-5 hover:border-[var(--color-accent)]/30 hover:shadow-md transition-all duration-200">
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <h3 class="text-lg font-bold text-[var(--color-text-primary)]">{channel.name}</h3>
              <span class="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold {channel.configured ? 'bg-emerald-500/10 text-emerald-400' : 'bg-gray-500/10 text-gray-400'}">
                <span class="h-1.5 w-1.5 rounded-full {channel.configured ? 'bg-emerald-400' : 'bg-gray-400'}"></span>
                {channel.configured ? 'Configured' : 'Not Configured'}
              </span>
            </div>
            <p class="text-sm text-[var(--color-text-muted)] leading-relaxed min-h-[40px]">
              {channel.description}
            </p>
          </div>

          <div class="mt-5 pt-4 border-t border-[var(--color-border)]/50 flex items-center justify-between">
            <span class="text-xs text-[var(--color-text-muted)]">
              {channel.configFields.length} config fields
            </span>
            <button type="button"
              onclick={() => openConfigure(channel)}
              class="rounded-lg bg-[var(--color-accent)]/10 px-3.5 py-1.5 text-xs font-bold text-[var(--color-accent)] hover:bg-[var(--color-accent)]/20 transition-all duration-150"
            >
              Configure
            </button>
          </div>
        </div>
      {/each}
    </div>
  {/if}

  <!-- Configure Modal -->
  {#if modalOpen && activeChannel}
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs" role="dialog" aria-modal="true">
      <div class="w-full max-w-lg rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
        <!-- Modal Header -->
        <div class="flex items-center justify-between border-b border-[var(--color-border)] pb-3">
          <div>
            <h2 class="text-xl font-bold text-[var(--color-text-primary)]">
              Configure {activeChannel.name}
            </h2>
            <p class="text-xs text-[var(--color-text-muted)] mt-0.5">
              Source: <span class="font-semibold capitalize text-[var(--color-text-secondary)]">{configSource}</span>
            </p>
          </div>
          <button type="button" aria-label="Close"
            onclick={() => { modalOpen = false; }}
            class="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
          >
            <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Modal Body -->
        {#if loadingConfig}
          <div class="py-12 flex flex-col items-center justify-center gap-3">
            <div class="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-accent)] border-t-transparent"></div>
            <span class="text-xs text-[var(--color-text-muted)]">Loading configuration...</span>
          </div>
        {:else}
          <div class="space-y-4 max-h-[400px] overflow-y-auto pr-1">
            <!-- Enabled toggle -->
            <div class="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
              <span class="text-sm font-medium text-[var(--color-text-secondary)]">Channel Enabled</span>
              <input
                type="checkbox"
                bind:checked={isEnabled}
                class="h-4 w-4 rounded border-[var(--color-border)] text-[var(--color-accent)] focus:ring-[var(--color-accent)]"
              />
            </div>

            <!-- Dynamic Form Fields -->
            {#each activeChannel.configFields as field (field.key)}
              <div class="space-y-1">
                <div class="flex items-center justify-between">
                  <label for="field-{field.key}" class="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
                    {field.label}
                    {#if field.required}
                      <span class="text-[var(--color-danger)] font-bold">*</span>
                    {/if}
                  </label>
                  <span class="text-[10px] font-mono text-[var(--color-text-muted)]">
                    env: {field.envVar}
                  </span>
                </div>
                {#if field.key.toLowerCase().includes("token") || field.key.toLowerCase().includes("key") || field.key.toLowerCase().includes("pass") || field.key.toLowerCase().includes("webhookurl")}
                  <input
                    id="field-{field.key}"
                    type="password"
                    bind:value={configValues[field.key]}
                    placeholder="••••••••••••••••"
                    class="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-accent)] focus:outline-none"
                  />
                {:else}
                  <input
                    id="field-{field.key}"
                    type="text"
                    bind:value={configValues[field.key]}
                    placeholder={field.envVar}
                    class="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-accent)] focus:outline-none"
                  />
                {/if}
              </div>
            {/each}
          </div>
        {/if}

        <!-- Modal Footer -->
        <div class="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-[var(--color-border)]">
          <div class="flex gap-2">
            {#if configSource === "db"}
              <button type="button"
                onclick={handleDelete}
                class="rounded-lg border border-[var(--color-danger)]/30 px-3 py-2 text-xs font-semibold text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 transition-colors"
              >
                Delete Config
              </button>
            {/if}
          </div>
          <div class="flex gap-2">
            <button type="button"
              onclick={handleTest}
              disabled={testing || saving || loadingConfig}
              class="rounded-lg border border-[var(--color-border)] px-4 py-2 text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-overlay)] transition-colors disabled:opacity-40"
            >
              {testing ? "Testing..." : "Send Test"}
            </button>
            <button type="button"
              onclick={handleSave}
              disabled={saving || testing || loadingConfig}
              class="rounded-lg bg-[var(--color-accent)] px-5 py-2 text-xs font-semibold text-white hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-40"
            >
              {saving ? "Saving..." : "Save Config"}
            </button>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>
