<script lang="ts">
  import { apiKey } from "$lib/stores.svelte";
  import { getAlerts, createAlert, deleteAlert, type AlertRule } from "$lib/api";

  let alerts = $state<AlertRule[]>([]);
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

  async function loadAlerts() {
    try {
      loading = true;
      error = null;
      const result = await getAlerts();
      alerts = result.alerts;
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load alerts";
    } finally {
      loading = false;
    }
  }

  $effect(() => { loadAlerts(); });

  function saveApiKey() {
    apiKey.current = apiKeyInput;
  }

  async function handleCreateAlert() {
    if (!newAlertName || !newAlertTarget) return;
    await createAlert({
      project_id: "default",
      name: newAlertName,
      condition: { metric: newAlertMetric, operator: newAlertOperator, threshold: newAlertThreshold, duration_seconds: newAlertDuration },
      channels: [{ type: newAlertChannel, target: newAlertTarget }],
      is_active: true,
      cooldown_seconds: 300,
    });
    newAlertName = "";
    newAlertTarget = "";
    await loadAlerts();
  }

  async function handleDeleteAlert(id: string) {
    await deleteAlert(id);
    await loadAlerts();
  }
</script>

<svelte:head><title>Settings | HiAi Observe</title></svelte:head>

<div class="space-y-8">
  <h1 class="text-2xl font-bold">Settings</h1>

  {#if error}
    <div class="flex items-center gap-3 rounded-lg border border-[var(--color-danger)]/50 bg-[var(--color-danger-bg)] px-4 py-3 text-sm text-[var(--color-danger)]">
      <svg class="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <span class="flex-1">{error}</span>
      <button onclick={() => loadAlerts()} class="rounded border border-[var(--color-danger)]/50 px-2.5 py-1 text-xs text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)] transition-colors">Retry</button>
    </div>
  {/if}

  <!-- API Key -->
  <section class="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4">
    <h2 class="mb-3 text-lg font-semibold">API Key</h2>
    <div class="flex items-center gap-3">
      <input
        type="password"
        bind:value={apiKeyInput}
        placeholder="Enter your API key..."
        class="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none"
      />
      <button
        onclick={saveApiKey}
        class="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)]"
      >
        Save
      </button>
    </div>
    <p class="mt-2 text-xs text-[var(--color-text-muted)]">
      Used to authenticate API requests. Generate in your HiAi Observe instance.
    </p>
  </section>

  <!-- Alert Rules -->
  <section class="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4">
    <h2 class="mb-3 text-lg font-semibold">Alert Rules</h2>

    <!-- Create form -->
    <div class="mb-4 grid grid-cols-1 gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:grid-cols-2 lg:grid-cols-4">
      <input
        type="text"
        bind:value={newAlertName}
        placeholder="Alert name..."
        class="rounded border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-1.5 text-sm focus:border-[var(--color-accent)] focus:outline-none"
      />
      <select bind:value={newAlertMetric} class="rounded border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-1.5 text-sm">
        <option value="error_rate">Error rate</option>
        <option value="uptime">Uptime %</option>
        <option value="cpu">CPU usage</option>
        <option value="memory">Memory usage</option>
      </select>
      <div class="flex items-center gap-2">
        <select bind:value={newAlertOperator} class="rounded border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-2 py-1.5 text-sm">
          <option value=">">&gt;</option>
          <option value="<">&lt;</option>
          <option value=">=">&ge;</option>
          <option value="<=">&le;</option>
        </select>
        <input
          type="number"
          bind:value={newAlertThreshold}
          class="w-20 rounded border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-1.5 text-sm focus:border-[var(--color-accent)] focus:outline-none"
        />
      </div>
      <select bind:value={newAlertChannel} class="rounded border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-1.5 text-sm">
        <option value="telegram">Telegram</option>
        <option value="discord">Discord</option>
        <option value="email">Email</option>
      </select>
      <input
        type="text"
        bind:value={newAlertTarget}
        placeholder="Target (chat ID / webhook / email)..."
        class="rounded border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-1.5 text-sm focus:border-[var(--color-accent)] focus:outline-none sm:col-span-2 lg:col-span-3"
      />
      <button
        onclick={handleCreateAlert}
        disabled={!newAlertName || !newAlertTarget}
        class="rounded-md bg-[var(--color-accent)] px-4 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-40"
      >
        Add Alert
      </button>
    </div>

    <!-- Alert list -->
    {#if loading}
      <p class="text-sm text-[var(--color-text-muted)]">Loading...</p>
    {:else if alerts.length === 0}
      <p class="text-sm text-[var(--color-text-muted)]">No alert rules configured</p>
    {:else}
      <div class="space-y-2">
        {#each alerts as alert (alert.id)}
          <div class="flex items-center justify-between rounded-md border border-[var(--color-border)] p-3">
            <div>
              <p class="text-sm font-medium">{alert.name}</p>
              <p class="text-xs text-[var(--color-text-muted)]">
                {alert.condition.metric} {alert.condition.operator} {alert.condition.threshold}
                for {alert.condition.duration_seconds}s
                &middot; {alert.channels.map((c) => c.type).join(", ")}
              </p>
            </div>
            <div class="flex items-center gap-2">
              <span class="h-2 w-2 rounded-full {alert.is_active ? 'bg-[var(--color-success)]' : 'bg-[var(--color-text-muted)]'}"></span>
              <button
                onclick={() => handleDeleteAlert(alert.id)}
                class="text-xs text-[var(--color-danger)] hover:underline"
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
  <section class="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4">
    <div class="mb-3 flex items-center justify-between">
      <h2 class="text-lg font-semibold">Notification Channels</h2>
      <a
        href="/settings/notifications"
        class="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)]"
      >
        Configure
      </a>
    </div>
    <div class="space-y-3">
      <div class="flex items-center justify-between rounded-md border border-[var(--color-border)] p-3">
        <div>
          <p class="text-sm font-medium">Telegram</p>
          <p class="text-xs text-[var(--color-text-muted)]">Bot API alerts with MarkdownV2 formatting</p>
        </div>
        <span class="rounded-full px-2 py-0.5 text-xs bg-[var(--color-surface-overlay)] text-[var(--color-text-secondary)]">Configure in .env</span>
      </div>
      <div class="flex items-center justify-between rounded-md border border-[var(--color-border)] p-3">
        <div>
          <p class="text-sm font-medium">Discord</p>
          <p class="text-xs text-[var(--color-text-muted)]">Webhook alerts with rich embeds</p>
        </div>
        <span class="rounded-full px-2 py-0.5 text-xs bg-[var(--color-surface-overlay)] text-[var(--color-text-secondary)]">Configure in .env</span>
      </div>
      <div class="flex items-center justify-between rounded-md border border-[var(--color-border)] p-3">
        <div>
          <p class="text-sm font-medium">Email (SMTP)</p>
          <p class="text-xs text-[var(--color-text-muted)]">HTML email alerts via SMTP</p>
        </div>
        <span class="rounded-full px-2 py-0.5 text-xs bg-[var(--color-surface-overlay)] text-[var(--color-text-secondary)]">Configure in .env</span>
      </div>
    </div>
  </section>
</div>
