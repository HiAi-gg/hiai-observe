<script lang="ts">
import { onMount } from "svelte";

let {
  data = [],
  title = "",
}: {
  data: Array<{ label: string; value: number; color: string }>;
  title?: string;
} = $props();

let mounted = $state(false);
let prefersReduced = $state(false);

onMount(() => {
  mounted = true;
  prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
});

const max = $derived(Math.max(...data.map((d) => d.value), 1));
const barHeight = 28;
const gap = 8;
const labelWidth = 100;
const chartWidth = 400;
const totalHeight = $derived(data.length * (barHeight + gap));
</script>

{#if title}
  <h3 class="mb-3 text-sm font-semibold text-[var(--foreground)]">{title}</h3>
{/if}

{#if data.length === 0}
  <p class="py-4 text-center text-sm text-[var(--muted-foreground)]">No data</p>
{:else}
  <svg
    width="100%"
    viewBox="0 0 {labelWidth + chartWidth + 60} {totalHeight}"
    role="img"
    aria-label={title || "Bar chart"}
  >
    {#each data as item, i (item.label)}
      {@const y = i * (barHeight + gap)}
      {@const barWidth = (item.value / max) * chartWidth}

      <text
        x={labelWidth - 8}
        y={y + barHeight / 2 + 4}
        text-anchor="end"
        class="text-xs"
        fill="var(--muted-foreground)"
      >{item.label}</text>

      <rect
        x={labelWidth}
        y={y}
        width={mounted || prefersReduced ? barWidth : 0}
        height={barHeight}
        rx={4}
        fill={item.color}
        opacity="0.85"
        class:animate-bar={mounted && !prefersReduced}
      />

      <text
        x={labelWidth + barWidth + 8}
        y={y + barHeight / 2 + 4}
        class="text-xs font-medium"
        fill="var(--foreground)"
      >{item.value.toLocaleString()}</text>
    {/each}
  </svg>
{/if}

<style>
  .animate-bar {
    transition: width 0.6s cubic-bezier(0.22, 1, 0.36, 1);
  }
</style>
