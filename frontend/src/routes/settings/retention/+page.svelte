<script lang="ts">
import {
  getRetention,
  getStorage,
  type RetentionTable,
  type StorageTable,
  updateRetention,
} from "$lib/api";
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
    retentionTables = retentionTables.map((t) =>
      t.tableName === tableName ? { ...t, retentionDays: editDays } : t,
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
  return `${(bytes / 1024 ** i).toFixed(1)} ${units[i]}`;
}

function getStorageForTable(tableName: string): StorageTable | undefined {
  return storageTables.find((s) => s.tableName === tableName);
}
</script>

<svelte:head><title>Retention | HiAi Observe</title></svelte:head>

<div class="space-y-6">
  <div class="flex items-center gap-3">
    <a href="/settings" aria-label="Back to settings" class="text-[var(--muted-foreground)] hover:text-[var(--muted-foreground)] transition-colors">
      <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
    </a>
    <h1 class="text-2xl font-bold text-[var(--foreground)]">Data Retention</h1>
  </div>

  <!-- Admin key input -->
  <div class="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
    <h2 class="mb-3 text-sm font-semibold text-[var(--foreground)]">Admin Authentication</h2>
    <div class="flex items-center gap-3">
      <input
        type="password"
        bind:value={adminKey}
        placeholder="Admin API key..."
        class="flex-1 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none"
      />
      <button type="button"
        onclick={loadData}
        disabled={!adminKey}
        class="rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-40"
      >
        Load
      </button>
    </div>
    <p class="mt-2 text-xs text-[var(--muted-foreground)]">
      Required: ADMIN_API_KEY from your .env file
    </p>
  </div>

  {#if error}
    <div class="flex items-center gap-3 rounded-lg border border-[var(--destructive)]/50 bg-[color-mix(in_oklch,var(--destructive)_18%,transparent)] px-4 py-3 text-sm text-[var(--destructive)]">
      <svg class="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <span>{error}</span>
    </div>
  {/if}

  {#if loading}
    <div class="space-y-3">
      {#each Array(3) as _}
        <div class="h-16 animate-pulse rounded-lg border border-[var(--border)] bg-[var(--card)]"></div>
      {/each}
    </div>
  {:else if storageTables.length > 0}
    <!-- Storage overview -->
    <div class="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="text-lg font-semibold text-[var(--foreground)]">Storage Usage</h2>
        <span class="text-sm font-medium text-[var(--muted-foreground)]">Total: {totalHuman}</span>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-[var(--border)] text-left">
              <th class="pb-2 font-medium text-[var(--muted-foreground)]">Table</th>
              <th class="pb-2 text-right font-medium text-[var(--muted-foreground)]">Size</th>
              <th class="pb-2 text-right font-medium text-[var(--muted-foreground)]">% of Total</th>
            </tr>
          </thead>
          <tbody>
            {#each storageTables as table (table.tableName)}
              {@const pct = totalBytes > 0 ? (table.sizeBytes / totalBytes * 100) : 0}
              <tr class="border-b border-[var(--border)]/50">
                <td class="py-2.5 font-mono text-xs text-[var(--foreground)]">{table.tableName}</td>
                <td class="py-2.5 text-right text-[var(--muted-foreground)]">{table.sizeHuman}</td>
                <td class="py-2.5 text-right">
                  <div class="flex items-center justify-end gap-2">
                    <div class="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--accent)]">
                      <div
                        class="h-full rounded-full bg-[var(--primary)]"
                        style="width: {Math.min(pct, 100)}%"
                      ></div>
                    </div>
                    <span class="text-xs text-[var(--muted-foreground)]">{pct.toFixed(1)}%</span>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Retention config -->
    <div class="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="text-lg font-semibold text-[var(--foreground)]">Retention Policy</h2>
        <span class="text-xs text-[var(--muted-foreground)]">Default: {defaultDays} days</span>
      </div>
      <p class="mb-4 text-sm text-[var(--muted-foreground)]">
        Data older than the retention period is automatically deleted by the retention worker (runs daily).
      </p>
      <div class="space-y-2">
        {#each retentionTables as table (table.tableName)}
          {@const storage = getStorageForTable(table.tableName)}
          <div class="flex items-center justify-between rounded-md border border-[var(--border)] p-3">
            <div class="min-w-0 flex-1">
              <p class="font-mono text-sm font-medium text-[var(--foreground)]">{table.tableName}</p>
              {#if storage}
                <p class="text-xs text-[var(--muted-foreground)]">{storage.sizeHuman}</p>
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
                    class="w-20 rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm focus:border-[var(--primary)] focus:outline-none"
                  />
                  <span class="text-xs text-[var(--muted-foreground)]">days</span>
                  <button type="button"
                    onclick={() => saveRetention(table.tableName)}
                    disabled={saving}
                    class="rounded bg-[var(--success)] px-2.5 py-1 text-xs font-medium text-white hover:bg-[var(--success)]/80 disabled:opacity-40"
                  >
                    {saving ? "..." : "Save"}
                  </button>
                  <button type="button"
                    onclick={cancelEdit}
                    class="rounded px-2.5 py-1 text-xs text-[var(--muted-foreground)] hover:bg-[var(--accent)]"
                  >
                    Cancel
                  </button>
                </div>
              {:else}
                <span class="rounded-full px-2.5 py-0.5 text-xs font-medium {table.retentionDays <= 7 ? 'bg-[color-mix(in_oklch,var(--warning)_18%,transparent)] text-[var(--warning)]' : table.retentionDays <= 30 ? 'bg-[var(--accent)] text-[var(--muted-foreground)]' : 'bg-[color-mix(in_oklch,var(--success)_18%,transparent)] text-[var(--success)]'}">
                  {table.retentionDays}d
                </span>
                <button type="button"
                  onclick={() => startEdit(table.tableName, table.retentionDays)}
                  class="rounded border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--muted-foreground)] hover:bg-[var(--accent)] transition-colors"
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
