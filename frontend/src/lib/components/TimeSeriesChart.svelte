<script lang="ts">
  import { onMount } from "svelte";

  interface DataPoint {
    time: Date;
    value: number;
  }

  let { data = [], label = "", color = "var(--color-accent)", unit = "", height = 200 }: {
    data?: DataPoint[];
    label?: string;
    color?: string;
    unit?: string;
    height?: number;
  } = $props();

  const padding = { top: 20, right: 20, bottom: 40, left: 50 };
  let svgEl = $state<SVGSVGElement | null>(null);
  let width = $state(400);
  let tooltip = $state<{ x: number; y: number; point: DataPoint } | null>(null);

  let chartWidth = $derived(width - padding.left - padding.right);
  let chartHeight = $derived(height - padding.top - padding.bottom);

  let minVal = $derived(data.length > 0 ? Math.min(...data.map(d => d.value)) : 0);
  let maxVal = $derived(data.length > 0 ? Math.max(...data.map(d => d.value)) : 100);
  let range = $derived(maxVal - minVal || 1);

  let points = $derived(data.map((d, i) => {
    const x = data.length === 1 ? chartWidth / 2 : (i / (data.length - 1)) * chartWidth;
    const y = chartHeight - ((d.value - minVal) / range) * chartHeight;
    return { x: x + padding.left, y: y + padding.top, point: d };
  }));

  let pathD = $derived(points.length > 0
    ? `M ${points.map(p => `${p.x},${p.y}`).join(" L ")}`
    : "");

  let areaD = $derived(points.length > 0
    ? `${pathD} L ${points[points.length - 1]!.x},${padding.top + chartHeight} L ${points[0]!.x},${padding.top + chartHeight} Z`
    : "");

  // Y-axis labels
  let yTicks = $derived(() => {
    const ticks = [];
    const step = range / 4;
    for (let i = 0; i <= 4; i++) {
      ticks.push(minVal + step * i);
    }
    return ticks;
  });

  // X-axis labels
  let xTicks = $derived(() => {
    if (data.length === 0) return [];
    const step = Math.max(1, Math.floor(data.length / 5));
    const ticks = [];
    for (let i = 0; i < data.length; i += step) {
      ticks.push({ index: i, time: data[i]!.time });
    }
    return ticks;
  });

  function formatTime(d: Date): string {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function handleMouseMove(e: MouseEvent) {
    if (!svgEl || points.length === 0) return;
    const rect = svgEl.getBoundingClientRect();
    const mouseX = e.clientX - rect.left - padding.left;

    // Find nearest point
    let nearest = points[0]!;
    let minDist = Infinity;
    for (const p of points) {
      const dist = Math.abs(p.x - padding.left - mouseX);
      if (dist < minDist) {
        minDist = dist;
        nearest = p;
      }
    }
    tooltip = { x: nearest.x, y: nearest.y, point: nearest.point };
  }

  function handleMouseLeave() {
    tooltip = null;
  }

  let reducedMotion = $state(false);
  onMount(() => {
    reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        width = entry.contentRect.width;
      }
    });
    if (svgEl) observer.observe(svgEl);
    return () => observer.disconnect();
  });
</script>

<div class="relative">
  {#if label}
    <h3 class="mb-2 text-sm font-medium text-[var(--color-text-secondary)]">{label}</h3>
  {/if}

  {#if data.length === 0}
    <div class="flex items-center justify-center text-sm text-[var(--color-text-muted)]" style="height: {height}px">
      No data available
    </div>
  {:else}
    <svg
      bind:this={svgEl}
      {width}
      {height}
      class="w-full"
      onmousemove={handleMouseMove}
      onmouseleave={handleMouseLeave}
      role="img"
      aria-label="{label} time series chart"
    >
      <!-- Grid lines -->
      {#each yTicks() as tick}
        {@const y = padding.top + chartHeight - ((tick - minVal) / range) * chartHeight}
        <line
          x1={padding.left} y1={y}
          x2={padding.left + chartWidth} y2={y}
          stroke="var(--color-border)" stroke-dasharray="4,4" stroke-width="0.5"
        />
        <text x={padding.left - 8} y={y + 4} text-anchor="end" class="fill-[var(--color-text-muted)] text-xs">
          {tick.toFixed(0)}{unit}
        </text>
      {/each}

      <!-- X-axis labels -->
      {#each xTicks() as tick}
        {@const x = padding.left + (tick.index / Math.max(1, data.length - 1)) * chartWidth}
        <text x={x} y={height - 8} text-anchor="middle" class="fill-[var(--color-text-muted)] text-xs">
          {formatTime(tick.time)}
        </text>
      {/each}

      <!-- Area fill -->
      {#if areaD}
        <path
          d={areaD}
          fill={color}
          fill-opacity="0.1"
          class={reducedMotion ? "" : "transition-opacity duration-300"}
        />
      {/if}

      <!-- Line -->
      {#if pathD}
        <path
          d={pathD}
          fill="none"
          stroke={color}
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class={reducedMotion ? "" : "transition-all duration-500"}
        />
      {/if}

      <!-- Data points -->
      {#each points as p}
        <circle
          cx={p.x} cy={p.y} r="3"
          fill={color}
          stroke="var(--color-surface-raised)"
          stroke-width="1.5"
          class={reducedMotion ? "" : "transition-all duration-200"}
        />
      {/each}

      <!-- Tooltip -->
      {#if tooltip}
        <line
          x1={tooltip.x} y1={padding.top}
          x2={tooltip.x} y2={padding.top + chartHeight}
          stroke="var(--color-text-muted)" stroke-dasharray="2,2" stroke-width="0.5"
        />
        <circle cx={tooltip.x} cy={tooltip.y} r="5" fill={color} stroke="var(--color-surface-raised)" stroke-width="2" />
        <rect
          x={tooltip.x - 50} y={tooltip.y - 30}
          width="100" height="22" rx="4"
          fill="var(--color-surface-raised)" stroke="var(--color-border)" stroke-width="0.5"
        />
        <text x={tooltip.x} y={tooltip.y - 15} text-anchor="middle" class="fill-[var(--color-text-primary)] text-xs font-medium">
          {tooltip.point.value.toFixed(1)}{unit}
        </text>
      {/if}
    </svg>
  {/if}
</div>
