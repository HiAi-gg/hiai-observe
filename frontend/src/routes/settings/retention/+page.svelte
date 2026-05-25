<script lang="ts">
  import { getStorage, getRetention, updateRetention, type StorageTable, type RetentionTable } from "$lib/api";
  import { apiKey, showToast } from "$lib/stores.svelte";

  let storageTables = $state<StorageTable[]>([]);
  let totalBytes = $state(0);
  let totalHuman = $state("0 B");
  let retentionTables = $state<RetentionTable[]>([]);
  let defaultDays = $state(30);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let adminKey = $state("");
  let editingTable = $state<string | null>(null);
  let editDays = $state(30);
  let saving = $state(false);

  async function loadData() {
    if (!adminKey) {
      error = "Enter your Admin API key to view retention settings.";
      loading = false;
      return;
    }
    try {
      loading = true;
      error = null;
      const [storageRes, retentionRes] = await Promise.all([
        getStorage(adminKey),
        getRetention(adminKey),
      ]);
      storageTables = storageRes.tables;
      totalBytes = storageRes.totalBytes;
      totalHuman = storageRes.totalHuman;
      retentionTables = retentionRes.tables;
      defaultDays = retentionRes.defaultDays;
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load data";
    } finally {
      loading = false;
    }
  }

  function startEdit(tableName: string, currentDays: number) {
    editingTable = tableName;
    editDays = currentDays;
  }

  function cancelEdit() {
    editingTable = null;
  }

  async function saveRetention(tableName: string) {
    if (!adminKey || editDays < 1) return;
    try {
      saving = true;
      await updateRetention(adminKey, tableName, editDays);
      // Update local state
      retentionTables = retentionTables.map(t =>
        t.tableName === tableName ? { ...t, retentionDays: editDays } : t
      );
      editingTable = null;
      showToast(`Retention for ${tableName} set to ${editDays} days`, "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to update", "error");
    } finally {
      saving = false;
    }
  }

  function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
  }

  function getStorageForTable(tableName: string): StorageTable | undefined {
    return storageTables.find(s => s.tableName === tableName);
  }
</script>

<svelte:head><title>Retention | HiAi Observe</title></svelte:head>

<div class="space-y-6">
  <div class="flex items-center gap-3">
    <a href="/settings" aria-label="Back to settings" class="text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors">
      <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
    </a>
    <h1 class="text-2xl font-bold text-[var(--color-text-primary)]">Data Retention</h1>
  </div>

  <!-- Admin key input -->
  <div class="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4">
    <h2 class="mb-3 text-sm font-semibold text-[var(--color-text-primary)]">Admin Authentication</h2>
    <div class="flex items-center gap-3">
      <input
        type="password"
        bind:value={adminKey}
        placeholder="Admin API key..."
        class="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none"
      />
      <button
        onclick={loadData}
        disabled={!adminKey}
        class="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-40"
      >
        Load
      </button>
    </div>
    <p class="mt-2 text-xs text-[var(--color-text-muted)]">
      Required: ADMIN_API_KEY from your .env file
    </p>
  </div>

  {#if error}
    <div class="flex items-center gap-3 rounded-lg border border-[var(--color-danger)]/50 bg-[var(--color-danger-bg)] px-4 py-3 text-sm text-[var(--color-danger)]">
      <svg class="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <span>{error}</span>
    </div>
  {/if}

  {#if loading}
    <div class="space-y-3">
      {#each Array(3) as _}
        <div class="h-16 animate-pulse rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)]"></div>
      {/each}
    </div>
  {:else if storageTables.length > 0}
    <!-- Storage overview -->
    <div class="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="text-lg font-semibold text-[var(--color-text-primary)]">Storage Usage</h2>
        <span class="text-sm font-medium text-[var(--color-text-secondary)]">Total: {totalHuman}</span>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-[var(--color-border)] text-left">
              <th class="pb-2 font-medium text-[var(--color-text-muted)]">Table</th>
              <th class="pb-2 text-right font-medium text-[var(--color-text-muted)]">Size</th>
              <th class="pb-2 text-right font-medium text-[var(--color-text-muted)]">% of Total</th>
            </tr>
          </thead>
          <tbody>
            {#each storageTables as table (table.tableName)}
              {@const pct = totalBytes > 0 ? (table.sizeBytes / totalBytes * 100) : 0}
              <tr class="border-b border-[var(--color-border)]/50">
                <td class="py-2.5 font-mono text-xs text-[var(--color-text-primary)]">{table.tableName}</td>
                <td class="py-2.5 text-right text-[var(--color-text-secondary)]">{table.sizeHuman}</td>
                <td class="py-2.5 text-right">
                  <div class="flex items-center justify-end gap-2">
                    <div class="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--color-surface-overlay)]">
                      <div
                        class="h-full rounded-full bg-[var(--color-accent)]"
                        style="width: {Math.min(pct, 100)}%"
                      ></div>
                    </div>
                    <span class="text-xs text-[var(--color-text-muted)]">{pct.toFixed(1)}%</span>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Retention config -->
    <div class="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="text-lg font-semibold text-[var(--color-text-primary)]">Retention Policy</h2>
        <span class="text-xs text-[var(--color-text-muted)]">Default: {defaultDays} days</span>
      </div>
      <p class="mb-4 text-sm text-[var(--color-text-muted)]">
        Data older than the retention period is automatically deleted by the retention worker (runs daily).
      </p>
      <div class="space-y-2">
        {#each retentionTables as table (table.tableName)}
          {@const storage = getStorageForTable(table.tableName)}
          <div class="flex items-center justify-between rounded-md border border-[var(--color-border)] p-3">
            <div class="min-w-0 flex-1">
              <p class="font-mono text-sm font-medium text-[var(--color-text-primary)]">{table.tableName}</p>
              {#if storage}
                <p class="text-xs text-[var(--color-text-muted)]">{storage.sizeHuman}</p>
              {/if}
            </div>
            <div class="flex items-center gap-3">
              {#if editingTable === table.tableName}
                <div class="flex items-center gap-2">
                  <input
                    type="number"
                    bind:value={editDays}
                    min="1"
                    max="3650"
                    class="w-20 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm focus:border-[var(--color-accent)] focus:outline-none"
                  />
                  <span class="text-xs text-[var(--color-text-muted)]">days</span>
                  <button
                    onclick={() => saveRetention(table.tableName)}
                    disabled={saving}
                    class="rounded bg-[var(--color-success)] px-2.5 py-1 text-xs font-medium text-white hover:bg-[var(--color-success)]/80 disabled:opacity-40"
                  >
                    {saving ? "..." : "Save"}
                  </button>
                  <button
                    onclick={cancelEdit}
                    class="rounded px-2.5 py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-surface-overlay)]"
                  >
                    Cancel
                  </button>
                </div>
              {:else}
                <span class="rounded-full px-2.5 py-0.5 text-xs font-medium {table.retentionDays <= 7 ? 'bg-[var(--color-warning-bg)] text-[var(--color-warning)]' : table.retentionDays <= 30 ? 'bg-[var(--color-surface-overlay)] text-[var(--color-text-secondary)]' : 'bg-[var(--color-success-bg)] text-[var(--color-success)]'}">
                  {table.retentionDays}d
                </span>
                <button
                  onclick={() => startEdit(table.tableName, table.retentionDays)}
                  class="rounded border border-[var(--color-border)] px-2.5 py-1 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-overlay)] transition-colors"
                >
                  Edit
                </button>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>
