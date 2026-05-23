<script lang="ts" generics="T extends Record<string, unknown>">
  import { onMount } from "svelte";

  interface Column {
    key: string;
    label: string;
    sortable?: boolean;
    align?: "left" | "right" | "center";
    render?: (value: unknown, row: T) => string;
  }

  interface Props {
    columns: Column[];
    data: T[];
    loading?: boolean;
    emptyMessage?: string;
    rowKey?: string;
    onRowClick?: (row: T) => void;
  }

  let { columns, data, loading = false, emptyMessage = "No data", rowKey = "id", onRowClick }: Props = $props();

  let sortKey = $state<string | null>(null);
  let sortDir = $state<"asc" | "desc">("asc");

  function toggleSort(key: string) {
    if (sortKey === key) {
      sortDir = sortDir === "asc" ? "desc" : "asc";
    } else {
      sortKey = key;
      sortDir = "asc";
    }
  }

  const sortedData = $derived.by(() => {
    if (!sortKey) return data;
    return [...data].sort((a, b) => {
      const aVal = a[sortKey!];
      const bVal = b[sortKey!];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      const cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
  });

  const skeletonRows = 5;
</script>

<div class="overflow-x-auto rounded-lg border border-[var(--color-border)]">
  <table class="w-full text-left text-sm">
    <thead class="border-b border-[var(--color-border)] bg-[var(--color-surface-overlay)] text-[var(--color-text-muted)]">
      <tr>
        {#each columns as col (col.key)}
          <th
            class="px-4 py-3 font-medium {col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : ''}"
            class:cursor-pointer={col.sortable}
            class:hover:text-[var(--color-text-primary)]={col.sortable}
            onclick={() => col.sortable && toggleSort(col.key)}
          >
            <span class="inline-flex items-center gap-1">
              {col.label}
              {#if sortKey === col.key}
                <span class="text-xs">{sortDir === "asc" ? "\u2191" : "\u2193"}</span>
              {/if}
            </span>
          </th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#if loading}
        {#each Array(skeletonRows) as _, i (i)}
          <tr class="border-b border-[var(--color-border)]">
            {#each columns as col (col.key)}
              <td class="px-4 py-3">
                <div class="h-4 w-3/4 animate-pulse rounded bg-[var(--color-surface-overlay)]"></div>
              </td>
            {/each}
          </tr>
        {/each}
      {:else if sortedData.length === 0}
        <tr>
          <td colspan={columns.length} class="px-4 py-12 text-center text-[var(--color-text-muted)]">
            {emptyMessage}
          </td>
        </tr>
      {:else}
        {#each sortedData as row (row[rowKey] ?? row)}
          <tr
            class="border-b border-[var(--color-border)] transition-colors hover:bg-[var(--color-surface-overlay)]"
            class:cursor-pointer={!!onRowClick}
            onclick={() => onRowClick?.(row)}
          >
            {#each columns as col (col.key)}
              <td
                class="px-4 py-3 {col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : ''}"
              >
                {col.render ? col.render(row[col.key], row) : (row[col.key] ?? "\u2014")}
              </td>
            {/each}
          </tr>
        {/each}
      {/if}
    </tbody>
  </table>
</div>
