<script lang="ts">
  let {
    containers = [],
    selected = "",
    onSelect,
  }: {
    containers: Array<{ name: string; count: number }>;
    selected?: string;
    onSelect?: (name: string) => void;
  } = $props();

  function totalLogs(): number {
    return containers.reduce((sum, c) => sum + c.count, 0);
  }

  function maxCount(): number {
    return Math.max(1, ...containers.map(c => c.count));
  }

  function pctBar(count: number): string {
    return `${Math.max(4, (count / maxCount()) * 100)}%`;
  }

  const base = "flex items-center justify-between rounded-md px-2 py-1.5 transition-colors";
  function itemClass(active: boolean): string {
    return active
      ? `${base} bg-[var(--color-accent)]/10 text-[var(--color-accent)]`
      : `${base} text-[var(--color-text-muted)] hover:bg-[var(--color-surface)]`;
  }
</script>

<aside class="flex w-56 shrink-0 flex-col gap-1 overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-3 text-xs">
  <div class="mb-2 flex items-center justify-between">
    <span class="font-medium text-[var(--color-text-secondary)]">Containers</span>
    <span class="text-[var(--color-text-muted)]">{containers.length}</span>
  </div>

  <button type="button"
    onclick={() => onSelect?.("")}
    class={itemClass(!selected)}
  >
    <span class="truncate">All containers</span>
    <span class="ml-2 tabular-nums">{totalLogs().toLocaleString()}</span>
  </button>

  {#each containers as c (c.name)}
    <button type="button"
      onclick={() => onSelect?.(c.name)}
      class={itemClass(selected === c.name)}
    >
      <span class="truncate" title={c.name}>{c.name}</span>
      <span class="ml-2 tabular-nums">{c.count.toLocaleString()}</span>
    </button>
    <div class="mx-2 h-1 overflow-hidden rounded-full bg-[var(--color-surface-overlay)]">
      <div
        class="h-full rounded-full bg-[var(--color-accent)]/40"
        style="width: {pctBar(c.count)};"
      ></div>
    </div>
  {/each}
</aside>
