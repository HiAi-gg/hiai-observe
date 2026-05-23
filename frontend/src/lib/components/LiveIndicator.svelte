<script lang="ts">
  let { connected = false }: { connected: boolean } = $props();
</script>

<span class="inline-flex items-center gap-1.5">
  <span class="relative inline-block h-2 w-2">
    <span
      class="absolute inset-0 rounded-full"
      class:bg-[var(--color-success)]={connected}
      class:bg-[var(--color-danger)]={!connected}
    ></span>
    {#if connected}
      <span class="live-ping absolute inset-0 rounded-full bg-[var(--color-success)] opacity-75"></span>
    {/if}
  </span>
  <span class="text-xs" class:text-[var(--color-success)]={connected} class:text-[var(--color-danger)]={!connected}>
    {connected ? "Live" : "Offline"}
  </span>
</span>

<style>
  @keyframes ping {
    75%, 100% {
      transform: scale(2);
      opacity: 0;
    }
  }

  .live-ping {
    animation: ping 1s cubic-bezier(0, 0, 0.2, 1) infinite;
  }

  @media (prefers-reduced-motion: reduce) {
    .live-ping {
      animation: none;
    }
  }
</style>
