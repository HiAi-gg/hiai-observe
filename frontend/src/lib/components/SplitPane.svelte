<script lang="ts">
  let {
    direction = "vertical",
    initialRatio = 0.35,
    minA = 80,
    minB = 80,
    collapsed = false,
    onToggle,
    children,
  }: {
    direction?: "vertical" | "horizontal";
    initialRatio?: number;
    minA?: number;
    minB?: number;
    collapsed?: boolean;
    onToggle?: () => void;
    children?: import("svelte").Snippet;
  } = $props();

  let container = $state<HTMLDivElement | null>(null);
  let ratio = $state(initialRatio);
  let dragging = $state(false);

  function onPointerDown(e: PointerEvent) {
    e.preventDefault();
    dragging = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragging || !container) return;
    const rect = container.getBoundingClientRect();
    let pos: number;
    let total: number;

    if (direction === "vertical") {
      pos = e.clientY - rect.top;
      total = rect.height;
    } else {
      pos = e.clientX - rect.left;
      total = rect.width;
    }

    const clamped = Math.max(minA, Math.min(total - minB, pos));
    ratio = clamped / total;
  }

  function onPointerUp() {
    dragging = false;
  }

  function toggleCollapse() {
    onToggle?.();
  }
</script>

<div
  bind:this={container}
  class="relative flex h-full w-full overflow-hidden"
  class:flex-col={direction === "vertical"}
  class:flex-row={direction === "horizontal"}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  role="presentation"
>
  <div
    class="overflow-auto"
    style={collapsed ? "display: none;" : direction === "vertical"
      ? `height: ${ratio * 100}%;`
      : `width: ${ratio * 100}%;`}
  >
    {@render children?.()}
  </div>

  {#if !collapsed}
    <button type="button"
      onpointerdown={onPointerDown}
      class={`group relative z-10 shrink-0 bg-[var(--color-border)] transition-colors hover:bg-[var(--color-accent)]/50 ${
        direction === "vertical" ? "h-1 w-full cursor-row-resize" : "w-1 h-full cursor-col-resize"
      } ${dragging ? "bg-[var(--color-accent)]" : ""}`}
      aria-label="Resize panel"
    >
      <div
        class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--color-text-muted)]/30 transition-colors group-hover:bg-[var(--color-accent)]"
        class:w-8={direction === "vertical"}
        class:h-0.5={direction === "vertical"}
        class:h-8={direction === "horizontal"}
        class:w-0.5={direction === "horizontal"}
      ></div>
    </button>
  {/if}

  <div
    class="overflow-auto"
    style={collapsed ? "flex: 1;" : direction === "vertical"
      ? `height: ${(1 - ratio) * 100}%;`
      : `width: ${(1 - ratio) * 100}%;`}
  >
    {#if collapsed}
      {@render children?.()}
    {/if}
  </div>

  {#if onToggle}
    <button type="button"
      onclick={toggleCollapse}
      class="absolute right-2 top-2 z-20 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-1.5 py-0.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface)]"
      title={collapsed ? "Expand" : "Collapse"}
    >
      {#if collapsed}
        <svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><polyline points="7 13 12 18 17 13"/><polyline points="7 6 12 11 17 6"/></svg>
      {:else}
        <svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><polyline points="17 11 12 6 7 11"/><polyline points="17 18 12 13 7 18"/></svg>
      {/if}
    </button>
  {/if}
</div>
