<script lang="ts">
  import { page } from "$app/state";
  import { getIssue, updateIssue, type Issue } from "$lib/api";
  import { timeAgo, formatDuration } from "$lib/utils";
  import StatusBadge from "$lib/components/StatusBadge.svelte";

  let issue = $state<Issue | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let actionLoading = $state(false);

  const issueId = $derived(page.params.id ?? "");

  async function load() {
    try {
      loading = true;
      error = null;
      if (!issueId) { error = "Missing issue ID"; loading = false; return; }
      issue = await getIssue(issueId);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load issue";
    } finally {
      loading = false;
    }
  }

  async function setStatus(status: "resolved" | "ignored" | "unresolved") {
    if (!issue || actionLoading) return;
    try {
      actionLoading = true;
      await updateIssue(issue.id, { status });
      await load();
    } finally {
      actionLoading = false;
    }
  }

  $effect(() => { load(); });

  function parseStackTrace(raw: unknown): string | null {
    if (!raw) return null;
    if (typeof raw === "string") return raw;
    if (Array.isArray(raw)) return raw.map((f: any) => {
      const loc = f.filename || f.abs_path || "?";
      const fn = f.function || "<anonymous>";
      const line = f.lineno ? `:${f.lineno}` : "";
      const col = f.colno ? `:${f.colno}` : "";
      return `  at ${fn} (${loc}${line}${col})`;
    }).join("\n");
    return JSON.stringify(raw, null, 2);
  }

  interface Breadcrumb {
    category?: string;
    type?: string;
    message?: string;
    data?: unknown;
    timestamp?: number;
  }

  function parseBreadcrumbs(raw: unknown): Breadcrumb[] {
    if (!raw) return [];
    if (typeof raw === "object" && raw !== null && "values" in raw) return ((raw as Record<string, unknown>).values as Breadcrumb[] | undefined) ?? [];
    if (Array.isArray(raw)) return raw as Breadcrumb[];
    return [];
  }

  function getMetadata(issue: Issue | null): Record<string, unknown> {
    return (issue?.metadata ?? {}) as Record<string, unknown>;
  }

  const stackTrace = $derived.by(() => {
    const meta = getMetadata(issue);
    const rawPayload = meta.rawPayload as Record<string, unknown> | undefined;
    const exception = rawPayload?.exception as Record<string, unknown> | undefined;
    const values = exception?.values as Array<Record<string, unknown>> | undefined;
    const frames = values?.[0]?.stacktrace as Record<string, unknown> | undefined;
    const frameArray = frames?.frames as unknown[] | undefined;
    return parseStackTrace(meta.stack_trace ?? frameArray);
  });

  const breadcrumbs = $derived.by(() => {
    const meta = getMetadata(issue);
    const rawPayload = meta.rawPayload as Record<string, unknown> | undefined;
    return parseBreadcrumbs(rawPayload?.breadcrumbs);
  });
</script>

<svelte:head><title>{issue?.title ?? 'Issue'} | HiAi Observe</title></svelte:head>

<div class="p-6 max-w-[1400px] mx-auto space-y-6">
  <!-- Back link -->
  <a href="/issues" class="inline-flex items-center gap-1.5 text-sm text-[var(--color-accent)] hover:underline transition-colors">
    <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M19 12H5m7-7l-7 7 7 7"/></svg>
    Back to Issues
  </a>

  <!-- Error banner -->
  {#if error}
    <div class="flex items-center gap-3 rounded-lg border border-[var(--color-danger)]/50 bg-[var(--color-danger-bg)] px-4 py-3 text-sm text-[var(--color-danger)]">
      <svg class="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <span class="flex-1">{error}</span>
      <button onclick={() => load()} class="rounded border border-[var(--color-danger)]/50 px-2.5 py-1 text-xs text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)] transition-colors">Retry</button>
    </div>
  {/if}

  {#if loading}
    <div class="space-y-4">
      <div class="h-10 w-3/4 animate-pulse rounded-lg bg-[var(--color-surface-raised)]"></div>
      <div class="h-6 w-1/2 animate-pulse rounded-lg bg-[var(--color-surface-raised)]"></div>
      <div class="h-48 animate-pulse rounded-xl bg-[var(--color-surface-raised)]"></div>
    </div>
  {:else if issue}
    <!-- Header -->
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div class="space-y-3">
        <h1 class="text-2xl font-bold text-[var(--color-text-primary)] leading-tight">{issue.title}</h1>
        <div class="flex flex-wrap items-center gap-3">
          <StatusBadge status={issue.status} size="md" />
          <span class="text-sm text-[var(--color-text-muted)]">{issue.type}</span>
          <span class="text-sm text-[var(--color-text-muted)]">&middot;</span>
          <span class="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-text-secondary)]">
            <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
            {issue.count.toLocaleString()} occurrences
          </span>
          <span class="text-sm text-[var(--color-text-muted)]">&middot;</span>
          <span class="text-sm text-[var(--color-text-muted)]">First seen {timeAgo(issue.first_seen)}</span>
        </div>
      </div>
      <div class="flex items-center gap-2">
        {#if issue.status !== "resolved"}
          <button
            onclick={() => setStatus("resolved")}
            disabled={actionLoading}
            class="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-success)]/50 bg-[var(--color-success-bg)] px-4 py-2 text-sm font-medium text-[var(--color-success)] transition-all hover:bg-[var(--color-success-bg)] hover:border-[var(--color-success)] disabled:opacity-50"
          >
            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M5 13l4 4L19 7"/></svg>
            Resolve
          </button>
        {/if}
        {#if issue.status !== "ignored"}
          <button
            onclick={() => setStatus("ignored")}
            disabled={actionLoading}
            class="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition-all hover:bg-[var(--color-surface-overlay)] hover:border-[var(--color-text-muted)] disabled:opacity-50"
          >
            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/></svg>
            Ignore
          </button>
        {/if}
        {#if issue.status !== "unresolved"}
          <button
            onclick={() => setStatus("unresolved")}
            disabled={actionLoading}
            class="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-warning)]/50 bg-[var(--color-warning-bg)] px-4 py-2 text-sm font-medium text-[var(--color-warning)] transition-all hover:bg-[var(--color-warning-bg)] hover:border-[var(--color-warning)] disabled:opacity-50"
          >
            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
            Reopen
          </button>
        {/if}
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
      <!-- Main content -->
      <div class="space-y-6">
        <!-- Stack trace -->
        <div class="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)]">
          <div class="flex items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface-overlay)]/50 px-4 py-2.5">
            <svg class="h-4 w-4 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"/></svg>
            <h2 class="text-sm font-semibold text-[var(--color-text-secondary)]">Stack Trace</h2>
          </div>
          {#if stackTrace}
            <pre class="overflow-x-auto bg-[var(--color-surface)] p-5 text-xs leading-relaxed"><code class="text-[var(--color-success)]">{stackTrace}</code></pre>
          {:else}
            <div class="flex flex-col items-center justify-center py-12">
              <svg class="mb-3 h-8 w-8 text-[var(--color-text-muted)] opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"/></svg>
              <p class="text-sm text-[var(--color-text-muted)]">No stack trace available</p>
            </div>
          {/if}
        </div>

        <!-- Breadcrumbs timeline -->
        {#if breadcrumbs.length > 0}
          <div class="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)]">
            <div class="flex items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface-overlay)]/50 px-4 py-2.5">
              <svg class="h-4 w-4 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <h2 class="text-sm font-semibold text-[var(--color-text-secondary)]">Breadcrumbs</h2>
              <span class="ml-auto text-xs text-[var(--color-text-muted)]">{breadcrumbs.length} events</span>
            </div>
            <div class="relative p-4">
              <!-- Vertical line -->
              <div class="absolute left-[27px] top-4 bottom-4 w-px bg-[var(--color-border)]"></div>
              <div class="space-y-3">
                {#each breadcrumbs as crumb, i (i)}
                  <div class="relative flex items-start gap-3 pl-2">
                    <div class="relative z-10 mt-1 h-3 w-3 shrink-0 rounded-full border-2 border-[var(--color-accent)] bg-[var(--color-surface-raised)]"></div>
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-2">
                        <span class="rounded bg-[var(--color-surface-overlay)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-text-muted)] uppercase">{crumb.category || crumb.type || "event"}</span>
                        {#if crumb.timestamp}
                          <span class="text-[10px] text-[var(--color-text-muted)]">{new Date(crumb.timestamp * 1000).toLocaleTimeString()}</span>
                        {/if}
                      </div>
                      <p class="mt-0.5 truncate text-sm text-[var(--color-text-secondary)]">{crumb.message ?? JSON.stringify(crumb.data ?? "")}</p>
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          </div>
        {/if}
      </div>

      <!-- Sidebar -->
      <div class="space-y-4">
        <!-- Timing -->
        <div class="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4 space-y-3">
          <h3 class="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Timing</h3>
          <div class="space-y-2">
            <div class="flex justify-between text-sm">
              <span class="text-[var(--color-text-muted)]">First seen</span>
              <span class="text-[var(--color-text-secondary)]">{timeAgo(issue.first_seen)}</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-[var(--color-text-muted)]">Last seen</span>
              <span class="text-[var(--color-text-secondary)]">{timeAgo(issue.last_seen)}</span>
            </div>
          </div>
        </div>

        <!-- Context / Tags -->
        {#if issue.tags && typeof issue.tags === "object" && Object.keys(issue.tags).length > 0}
          <div class="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4 space-y-3">
            <h3 class="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Tags</h3>
            <div class="flex flex-wrap gap-1.5">
              {#each Object.entries(issue.tags) as [key, value] (key)}
                <span class="inline-flex items-center gap-1 rounded-md bg-[var(--color-surface-overlay)] px-2 py-1 text-xs">
                  <span class="text-[var(--color-text-muted)]">{key}:</span>
                  <span class="font-medium text-[var(--color-text-secondary)]">{value}</span>
                </span>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Metadata -->
        {#if issue.metadata && Object.keys(issue.metadata).length > 0}
          <div class="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4 space-y-3">
            <h3 class="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Context</h3>
            <dl class="space-y-2">
              {#each Object.entries(issue.metadata).filter(([k]) => !["stack_trace", "rawPayload", "breadcrumbs"].includes(k)) as [key, value] (key)}
                <div>
                  <dt class="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">{key}</dt>
                  <dd class="mt-0.5 break-all text-xs text-[var(--color-text-secondary)]">{typeof value === "object" ? JSON.stringify(value) : String(value)}</dd>
                </div>
              {/each}
            </dl>
          </div>
        {/if}

        <!-- SDK info -->
        {#if issue.sdk}
          <div class="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4 space-y-3">
            <h3 class="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">SDK</h3>
            <p class="text-sm font-mono text-[var(--color-text-secondary)]">{issue.sdk}</p>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>
