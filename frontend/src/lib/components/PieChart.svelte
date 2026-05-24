<script lang="ts">
  import { onMount } from "svelte";

  let { data = [], title = "" }: {
    data: Array<{ label: string; value: number; color: string }>;
    title?: string;
  } = $props();

  let mounted = $state(false);
  let prefersReduced = $state(false);

  onMount(() => {
    mounted = true;
    prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  const total = $derived(data.reduce((sum, d) => sum + d.value, 0));

  function polarToCartesian(cx: number, cy: number, r: number, angle: number) {
    const rad = ((angle - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  const slices = $derived((() => {
    if (total === 0) return [];
    let startAngle = 0;
    return data.map((item) => {
      const angle = (item.value / total) * 360;
      const largeArc = angle > 180 ? 1 : 0;
      const start = polarToCartesian(100, 100, 80, startAngle);
      const end = polarToCartesian(100, 100, 80, startAngle + angle);
      const path = `M 100 100 L ${start.x} ${start.y} A 80 80 0 ${largeArc} 1 ${end.x} ${end.y} Z`;
      const midAngle = startAngle + angle / 2;
      const labelPos = polarToCartesian(100, 100, 50, midAngle);
      startAngle += angle;
      return { ...item, path, labelPos, percent: ((item.value / total) * 100).toFixed(1) };
    });
  })());
</script>

{#if title}
  <h3 class="mb-3 text-sm font-semibold text-[var(--color-text-primary)]">{title}</h3>
{/if}

{#if data.length === 0 || total === 0}
  <p class="py-4 text-center text-sm text-[var(--color-text-muted)]">No data</p>
{:else}
  <div class="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
    <svg
      width="200"
      height="200"
      viewBox="0 0 200 200"
      role="img"
      aria-label={title || "Pie chart"}
    >
      {#each slices as slice, i (slice.label)}
        <path
          d={slice.path}
          fill={slice.color}
          opacity={mounted || prefersReduced ? 0.85 : 0}
          stroke="var(--color-surface)"
          stroke-width="2"
          class:animate-slice={mounted && !prefersReduced}
          style="animation-delay: {i * 80}ms"
        >
          <title>{slice.label}: {slice.percent}%</title>
        </path>
        {#if slice.value / total > 0.05}
          <text
            x={slice.labelPos.x}
            y={slice.labelPos.y}
            text-anchor="middle"
            dominant-baseline="central"
            class="text-[10px] font-bold"
            fill="white"
          >{slice.percent}%</text>
        {/if}
      {/each}
    </svg>

    <div class="flex flex-col gap-1.5">
      {#each slices as slice (slice.label)}
        <div class="flex items-center gap-2">
          <span class="h-3 w-3 shrink-0 rounded-sm" style="background: {slice.color}"></span>
          <span class="text-xs text-[var(--color-text-secondary)]">{slice.label}</span>
          <span class="ml-auto text-xs font-medium tabular-nums text-[var(--color-text-primary)]">{slice.percent}%</span>
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  .animate-slice {
    animation: fadeSlice 0.4s ease-out forwards;
    opacity: 0;
  }

  @keyframes fadeSlice {
    from { opacity: 0; transform: scale(0.9); }
    to { opacity: 0.85; transform: scale(1); }
  }

  @media (prefers-reduced-motion: reduce) {
    .animate-slice {
      animation: none;
      opacity: 0.85;
    }
  }
</style>
