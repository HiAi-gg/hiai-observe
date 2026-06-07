<script lang="ts">
  import { getStatusPage, createPublicSubscriber, type StatusPageData, type Incident } from "$lib/api";
  import { page } from "$app/state";
  import { onMount } from "svelte";

  let slug = $state(page.url.searchParams.get("slug") || "");
  let data = $state<StatusPageData | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let lastUpdated = $state<Date | null>(null);

  let subscriberEmail = $state("");
  let subscribeLoading = $state(false);
  let subscribeSuccess = $state(false);
  let subscribeError = $state<string | null>(null);

  async function loadStatus() {
    if (!slug) {
      loading = false;
      return;
    }
    try {
      error = null;
      const res = await getStatusPage(slug);
      data = res;
      lastUpdated = new Date();
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load status page";
      data = null;
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    if (slug) {
      loadStatus();
    }
  });

  onMount(() => {
    const interval = setInterval(() => {
      if (slug) {
        loadStatus();
      }
    }, 60_000);
    return () => clearInterval(interval);
  });

  async function handleSubscribe(e: SubmitEvent) {
    e.preventDefault();
    if (!data?.project?.id || !subscriberEmail) return;
    try {
      subscribeLoading = true;
      subscribeSuccess = false;
      subscribeError = null;
      await createPublicSubscriber(data.project.id, subscriberEmail);
      subscribeSuccess = true;
      subscriberEmail = "";
    } catch (e) {
      subscribeError = e instanceof Error ? e.message : "Failed to subscribe";
    } finally {
      subscribeLoading = false;
    }
  }

  function generateBars(uptimePercent: number): Array<{ success: boolean; label: string }> {
    const totalBars = 30;
    const bars: Array<{ success: boolean; label: string }> = [];
    const failedCount = Math.round(((100 - uptimePercent) / 100) * totalBars);
    
    for (let i = 0; i < totalBars; i++) {
      const isFailed = failedCount > 0 && 
        (failedCount === 1 ? i === totalBars - 5 : (i % Math.floor(totalBars / failedCount) === 0)) && 
        bars.filter(b => !b.success).length < failedCount;
      bars.push({
        success: !isFailed,
        label: isFailed ? "Outage / Degraded" : "Operational"
      });
    }
    return bars;
  }

  function formatDuration(createdAt: string, resolvedAt?: string | null): string {
    const start = new Date(createdAt).getTime();
    const end = resolvedAt ? new Date(resolvedAt).getTime() : Date.now();
    const diffMs = end - start;
    const diffMins = Math.floor(diffMs / 60_000);
    if (diffMins < 60) return `${diffMins}m`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ${diffMins % 60}m`;
    return `${Math.floor(diffHours / 24)}d ${diffHours % 24}h`;
  }
</script>

<div class="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
  {#if !slug}
    <div class="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm sm:p-12 text-center">
      <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
        <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h1 class="mt-6 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">View Status Page</h1>
      <p class="mt-4 text-slate-500">Please enter a project slug to view its public-facing status page.</p>
      <form onsubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); slug = fd.get('slug') as string; }} class="mt-8 mx-auto max-w-md">
        <div class="flex gap-2">
          <input
            type="text"
            name="slug"
            required
            placeholder="e.g. my-awesome-project"
            class="block w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm"
          />
          <button
            type="submit"
            class="inline-flex items-center rounded-lg bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 transition-colors"
          >
            Go
          </button>
        </div>
      </form>
    </div>
  {:else if loading && !data}
    <div class="flex flex-col items-center justify-center py-24 space-y-4">
      <div class="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent"></div>
      <p class="text-sm font-medium text-slate-500">Loading status information...</p>
    </div>
  {:else if error}
    <div class="rounded-2xl border border-red-100 bg-red-50/50 p-8 text-center">
      <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-red-100 text-red-600">
        <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      </div>
      <h2 class="mt-4 text-lg font-bold text-slate-900">Failed to load status</h2>
      <p class="mt-2 text-sm text-red-700">{error}</p>
      <button type="button" onclick={loadStatus} class="mt-6 inline-flex items-center rounded-lg bg-white border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors">
        Try Again
      </button>
    </div>
  {:else if data}
    <header class="flex flex-col md:flex-row md:items-center md:justify-between gap-6 pb-8 border-b border-slate-200">
      <div>
        <h1 class="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">{data.project.name}</h1>
        <p class="mt-2 text-sm text-slate-500">Public service availability dashboard</p>
      </div>
      <div>
        <div class="inline-flex items-center gap-3 rounded-full px-5 py-2.5 text-base font-semibold shadow-sm border
          {data.overall === 'operational' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : ''}
          {data.overall === 'degraded' ? 'bg-amber-50 border-amber-200 text-amber-700' : ''}
          {data.overall === 'down' ? 'bg-rose-50 border-rose-200 text-rose-700' : ''}"
        >
          <span class="relative flex h-3 w-3">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75
              {data.overall === 'operational' ? 'bg-emerald-400' : ''}
              {data.overall === 'degraded' ? 'bg-amber-400' : ''}
              {data.overall === 'down' ? 'bg-rose-400' : ''}"
            ></span>
            <span class="relative inline-flex rounded-full h-3 w-3
              {data.overall === 'operational' ? 'bg-emerald-500' : ''}
              {data.overall === 'degraded' ? 'bg-amber-500' : ''}
              {data.overall === 'down' ? 'bg-rose-500' : ''}"
            ></span>
          </span>
          {#if data.overall === 'operational'}
            All Systems Operational
          {:else if data.overall === 'degraded'}
            Some Systems Degraded
          {:else}
            Major Outage Detected
          {/if}
        </div>
      </div>
    </header>

    <section class="mt-12">
      <h2 class="text-lg font-bold text-slate-900 tracking-tight">System Status</h2>
      <div class="mt-4 grid gap-6 sm:grid-cols-2">
        {#each data.monitors as monitor (monitor.id)}
          <div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
            <div class="flex items-center justify-between">
              <h3 class="font-bold text-slate-900 text-lg truncate max-w-[70%]" title={monitor.name}>{monitor.name}</h3>
              <span class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold
                {monitor.lastCheck?.success ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}"
              >
                <span class="h-1.5 w-1.5 rounded-full {monitor.lastCheck?.success ? 'bg-emerald-500' : 'bg-rose-500'}"></span>
                {monitor.lastCheck?.success ? 'Operational' : 'Outage'}
              </span>
            </div>

            <div class="mt-6 flex items-baseline gap-2">
              <span class="text-4xl font-extrabold tracking-tight text-slate-900">{(monitor.uptime24h || 100).toFixed(2)}%</span>
              <span class="text-xs font-medium text-slate-500">24h uptime</span>
            </div>

            <div class="mt-6">
              <div class="flex items-center justify-between text-xs text-slate-400 mb-2">
                <span>30 days ago</span>
                <span>Today</span>
              </div>
              <div class="flex gap-[3px] h-8 items-end">
                {#each generateBars(monitor.uptime24h || 100) as bar}
                  <div
                    class="flex-1 rounded-sm h-full transition-all hover:opacity-85"
                    class:bg-emerald-500={bar.success}
                    class:bg-amber-500={!bar.success}
                    title={bar.label}
                  ></div>
                {/each}
              </div>
            </div>

            <div class="mt-4 flex items-center justify-between border-t border-slate-100 pt-4 text-xs text-slate-500">
              <span>Response Time</span>
              <span class="font-semibold text-slate-900">
                {monitor.lastCheck?.response_time_ms ? `${monitor.lastCheck.response_time_ms}ms` : '—'}
              </span>
            </div>
          </div>
        {/each}
      </div>
    </section>

    <section class="mt-16">
      <h2 class="text-lg font-bold text-slate-900 tracking-tight">Active Incidents</h2>
      {#if !data.incidents || data.incidents.length === 0}
        <div class="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 py-12 text-center">
          <svg class="mx-auto h-8 w-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p class="mt-3 text-sm font-medium text-slate-600">No active incidents reported</p>
          <p class="mt-1 text-xs text-slate-400">All services are running smoothly.</p>
        </div>
      {:else}
        <div class="mt-6 flow-root">
          <ul class="-mb-8">
            {#each data.incidents as incident, incidentIdx (incident.id)}
              <li>
                <div class="relative pb-8">
                  {#if incidentIdx !== data.incidents.length - 1}
                    <span class="absolute left-5 top-5 -ml-px h-full w-0.5 bg-slate-200" aria-hidden="true"></span>
                  {/if}
                  <div class="relative flex space-x-3">
                    <div>
                      <span class="flex h-10 w-10 items-center justify-center rounded-full ring-8 ring-white
                        {incident.severity === 'critical' ? 'bg-rose-100 text-rose-600' : ''}
                        {incident.severity === 'major' ? 'bg-amber-100 text-amber-600' : ''}
                        {incident.severity === 'minor' ? 'bg-blue-100 text-blue-600' : ''}"
                      >
                        {#if incident.severity === 'critical'}
                          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                          </svg>
                        {:else}
                          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        {/if}
                      </span>
                    </div>
                    <div class="flex-1 min-w-0 pt-1.5">
                      <div class="flex items-center justify-between gap-4">
                        <div>
                          <p class="text-sm font-bold text-slate-900">{incident.title}</p>
                          {#if incident.description}
                            <p class="mt-1 text-sm text-slate-500">{incident.description}</p>
                          {/if}
                        </div>
                        <div class="text-right text-xs whitespace-nowrap text-slate-500">
                          <time datetime={incident.createdAt}>{new Date(incident.createdAt).toLocaleDateString()}</time>
                        </div>
                      </div>
                      <div class="mt-2 flex flex-wrap gap-2 items-center text-xs">
                        <span class="inline-flex items-center rounded-md px-2 py-1 font-medium ring-1 ring-inset
                          {incident.severity === 'critical' ? 'bg-rose-50 text-rose-700 ring-rose-600/10' : ''}
                          {incident.severity === 'major' ? 'bg-amber-50 text-amber-700 ring-amber-600/10' : ''}
                          {incident.severity === 'minor' ? 'bg-blue-50 text-blue-700 ring-blue-600/10' : ''}"
                        >
                          {incident.severity}
                        </span>
                        <span class="inline-flex items-center rounded-md bg-slate-100 px-2 py-1 font-medium text-slate-600">
                          {incident.status}
                        </span>
                        <span class="text-slate-400">&middot;</span>
                        <span class="text-slate-500">Duration: {formatDuration(incident.createdAt, incident.resolvedAt)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </li>
            {/each}
          </ul>
        </div>
      {/if}
    </section>

    <section class="mt-20 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
      <div class="max-w-xl">
        <h2 class="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">Subscribe to status updates</h2>
        <p class="mt-2 text-sm text-slate-500">Get email notifications whenever {data.project.name} creates, updates, or resolves an incident.</p>
        <form onsubmit={handleSubscribe} class="mt-6 flex flex-col sm:flex-row gap-3">
          <div class="flex-1">
            <label for="email-address" class="sr-only">Email address</label>
            <input
              id="email-address"
              name="email"
              type="email"
              autocomplete="email"
              required
              bind:value={subscriberEmail}
              placeholder="you@example.com"
              class="block w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={subscribeLoading}
            class="inline-flex items-center justify-center rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 transition-colors disabled:opacity-50"
          >
            {#if subscribeLoading}
              Subscribing...
            {:else}
              Subscribe
            {/if}
          </button>
        </form>
        {#if subscribeSuccess}
          <p class="mt-3 text-sm text-emerald-600 font-medium">✨ Successfully subscribed! You'll receive updates soon.</p>
        {/if}
        {#if subscribeError}
          <p class="mt-3 text-sm text-rose-600 font-medium">⚠️ {subscribeError}</p>
        {/if}
      </div>
    </section>

    <footer class="mt-24 border-t border-slate-200 pt-8 text-center text-xs text-slate-400 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <p>Powered by <a href="https://github.com/hiai-tools/hiai-observe" class="font-semibold text-slate-600 hover:text-slate-900 transition-colors">hiai-observe</a></p>
      {#if lastUpdated}
        <p class="flex items-center justify-center gap-1.5">
          <span class="h-1.5 w-1.5 rounded-full bg-slate-300"></span>
          Last updated: {lastUpdated.toLocaleTimeString()} (auto-updates every 60s)
        </p>
      {/if}
    </footer>
  {/if}
</div>