<script lang="ts">
  import { onMount } from "svelte";

  interface Props {
    title: string;
    value: number;
    suffix?: string;
    trend?: "up" | "down" | "flat";
    trendValue?: string;
    href?: string;
    colorClass?: string;
  }

  let { title, value, suffix = "", trend, trendValue, href, colorClass = "text-[var(--color-accent)]" }: Props = $props();

  let displayValue = $state(0);
  let reducedMotion = $state(false);

  onMount(() => {
    reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      displayValue = value;
      return;
    }

    const duration = 800;
    const start = performance.now();
    const startVal = 0;

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      displayValue = Math.round(startVal + (value - startVal) * eased);
      if (progress < 1) requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  });

  const trendColor = $derived(
    trend === "up" ? "text-[var(--color-success)]" :
    trend === "down" ? "text-[var(--color-danger)]" :
    "text-[var(--color-text-muted)]"
  );

  const trendIcon = $derived(
    trend === "up" ? "\u2191" :
    trend === "down" ? "\u2193" :
    "\u2192"
  );
</script>

{#if href}
  <a {href} class="block rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4 hover:border-[var(--color-accent)] transition-colors">
    <p class="text-sm text-[var(--color-text-muted)]">{title}</p>
    <div class="mt-1 flex items-baseline gap-2">
      <p class="text-3xl font-bold {colorClass}">{displayValue}{suffix}</p>
      {#if trend && trendValue}
        <span class="text-sm {trendColor}">{trendIcon} {trendValue}</span>
      {/if}
    </div>
  </a>
{:else}
  <div class="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4">
    <p class="text-sm text-[var(--color-text-muted)]">{title}</p>
    <div class="mt-1 flex items-baseline gap-2">
      <p class="text-3xl font-bold {colorClass}">{displayValue}{suffix}</p>
      {#if trend && trendValue}
        <span class="text-sm {trendColor}">{trendIcon} {trendValue}</span>
      {/if}
    </div>
  </div>
{/if}
