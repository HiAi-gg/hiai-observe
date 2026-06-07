<script lang="ts">
  interface TimeRange {
    label: string;
    from: string;
    to: string;
    interval: string;
  }

  let {
    value = $bindable("1h"),
    onChange,
  }: {
    value?: string;
    onChange?: (range: TimeRange) => void;
  } = $props();

  const presets: Array<{ key: string; label: string; interval: string }> = [
    { key: "15m", label: "15m", interval: "1m" },
    { key: "1h", label: "1h", interval: "5m" },
    { key: "6h", label: "6h", interval: "15m" },
    { key: "24h", label: "24h", interval: "1h" },
    { key: "7d", label: "7d", interval: "1h" },
    { key: "30d", label: "30d", interval: "1d" },
  ];

  let customFrom = $state("");
  let customTo = $state("");
  let showCustom = $state(false);

  function resolveRange(key: string): TimeRange {
    const now = new Date();
    const to = now.toISOString();
    let from: string;
    let interval: string;

    switch (key) {
      case "15m": from = new Date(now.getTime() - 15 * 60_000).toISOString(); interval = "1m"; break;
      case "1h": from = new Date(now.getTime() - 60 * 60_000).toISOString(); interval = "5m"; break;
      case "6h": from = new Date(now.getTime() - 6 * 3600_000).toISOString(); interval = "15m"; break;
      case "24h": from = new Date(now.getTime() - 24 * 3600_000).toISOString(); interval = "1h"; break;
      case "7d": from = new Date(now.getTime() - 7 * 86400_000).toISOString(); interval = "1h"; break;
      case "30d": from = new Date(now.getTime() - 30 * 86400_000).toISOString(); interval = "1d"; break;
      default: from = new Date(now.getTime() - 3600_000).toISOString(); interval = "5m";
    }

    return { label: key, from, to, interval };
  }

  function resolveCustomRange(): TimeRange {
    const from = customFrom ? new Date(customFrom).toISOString() : new Date(Date.now() - 3600_000).toISOString();
    const to = customTo ? new Date(customTo).toISOString() : new Date().toISOString();
    const diffMs = new Date(to).getTime() - new Date(from).getTime();
    let interval = "1h";
    if (diffMs <= 3600_000) interval = "1m";
    else if (diffMs <= 6 * 3600_000) interval = "5m";
    else if (diffMs <= 24 * 3600_000) interval = "15m";
    else if (diffMs <= 7 * 86400_000) interval = "1h";
    else interval = "1d";

    return { label: "custom", from, to, interval };
  }

  function selectPreset(key: string) {
    value = key;
    showCustom = false;
    onChange?.(resolveRange(key));
  }

  function applyCustom() {
    value = "custom";
    onChange?.(resolveCustomRange());
  }

  function toDatetimeLocal(iso: string): string {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toISOString().slice(0, 16);
  }
</script>

<div class="flex items-center gap-1">
  {#each presets as p (p.key)}
    <button type="button"
      onclick={() => selectPreset(p.key)}
      class="rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
      class:bg-[var(--color-accent)]={value === p.key}
      class:text-white={value === p.key}
      class:border={value !== p.key}
      class:border-[var(--color-border)]={value !== p.key}
      class:text-[var(--color-text-muted)]={value !== p.key}
      class:hover:bg-[var(--color-surface-raised)]={value !== p.key}
    >
      {p.label}
    </button>
  {/each}
  <button type="button"
    onclick={() => { showCustom = !showCustom; }}
    class="rounded-md border px-2.5 py-1 text-xs transition-colors"
    class:border-[var(--color-accent)]={value === "custom" || showCustom}
    class:text-[var(--color-accent)]={value === "custom" || showCustom}
    class:border-[var(--color-border)]={value !== "custom" && !showCustom}
    class:text-[var(--color-text-muted)]={value !== "custom" && !showCustom}
    title="Custom time range"
  >
    <svg class="inline-block h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
  </button>
</div>

{#if showCustom}
  <div class="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-2 text-xs">
    <label class="flex items-center gap-1 text-[var(--color-text-muted)]">
      From
      <input
        type="datetime-local"
        value={toDatetimeLocal(customFrom)}
        onchange={(e) => { customFrom = (e.target as HTMLInputElement).value; }}
        class="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[var(--color-text-primary)] focus:border-[var(--color-accent)] focus:outline-none"
      />
    </label>
    <label class="flex items-center gap-1 text-[var(--color-text-muted)]">
      To
      <input
        type="datetime-local"
        value={toDatetimeLocal(customTo)}
        onchange={(e) => { customTo = (e.target as HTMLInputElement).value; }}
        class="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[var(--color-text-primary)] focus:border-[var(--color-accent)] focus:outline-none"
      />
    </label>
    <button type="button"
      onclick={applyCustom}
      class="rounded-md bg-[var(--color-accent)] px-3 py-1 text-xs text-white hover:opacity-90"
    >
      Apply
    </button>
  </div>
{/if}
