<script lang="ts">
  interface Props {
    data: number[];
    labels?: string[];
    color?: string;
    height?: number;
    showGrid?: boolean;
    animate?: boolean;
  }

  let { data = [], labels = [], color = "var(--color-accent)", height = 120, showGrid = true, animate = true }: Props = $props();

  const padding = { top: 8, right: 8, bottom: 24, left: 40 };

  const points = $derived.by(() => {
    if (data.length < 2) return "";
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const w = 100;
    const h = height - padding.top - padding.bottom;

    return data
      .map((v, i) => {
        const x = padding.left + (i / (data.length - 1)) * (w - padding.left - padding.right);
        const y = padding.top + h - ((v - min) / range) * h;
        return `${i === 0 ? "M" : "L"}${x},${y}`;
      })
      .join(" ");
  });

  const areaPath = $derived.by(() => {
    if (data.length < 2) return "";
    const w = 100;
    const h = height - padding.top - padding.bottom;
    const lastX = padding.left + ((data.length - 1) / (data.length - 1)) * (w - padding.left - padding.right);
    const firstX = padding.left;
    return `${points} L${lastX},${padding.top + h} L${firstX},${padding.top + h} Z`;
  });

  const gridLines = $derived.by(() => {
    if (!showGrid || data.length < 2) return [];
    const h = height - padding.top - padding.bottom;
    const count = 4;
    return Array.from({ length: count + 1 }, (_, i) => padding.top + (i / count) * h);
  });

  const xLabels = $derived.by(() => {
    if (labels.length === 0 || data.length < 2) return [];
    const w = 100;
    const step = Math.max(1, Math.floor(labels.length / 6));
    return labels
      .map((label, i) => ({
        label,
        x: padding.left + (i / (data.length - 1)) * (w - padding.left - padding.right),
      }))
      .filter((_, i) => i % step === 0 || i === labels.length - 1);
  });

  const uniqueId = $derived(`chart-${Math.random().toString(36).slice(2, 8)}`);
</script>

<svg
  viewBox="0 0 100 {height}"
  preserveAspectRatio="none"
  class="w-full"
  style="height: {height}px"
  role="img"
  aria-label="Line chart"
>
  <defs>
    <linearGradient id="{uniqueId}-gradient" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color={color} stop-opacity="0.3" />
      <stop offset="100%" stop-color={color} stop-opacity="0" />
    </linearGradient>
  </defs>

  {#each gridLines as y (y)}
    <line
      x1={padding.left} y1={y} x2={100 - padding.right} y2={y}
      stroke="var(--color-border)" stroke-width="0.2" stroke-dasharray="1,1"
    />
  {/each}

  {#if data.length >= 2}
    <path
      d={areaPath}
      fill="url(#{uniqueId}-gradient)"
      class:animate-fade-in={animate}
    />
    <path
      d={points}
      fill="none"
      stroke={color}
      stroke-width="0.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      class:animate-draw={animate}
    />
  {/if}

  {#each xLabels as lbl (lbl.x)}
    <text
      x={lbl.x} y={height - 4}
      fill="var(--color-text-muted)"
      font-size="3.5"
      text-anchor="middle"
    >{lbl.label}</text>
  {/each}
</svg>

<style>
  @media (prefers-reduced-motion: reduce) {
    .animate-fade-in,
    .animate-draw {
      animation: none !important;
    }
  }

  .animate-fade-in {
    animation: fadeIn 0.6s ease-out;
  }

  .animate-draw {
    animation: draw 0.8s ease-out;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes draw {
    from { stroke-dashoffset: 200; stroke-dasharray: 200; }
    to { stroke-dashoffset: 0; stroke-dasharray: 200; }
  }
</style>
