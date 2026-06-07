<script lang="ts">
  import { page } from "$app/state";
  import { getTrace, type TraceDetail, type TraceSpan } from "$lib/api";
  import { formatDuration } from "$lib/utils";
  import StatusBadge from "$lib/components/StatusBadge.svelte";

  let trace = $state<TraceDetail | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let selectedSpan = $state<TraceSpan | null>(null);

  const traceId = $derived(page.params.id ?? "");

  async function load() {
    try {
      loading = true;
      error = null;
      if (!traceId) { error = "Missing trace ID"; loading = false; return; }
      trace = await getTrace(traceId);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load trace";
    } finally {
      loading = false;
    }
  }

  $effect(() => { load(); });

  // Build ordered span list with depth
  interface SpanWithDepth extends TraceSpan {
    depth: number;
    durationMs: number;
    offsetMs: number;
  }

  function buildSpanTree(spans: TraceSpan[], traceStart: string): SpanWithDepth[] {
    const spanMap = new Map<string, TraceSpan>();
    for (const s of spans) spanMap.set(s.span_id, s);

    function getDepth(span: TraceSpan): number {
      let depth = 0;
      let pid = span.parent_span_id ?? undefined;
      while (pid) {
        depth++;
        const parent = spanMap.get(pid);
        pid = parent?.parent_span_id ?? undefined;
      }
      return depth;
    }

    const traceStartMs = new Date(traceStart).getTime();

    // Sort by start_time, then by depth
    return spans
      .map((s) => ({
        ...s,
        depth: getDepth(s),
        durationMs: new Date(s.end_time).getTime() - new Date(s.start_time).getTime(),
        offsetMs: new Date(s.start_time).getTime() - traceStartMs,
      }))
      .sort((a, b) => a.offsetMs - b.offsetMs || a.depth - b.depth);
  }

  function spanColor(status: string): string {
    if (status === "error") return "bg-[var(--color-danger)]";
    if (status === "ok" || status === "success") return "bg-[var(--color-success)]";
    return "bg-[var(--color-surface-overlay)]";
  }

  function spanBarColor(status: string): string {
    if (status === "error") return "bg-[var(--color-danger)]/80 hover:bg-[var(--color-danger)]";
    if (status === "ok" || status === "success") return "bg-[var(--color-success)]/80 hover:bg-[var(--color-success)]";
    return "bg-[var(--color-surface-overlay)]/80 hover:bg-[var(--color-surface-overlay)]";
  }

  const orderedSpans = $derived(
    trace ? buildSpanTree(trace.spans, trace.start_time) : []
  );

  const totalDuration = $derived(trace?.duration_ms ?? 0);

  const totalTokens = $derived(
    trace?.spans.reduce((sum, s) => {
      const attrs = s.attributes as Record<string, unknown> | null | undefined;
      const t = attrs?.tokens;
      return sum + (typeof t === "number" ? t : 0);
    }, 0) ?? 0
  );

  // Token breakdown by model
  const tokensByModel = $derived.by(() => {
    if (!trace) return [];
    const map = new Map<string, number>();
    for (const s of trace.spans) {
      const attrs = s.attributes as Record<string, unknown> | null | undefined;
      const model = (attrs?.model as string | undefined) ?? "unknown";
      const tokens = typeof attrs?.tokens === "number" ? attrs.tokens : 0;
      if (tokens > 0) map.set(model, (map.get(model) ?? 0) + tokens);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  });
</script>

<svelte:head><title>{trace?.workflow ?? trace?.name ?? 'Trace'} | HiAi Observe</title></svelte:head>

<div class="p-6 max-w-[1400px] mx-auto space-y-6">
  <!-- Back link -->
  <a href="/traces" class="inline-flex items-center gap-1.5 text-sm text-[var(--color-accent)] hover:underline transition-colors">
    <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M19 12H5m7-7l-7 7 7 7"/></svg>
    Back to Traces
  </a>

  <!-- Error banner -->
  {#if error}
    <div class="flex items-center gap-3 rounded-lg border border-[var(--color-danger)]/50 bg-[var(--color-danger-bg)] px-4 py-3 text-sm text-[var(--color-danger)]">
      <svg class="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <span class="flex-1">{error}</span>
      <button type="button" onclick={() => load()} class="rounded border border-[var(--color-danger)]/50 px-2.5 py-1 text-xs text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)] transition-colors">Retry</button>
    </div>
  {/if}

  {#if loading}
    <div class="space-y-4">
      <div class="h-10 w-1/2 animate-pulse rounded-lg bg-[var(--color-surface-raised)]"></div>
      <div class="h-6 w-1/3 animate-pulse rounded-lg bg-[var(--color-surface-raised)]"></div>
      <div class="h-64 animate-pulse rounded-xl bg-[var(--color-surface-raised)]"></div>
    </div>
  {:else if trace}
    <!-- Header -->
    <div class="space-y-3">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 class="text-2xl font-bold text-[var(--color-text-primary)]">{trace.workflow || trace.name}</h1>
          <code class="mt-1 inline-block rounded bg-[var(--color-surface-overlay)] px-2 py-0.5 font-mono text-xs text-[var(--color-text-muted)]">{trace.trace_id}</code>
        </div>
        <StatusBadge status={trace.status} size="md" />
      </div>

      <!-- Stats cards -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div class="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-3">
          <p class="text-xs text-[var(--color-text-muted)]">Duration</p>
          <p class="mt-1 text-lg font-semibold text-[var(--color-text-primary)]">{formatDuration(totalDuration)}</p>
        </div>
        <div class="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-3">
          <p class="text-xs text-[var(--color-text-muted)]">Spans</p>
          <p class="mt-1 text-lg font-semibold text-[var(--color-text-primary)]">{trace.spans.length}</p>
        </div>
        <div class="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-3">
          <p class="text-xs text-[var(--color-text-muted)]">Total Tokens</p>
          <p class="mt-1 text-lg font-semibold text-[var(--color-text-primary)]">{totalTokens > 0 ? totalTokens.toLocaleString() : "-"}</p>
        </div>
        {#if trace.agent}
          <div class="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-3">
            <p class="text-xs text-[var(--color-text-muted)]">Agent</p>
            <p class="mt-1 text-lg font-semibold text-[var(--color-text-primary)]">{trace.agent}</p>
          </div>
        {/if}
      </div>
    </div>

    <div class="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6">
      <!-- Waterfall timeline -->
      <div class="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)]">
        <div class="flex items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface-overlay)]/50 px-4 py-2.5">
          <svg class="h-4 w-4 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
          <h2 class="text-sm font-semibold text-[var(--color-text-secondary)]">Span Timeline</h2>
        </div>

        {#if orderedSpans.length === 0}
          <div class="flex flex-col items-center justify-center py-16">
            <svg class="mb-3 h-8 w-8 text-[var(--color-text-muted)] opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
            <p class="text-sm text-[var(--color-text-muted)]">No spans recorded</p>
          </div>
        {:else}
          <!-- Time ruler -->
          <div class="flex items-center border-b border-[var(--color-border)] bg-[var(--color-surface-overlay)]/30 px-4 py-1">
            <div class="w-52 shrink-0"></div>
            <div class="flex flex-1 justify-between text-[10px] text-[var(--color-text-muted)] tabular-nums">
              <span>0ms</span>
              <span>{formatDuration(totalDuration * 0.25)}</span>
              <span>{formatDuration(totalDuration * 0.5)}</span>
              <span>{formatDuration(totalDuration * 0.75)}</span>
              <span>{formatDuration(totalDuration)}</span>
            </div>
            <div class="w-20 shrink-0"></div>
          </div>

          <div class="divide-y divide-[var(--color-border)]/50">
            {#each orderedSpans as span (span.span_id)}
              {@const pct = totalDuration > 0 ? (span.offsetMs / totalDuration) * 100 : 0}
              {@const widthPct = totalDuration > 0 ? Math.max((span.durationMs / totalDuration) * 100, 0.5) : 0}
              <button type="button"
                class="flex w-full items-center gap-0 px-4 py-2 text-left transition-colors hover:bg-[var(--color-accent)]/5 {selectedSpan?.span_id === span.span_id ? 'bg-[var(--color-accent)]/10' : ''}"
                onclick={() => selectedSpan = selectedSpan?.span_id === span.span_id ? null : span}
              >
                <!-- Span name -->
                <div class="w-52 shrink-0 truncate pr-3" style="padding-left: {span.depth * 16}px">
                  <div class="flex items-center gap-1.5">
                    <span class="inline-block h-2 w-2 shrink-0 rounded-full {spanColor(span.status)}"></span>
                    <span class="truncate text-xs font-medium text-[var(--color-text-primary)]" title={span.name}>{span.name}</span>
                  </div>
                </div>

                <!-- Bar -->
                <div class="relative h-5 flex-1">
                  <div class="absolute inset-0 rounded bg-[var(--color-surface-overlay)]/30"></div>
                  <div
                    class="absolute h-full rounded {spanBarColor(span.status)} transition-all cursor-pointer"
                    style="left: {pct}%; width: {widthPct}%"
                    title="{span.name}: {formatDuration(span.durationMs)}"
                  ></div>
                </div>

                <!-- Duration -->
                <span class="w-20 shrink-0 text-right text-xs tabular-nums text-[var(--color-text-muted)]">{formatDuration(span.durationMs)}</span>
              </button>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Sidebar -->
      <div class="space-y-4">
        <!-- Selected span details -->
        {#if selectedSpan}
          <div class="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] overflow-hidden">
            <div class="flex items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface-overlay)]/50 px-4 py-2.5">
              <span class="inline-block h-2 w-2 rounded-full {spanColor(selectedSpan.status)}"></span>
              <h3 class="text-sm font-semibold text-[var(--color-text-primary)] truncate">{selectedSpan.name}</h3>
            </div>
            <div class="p-4 space-y-3">
              <dl class="space-y-2 text-xs">
                <div class="flex justify-between">
                  <dt class="text-[var(--color-text-muted)]">Span ID</dt>
                  <dd class="font-mono text-[var(--color-text-secondary)]">{selectedSpan.span_id}</dd>
                </div>
                <div class="flex justify-between">
                  <dt class="text-[var(--color-text-muted)]">Parent</dt>
                  <dd class="font-mono text-[var(--color-text-secondary)]">{selectedSpan.parent_span_id ?? "root"}</dd>
                </div>
                <div class="flex justify-between">
                  <dt class="text-[var(--color-text-muted)]">Kind</dt>
                  <dd class="text-[var(--color-text-secondary)]">{selectedSpan.kind}</dd>
                </div>
                <div class="flex justify-between">
                  <dt class="text-[var(--color-text-muted)]">Status</dt>
                  <dd><span class="rounded px-1.5 py-0.5 text-[10px] font-medium {spanColor(selectedSpan.status)} text-white">{selectedSpan.status}</span></dd>
                </div>
                <div class="flex justify-between">
                  <dt class="text-[var(--color-text-muted)]">Duration</dt>
                  <dd class="text-[var(--color-text-secondary)]">{formatDuration(new Date(selectedSpan.end_time).getTime() - new Date(selectedSpan.start_time).getTime())}</dd>
                </div>
                <div class="flex justify-between">
                  <dt class="text-[var(--color-text-muted)]">Start</dt>
                  <dd class="text-[var(--color-text-secondary)]">{new Date(selectedSpan.start_time).toLocaleTimeString()}</dd>
                </div>
              </dl>

              {#if selectedSpan.attributes && Object.keys(selectedSpan.attributes as Record<string, unknown>).length > 0}
                <div>
                  <h4 class="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-2">Attributes</h4>
                  <div class="space-y-1">
                    {#each Object.entries(selectedSpan.attributes as Record<string, unknown>) as [key, value] (key)}
                      <div class="flex items-start gap-2 text-xs">
                        <span class="shrink-0 text-[var(--color-text-muted)]">{key}:</span>
                        <span class="break-all text-[var(--color-text-secondary)]">{typeof value === "object" ? JSON.stringify(value) : String(value)}</span>
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}
            </div>
          </div>
        {:else}
          <div class="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-raised)] p-6 text-center">
            <p class="text-sm text-[var(--color-text-muted)]">Click a span to see details</p>
          </div>
        {/if}

        <!-- Token breakdown by model -->
        {#if tokensByModel.length > 0}
          <div class="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] overflow-hidden">
            <div class="flex items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface-overlay)]/50 px-4 py-2.5">
              <svg class="h-4 w-4 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
              <h3 class="text-sm font-semibold text-[var(--color-text-secondary)]">Tokens by Model</h3>
            </div>
            <div class="p-4 space-y-3">
              {#each tokensByModel as [model, tokens] (model)}
                {@const maxTokens = tokensByModel[0]?.[1] ?? 1}
                {@const barPct = (tokens / maxTokens) * 100}
                <div>
                  <div class="flex items-center justify-between text-xs mb-1">
                    <span class="font-medium text-[var(--color-text-primary)]">{model}</span>
                    <span class="tabular-nums text-[var(--color-text-muted)]">{tokens.toLocaleString()}</span>
                  </div>
                  <div class="h-2 rounded-full bg-[var(--color-surface-overlay)]">
                    <div
                      class="h-full rounded-full bg-[var(--color-accent)]/70 transition-all"
                      style="width: {barPct}%"
                    ></div>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>
