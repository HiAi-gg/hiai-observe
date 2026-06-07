<script lang="ts">
  import "../app.css";
  import { darkMode, sidebarOpen, currentProject, getToasts, dismissToast } from "$lib/stores.svelte";
  import { getProjects, type Project } from "$lib/api";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import Toast from "$lib/components/Toast.svelte";

  let { children } = $props();

  let projects = $state<Project[]>([]);
  let projectDropdownOpen = $state(false);

  const currentProjectName = $derived(
    projects.find((p) => p.id === currentProject.current)?.name ?? "All Projects"
  );

  $effect(() => {
    getProjects()
      .then((res) => { projects = res.projects ?? []; })
      .catch(() => {});
  });

  function selectProject(id: string) {
    currentProject.current = id;
    projectDropdownOpen = false;
  }

  const navItems = [
    { href: "/", label: "Dashboard", key: "d", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
    { href: "/issues", label: "Issues", key: "i", icon: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" },
    { href: "/releases", label: "Releases", key: "r", icon: "M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" },
    { href: "/search", label: "Search", key: "q", icon: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" },
    { href: "/uptime", label: "Uptime", key: "u", icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" },
    { href: "/infrastructure", label: "Infrastructure", key: "f", icon: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" },
    { href: "/logs", label: "Logs", key: "l", icon: "M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
    { href: "/traces", label: "Traces", key: "t", icon: "M13 10V3L4 14h7v7l9-11h-7z", children: [
      { href: "/traces/agents", label: "Agents" },
      { href: "/traces/models", label: "Models" },
      { href: "/traces/workflows", label: "Workflows" },
    ]},
    { href: "/settings", label: "Settings", key: "s", icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z", children: [
      { href: "/settings/notifications", label: "Notifications" },
      { href: "/settings/alert-history", label: "Alert History" },
      { href: "/settings/retention", label: "Retention" },
      { href: "/settings/team", label: "Team" },
    ]},
  ];

  function toggleDarkMode() {
    darkMode.current = !darkMode.current;
    document.documentElement.classList.toggle("dark", darkMode.current);
  }

  function toggleSidebar() {
    sidebarOpen.current = !sidebarOpen.current;
  }

  // Keyboard navigation: g+<key> to navigate
  let gPending = $state(false);
  let gTimer = $state<ReturnType<typeof setTimeout> | null>(null);

  function handleKeydown(e: KeyboardEvent) {
    // Ignore when typing in inputs
    const target = e.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable) {
      // But allow Escape to close dropdowns
      if (e.key === "Escape") {
        projectDropdownOpen = false;
      }
      return;
    }

    if (e.key === "Escape") {
      projectDropdownOpen = false;
      return;
    }

    if (e.key === "/") {
      e.preventDefault();
      const searchInput = document.querySelector<HTMLInputElement>('input[placeholder*="Search"]');
      if (searchInput) searchInput.focus();
      return;
    }

    if (gPending) {
      gPending = false;
      if (gTimer) { clearTimeout(gTimer); gTimer = null; }

      const navItem = navItems.find((item) => "key" in item && item.key === e.key);
      if (navItem) {
        goto(navItem.href);
      }
      return;
    }

    if (e.key === "g") {
      gPending = true;
      gTimer = setTimeout(() => { gPending = false; }, 1000);
    }
  }

  $effect(() => {
    document.documentElement.classList.toggle("dark", darkMode.current);
  });
</script>

<svelte:window onkeydown={handleKeydown} />

{#if page.url.pathname.startsWith('/status')}
  <div class="min-h-screen bg-slate-50 text-slate-900 overflow-y-auto">
    {@render children()}
  </div>
{:else}
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

    <!-- Project selector -->
    {#if sidebarOpen.current}
      <div class="relative border-b border-[var(--color-border)] px-3 py-2">
        <button
          onclick={() => { projectDropdownOpen = !projectDropdownOpen; }}
          class="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-overlay)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
        >
          <span class="truncate">{currentProjectName}</span>
          <svg class="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {#if projectDropdownOpen}
          <div class="absolute left-3 right-3 z-50 mt-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] py-1 shadow-lg">
            <button
              onclick={() => selectProject("")}
              class="flex w-full items-center px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-overlay)] {currentProject.current === '' ? 'text-[var(--color-accent)]' : ''}"
            >
              All Projects
            </button>
            {#each projects as project (project.id)}
              <button
                onclick={() => selectProject(project.id)}
                class="flex w-full items-center px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-overlay)] {currentProject.current === project.id ? 'text-[var(--color-accent)]' : ''}"
              >
                {project.name}
              </button>
            {/each}
            <div class="border-t border-[var(--color-border)]">
              <a
                href="/settings#projects"
                onclick={() => { projectDropdownOpen = false; }}
                class="flex w-full items-center px-3 py-2 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-surface-overlay)]"
              >
                Manage projects
              </a>
            </div>
          </div>
        {/if}
      </div>
    {/if}

    <!-- Nav -->
    <nav class="flex-1 space-y-1 p-2">
      {#each navItems as item (item.href)}
        {@const active = item.href === "/" ? page.url.pathname === "/" : page.url.pathname.startsWith(item.href)}
        {@const hasChildren = 'children' in item && item.children}
        <div>
          <a
            href={item.href}
            class="flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] {active ? 'bg-[var(--color-accent-bg)] text-[var(--color-accent)]' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-overlay)] hover:text-[var(--color-text-primary)]'} {!sidebarOpen.current ? 'justify-center' : ''}"
            title="{item.label} (g+{'key' in item ? item.key : ''})"
          >
            <svg class="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d={item.icon} />
            </svg>
            {#if sidebarOpen.current}
              <span>{item.label}</span>
            {/if}
          </a>
          {#if sidebarOpen.current && hasChildren && active}
            <div class="ml-8 mt-0.5 space-y-0.5">
              {#each item.children as child (child.href)}
                {@const childActive = page.url.pathname === child.href}
                <a
                  href={child.href}
                  class="flex items-center rounded-md px-3 py-2 text-xs font-medium transition-colors {childActive ? 'bg-[var(--color-accent-bg)] text-[var(--color-accent)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-overlay)]'}"
                >{child.label}</a>
              {/each}
            </div>
          {/if}
        </div>
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
{/if}

<!-- Toast notifications -->
<div class="fixed bottom-4 right-4 z-50 flex flex-col gap-2" aria-live="polite">
  {#each getToasts() as toast (toast.id)}
    <Toast message={toast.message} type={toast.type} ondismiss={() => dismissToast(toast.id)} />
  {/each}
</div>
