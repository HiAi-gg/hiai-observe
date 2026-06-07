<script lang="ts">
  interface Props {
    page: number;
    perPage: number;
    total: number;
    onPageChange: (page: number) => void;
  }

  let { page, perPage, total, onPageChange }: Props = $props();

  const totalPages = $derived(Math.ceil(total / perPage));
  const startItem = $derived((page - 1) * perPage + 1);
  const endItem = $derived(Math.min(page * perPage, total));

  const visiblePages = $derived.by(() => {
    const pages: number[] = [];
    const maxVisible = 5;
    let start = Math.max(1, page - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start < maxVisible - 1) {
      start = Math.max(1, end - maxVisible + 1);
    }
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  });
</script>

{#if total > perPage}
  <div class="flex items-center justify-between pt-2">
    <span class="text-sm text-[var(--color-text-muted)]">
      Showing {startItem}&#8211;{endItem} of {total}
    </span>
    <div class="flex items-center gap-1">
      <button type="button"
        onclick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        class="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-overlay)] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
      >Previous</button>
      {#each visiblePages as pg (pg)}
        <button type="button"
          onclick={() => onPageChange(pg)}
          class="h-8 w-8 rounded-md text-sm font-medium transition-all"
          class:bg-[var(--color-accent)]={page === pg}
          class:text-white={page === pg}
          class:text-[var(--color-text-secondary)]={page !== pg}
          class:hover:bg-[var(--color-surface-overlay)]={page !== pg}
        >{pg}</button>
      {/each}
      <button type="button"
        onclick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        class="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-overlay)] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
      >Next</button>
    </div>
  </div>
{/if}
