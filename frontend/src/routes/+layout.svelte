<script lang="ts">
  import "../app.css";
  import { darkMode, sidebarOpen } from "$lib/stores.svelte";
  import { page } from "$app/state";

  let { children } = $props();

  const navItems = [
    { href: "/", label: "Dashboard", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
    { href: "/issues", label: "Issues", icon: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" },
    { href: "/uptime", label: "Uptime", icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" },
    { href: "/infrastructure", label: "Infrastructure", icon: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" },
    { href: "/logs", label: "Logs", icon: "M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
    { href: "/traces", label: "Traces", icon: "M13 10V3L4 14h7v7l9-11h-7z" },
    { href: "/settings", label: "Settings", icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" },
  ];

  function toggleDarkMode() {
    darkMode.current = !darkMode.current;
    document.documentElement.classList.toggle("dark", darkMode.current);
  }

  function toggleSidebar() {
    sidebarOpen.current = !sidebarOpen.current;
  }

  $effect(() => {
    document.documentElement.classList.toggle("dark", darkMode.current);
  });
</script>

<div class="flex h-screen overflow-hidden bg-[var(--color-surface)]">
  <!-- Sidebar -->
  <aside
    class="flex flex-col border-r border-[var(--color-border)] bg-[var(--color-surface-raised)] transition-all duration-200"
    class:w-64={sidebarOpen.current}
    class:w-16={!sidebarOpen.current}
  >
    <!-- Logo -->
    <div class="flex h-14 items-center justify-between border-b border-[var(--color-border)] px-4">
      {#if sidebarOpen.current}
        <span class="text-sm font-bold tracking-tight text-[var(--color-text-primary)]">HiAi Observe</span>
      {/if}
      <button
        onclick={toggleSidebar}
        class="flex min-h-11 min-w-11 items-center justify-center rounded-md text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-overlay)] hover:text-[var(--color-text-secondary)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
        aria-label="Toggle sidebar"
      >
        <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          {#if sidebarOpen.current}
            <path stroke-linecap="round" stroke-linejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          {:else}
            <path stroke-linecap="round" stroke-linejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
          {/if}
        </svg>
      </button>
    </div>

    <!-- Nav -->
    <nav class="flex-1 space-y-1 p-2">
      {#each navItems as item (item.href)}
        {@const active = item.href === "/" ? page.url.pathname === "/" : page.url.pathname.startsWith(item.href)}
        <a
          href={item.href}
          class="flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] {active ? 'bg-[var(--color-accent-bg)] text-[var(--color-accent)]' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-overlay)] hover:text-[var(--color-text-primary)]'} {!sidebarOpen.current ? 'justify-center' : ''}"
          title={item.label}
        >
          <svg class="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d={item.icon} />
          </svg>
          {#if sidebarOpen.current}
            <span>{item.label}</span>
          {/if}
        </a>
      {/each}
    </nav>

    <!-- Dark mode toggle -->
    <div class="border-t border-[var(--color-border)] p-3">
      <button
        onclick={toggleDarkMode}
        class="flex w-full items-center gap-2 rounded-md px-3 py-3 text-sm font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-overlay)] hover:text-[var(--color-text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
        class:justify-center={!sidebarOpen.current}
        aria-label="Toggle dark mode"
      >
        {#if darkMode.current}
          <svg class="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        {:else}
          <svg class="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
          </svg>
        {/if}
        {#if sidebarOpen.current}
          <span>{darkMode.current ? "Light mode" : "Dark mode"}</span>
        {/if}
      </button>
    </div>
  </aside>

  <!-- Main content -->
  <main class="flex-1 overflow-y-auto p-6">
    {@render children()}
  </main>
</div>
