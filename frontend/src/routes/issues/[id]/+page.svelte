<script lang="ts">
import { page } from "$app/state";
import ConfirmDialog from "$lib/adapters/ConfirmDialogAdapter.svelte";
import StatusBadge from "$lib/adapters/StatusBadgeAdapter.svelte";
import {
  createIssueComment,
  deleteIssueComment,
  getEvents,
  getIssue,
  getIssueComments,
  getTeamMembers,
  type Issue,
  type IssueComment,
  type IssueEvent,
  type TeamMember,
  updateIssue,
} from "$lib/api";
import { showToast } from "$lib/stores.svelte";
import { timeAgo } from "$lib/utils";

let issue = $state<Issue | null>(null);
let events = $state<IssueEvent[]>([]);
let selectedEventIdx = $state(0);
let loading = $state(true);
let error = $state<string | null>(null);
let actionLoading = $state(false);
let occurrenceData = $state<Array<{ time: Date; value: number }>>([]);

// Team & assignee
let teamMembers = $state<TeamMember[]>([]);
let assigneeName = $state<string | null>(null);

// Comments
let comments = $state<IssueComment[]>([]);
let commentAuthor = $state("");
let commentBody = $state("");
let submittingComment = $state(false);
let confirmDeleteCommentId = $state<string | null>(null);
let showDeleteCommentDialog = $state(false);

const issueId = $derived(page.params.id ?? "");

async function load() {
  try {
    loading = true;
    error = null;
    if (!issueId) {
      error = "Missing issue ID";
      loading = false;
      return;
    }

    const [issueData, evResult, teamResult, commentResult] = await Promise.all([
      getIssue(issueId),
      getEvents({ issueId, limit: "20" }),
      getTeamMembers({ limit: 200 }).catch(() => ({ data: [] })),
      getIssueComments(issueId).catch(() => ({ data: [] })),
    ]);

    issue = issueData;
    events = evResult.data;
    selectedEventIdx = 0;
    teamMembers = teamResult.data;
    comments = commentResult.data;

    // Resolve assignee name
    if (issue.assignedTo) {
      const member = teamMembers.find((m) => m.id === issue!.assignedTo);
      assigneeName = member?.name ?? null;
    } else {
      assigneeName = null;
    }

    // Build occurrence sparkline from events grouped by day
    const dayMap = new Map<string, number>();
    for (const ev of events) {
      const day = new Date(ev.createdAt).toISOString().slice(0, 10);
      dayMap.set(day, (dayMap.get(day) ?? 0) + 1);
    }
    occurrenceData = [...dayMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, count]) => ({ time: new Date(day + "T12:00:00Z"), value: count }));
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load issue";
  } finally {
    loading = false;
  }
}

async function handleAssign(assigneeId: string) {
  if (!issue) return;
  try {
    await updateIssue(issue.id, { assignedTo: assigneeId || "" });
    await load();
    showToast(assigneeId ? "Issue assigned" : "Issue unassigned", "success");
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to update assignee";
  }
}

async function handleSubmitComment() {
  if (!issueId || !commentAuthor.trim() || !commentBody.trim()) return;
  try {
    submittingComment = true;
    await createIssueComment(issueId, {
      authorName: commentAuthor.trim(),
      body: commentBody.trim(),
    });
    commentBody = "";
    const result = await getIssueComments(issueId);
    comments = result.data;
    showToast("Comment added", "success");
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to add comment";
  } finally {
    submittingComment = false;
  }
}

async function handleDeleteComment(id: string) {
  try {
    await deleteIssueComment(id);
    confirmDeleteCommentId = null;
    showDeleteCommentDialog = false;
    if (issueId) {
      const result = await getIssueComments(issueId);
      comments = result.data;
    }
    showToast("Comment deleted", "success");
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to delete comment";
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

$effect(() => {
  load();
});

function parseStackTrace(raw: unknown): string | null {
  if (!raw) return null;
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw))
    return raw
      .map((f: Record<string, unknown>) => {
        const loc = (f.filename as string) || (f.abs_path as string) || "?";
        const fn = (f.function as string) || "<anonymous>";
        const line = f.lineno ? `:${f.lineno}` : "";
        const col = f.colno ? `:${f.colno}` : "";
        return `  at ${fn} (${loc}${line}${col})`;
      })
      .join("\n");
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
  if (typeof raw === "object" && raw !== null && "values" in raw)
    return ((raw as Record<string, unknown>).values as Breadcrumb[] | undefined) ?? [];
  if (Array.isArray(raw)) return raw as Breadcrumb[];
  return [];
}

const selectedEvent = $derived(events[selectedEventIdx]);
const rawPayload = $derived(
  (selectedEvent?.context?.rawPayload as Record<string, unknown>) ?? selectedEvent?.context,
);

const stackTrace = $derived.by(() => {
  if (!selectedEvent) return null;
  if (selectedEvent.stackTrace) return parseStackTrace(selectedEvent.stackTrace);
  const exception = rawPayload?.exception as Record<string, unknown> | undefined;
  const values = exception?.values as Array<Record<string, unknown>> | undefined;
  const exc = values?.[values.length! - 1];
  const frames = exc?.stacktrace as Record<string, unknown> | undefined;
  const frameArray = frames?.frames as unknown[] | undefined;
  return parseStackTrace(frameArray ?? null);
});

const exceptionChain = $derived.by(() => {
  const exception = rawPayload?.exception as Record<string, unknown> | undefined;
  const values = exception?.values as Array<Record<string, unknown>> | undefined;
  if (!values || values.length <= 1) return [];
  // Return all except the last (primary) in reverse order (caused by...)
  return values
    .slice(0, -1)
    .reverse()
    .map((v) => ({
      type: (v.type as string) ?? "Error",
      value: (v.value as string) ?? "",
      stacktrace: parseStackTrace((v.stacktrace as Record<string, unknown>)?.frames ?? null),
    }));
});

const breadcrumbs = $derived.by(() => {
  if (!selectedEvent) return [];
  const rp = rawPayload;
  if (rp?.breadcrumbs) return parseBreadcrumbs(rp.breadcrumbs);
  if (selectedEvent?.context?.breadcrumbs)
    return parseBreadcrumbs(selectedEvent.context.breadcrumbs);
  return [];
});

const requestContext = $derived.by(() => {
  const rp = rawPayload;
  return (rp?.request as Record<string, unknown>) ?? null;
});

const userContext = $derived.by(() => {
  const rp = rawPayload;
  return (rp?.user as Record<string, unknown>) ?? null;
});

// Affected users: collect unique users from all events
const affectedUsers = $derived.by(() => {
  const userMap = new Map<string, { id?: string; email?: string; username?: string }>();
  for (const ev of events) {
    const ctx = (ev.context?.rawPayload as Record<string, unknown>) ?? ev.context;
    const u = ctx?.user as Record<string, unknown> | undefined;
    if (u) {
      const key =
        (u.id as string) ?? (u.email as string) ?? (u.username as string) ?? JSON.stringify(u);
      if (!userMap.has(key)) {
        userMap.set(key, {
          id: u.id as string | undefined,
          email: u.email as string | undefined,
          username: u.username as string | undefined,
        });
      }
    }
  }
  return [...userMap.values()];
});

// Raw JSON toggle
let showRaw = $state(false);

// Sparkline SVG helper
const sparklinePath = $derived.by(() => {
  if (occurrenceData.length < 2) return "";
  const w = 200,
    h = 40,
    pad = 4;
  const maxVal = Math.max(...occurrenceData.map((d) => d.value), 1);
  const points = occurrenceData.map((d, i) => {
    const x = pad + (i / (occurrenceData.length - 1)) * (w - 2 * pad);
    const y = h - pad - (d.value / maxVal) * (h - 2 * pad);
    return `${x},${y}`;
  });
  return `M ${points.join(" L ")}`;
});
</script>

<svelte:head><title>{issue?.title ?? 'Issue'} | HiAi Observe</title></svelte:head>

<div class="p-6 max-w-[1400px] mx-auto space-y-6">
  <!-- Back link -->
  <a href="/issues" class="inline-flex items-center gap-1.5 text-sm text-[var(--primary)] hover:underline transition-colors">
    <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M19 12H5m7-7l-7 7 7 7"/></svg>
    Back to Issues
  </a>

  {#if error}
    <div class="flex items-center gap-3 rounded-lg border border-[var(--destructive)]/50 bg-[color-mix(in_oklch,var(--destructive)_18%,transparent)] px-4 py-3 text-sm text-[var(--destructive)]">
      <svg class="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <span class="flex-1">{error}</span>
      <button type="button" onclick={() => load()} class="rounded border border-[var(--destructive)]/50 px-2.5 py-1 text-xs text-[var(--destructive)] hover:bg-[color-mix(in_oklch,var(--destructive)_18%,transparent)] transition-colors">Retry</button>
    </div>
  {/if}

  {#if loading}
    <div class="space-y-4">
      <div class="h-10 w-3/4 animate-pulse rounded-lg bg-[var(--card)]"></div>
      <div class="h-6 w-1/2 animate-pulse rounded-lg bg-[var(--card)]"></div>
      <div class="h-48 animate-pulse rounded-xl bg-[var(--card)]"></div>
    </div>
  {:else if issue}
    <!-- Header -->
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div class="space-y-3">
        <h1 class="text-2xl font-bold text-[var(--foreground)] leading-tight">{issue.title}</h1>
        <div class="flex flex-wrap items-center gap-3">
          <StatusBadge status={issue.status} size="md" />
          <span class="text-sm text-[var(--muted-foreground)]">{issue.type}</span>
          <span class="text-sm text-[var(--muted-foreground)]">&middot;</span>
          <span class="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--muted-foreground)]">
            <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
            {issue.count.toLocaleString()} occurrences
          </span>
          <span class="text-sm text-[var(--muted-foreground)]">&middot;</span>
          <span class="text-sm text-[var(--muted-foreground)]">First seen {timeAgo(issue.firstSeen)}</span>
        </div>
      </div>
      <div class="flex items-center gap-2">
        {#if issue.status !== "resolved"}
          <button type="button" onclick={() => setStatus("resolved")} disabled={actionLoading}
            class="inline-flex items-center gap-1.5 rounded-lg border border-[var(--success)]/50 bg-[color-mix(in_oklch,var(--success)_18%,transparent)] px-4 py-2 text-sm font-medium text-[var(--success)] transition-all hover:bg-[color-mix(in_oklch,var(--success)_18%,transparent)] hover:border-[var(--success)] disabled:opacity-50">
            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M5 13l4 4L19 7"/></svg>
            Resolve
          </button>
        {/if}
        {#if issue.status !== "ignored"}
          <button type="button" onclick={() => setStatus("ignored")} disabled={actionLoading}
            class="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--muted-foreground)] transition-all hover:bg-[var(--accent)] hover:border-[var(--muted-foreground)] disabled:opacity-50">
            Ignore
          </button>
        {/if}
        {#if issue.status !== "unresolved"}
          <button type="button" onclick={() => setStatus("unresolved")} disabled={actionLoading}
            class="inline-flex items-center gap-1.5 rounded-lg border border-[var(--warning)]/50 bg-[color-mix(in_oklch,var(--warning)_18%,transparent)] px-4 py-2 text-sm font-medium text-[var(--warning)] transition-all hover:bg-[color-mix(in_oklch,var(--warning)_18%,transparent)] hover:border-[var(--warning)] disabled:opacity-50">
            Reopen
          </button>
        {/if}
      </div>
    </div>

    <!-- Occurrence sparkline -->
    {#if occurrenceData.length > 1}
      <div class="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div class="flex items-center justify-between">
          <h3 class="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">Occurrence Trend</h3>
          <span class="text-xs text-[var(--muted-foreground)]">{events.length} events in sample</span>
        </div>
        <svg width="200" height="40" class="mt-2 w-full" viewBox="0 0 200 40" preserveAspectRatio="none">
          <path d={sparklinePath} fill="none" stroke="var(--destructive)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
          {#each occurrenceData as point, i}
            {@const x = 4 + (i / (occurrenceData.length - 1)) * 192}
            {@const y = 40 - 4 - ((point.value / Math.max(...occurrenceData.map(d => d.value), 1)) * 32)}
            <circle cx={x} cy={y} r="2" fill="var(--destructive)" />
          {/each}
        </svg>
      </div>
    {/if}

    <div class="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
      <!-- Main content -->
      <div class="space-y-6">
        <!-- Stack trace with chained exceptions -->
        <div class="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <div class="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--accent)]/50 px-4 py-2.5">
            <svg class="h-4 w-4 text-[var(--muted-foreground)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"/></svg>
            <h2 class="text-sm font-semibold text-[var(--muted-foreground)]">Stack Trace</h2>
            <button type="button" onclick={() => { showRaw = !showRaw; }}
              class="ml-auto rounded px-2 py-0.5 text-[10px] font-medium transition-colors {showRaw ? 'bg-[color-mix(in_oklch,var(--primary)_12%,transparent)] text-[var(--primary)]' : 'text-[var(--muted-foreground)] hover:bg-[var(--accent)]'}">
              {showRaw ? "Stack Trace" : "View Raw"}
            </button>
            {#if events.length > 1}
              <span class="flex items-center gap-2">
                <button type="button" onclick={() => { selectedEventIdx = Math.max(0, selectedEventIdx - 1); }} disabled={selectedEventIdx === 0}
                  class="rounded p-1 text-[var(--muted-foreground)] hover:bg-[var(--accent)] disabled:opacity-30">
                  <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M15 19l-7-7 7-7"/></svg>
                </button>
                <span class="text-xs text-[var(--muted-foreground)]">{selectedEventIdx + 1}/{events.length}</span>
                <button type="button" onclick={() => { selectedEventIdx = Math.min(events.length - 1, selectedEventIdx + 1); }} disabled={selectedEventIdx >= events.length - 1}
                  class="rounded p-1 text-[var(--muted-foreground)] hover:bg-[var(--accent)] disabled:opacity-30">
                  <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M9 5l7 7-7 7"/></svg>
                </button>
              </span>
            {/if}
          </div>
          {#if showRaw && selectedEvent}
            <!-- Raw JSON view -->
            <div class="relative">
              <pre class="overflow-x-auto bg-[var(--background)] p-5 text-xs leading-relaxed"><code class="text-[var(--muted-foreground)]">{JSON.stringify(rawPayload ?? selectedEvent, null, 2)}</code></pre>
            </div>
          {:else if stackTrace}
            <pre class="overflow-x-auto bg-[var(--background)] p-5 text-xs leading-relaxed"><code class="text-[var(--success)]">{stackTrace}</code></pre>
          {:else}
            <div class="flex flex-col items-center justify-center py-12">
              <p class="text-sm text-[var(--muted-foreground)]">No stack trace available</p>
            </div>
          {/if}

          <!-- Chained exceptions ("Caused by:") -->
          {#if exceptionChain.length > 0}
            {#each exceptionChain as chainExc, i}
              <div class="border-t border-[var(--border)]">
                <div class="px-4 py-2 text-xs font-semibold text-[var(--warning)]">
                  Caused by: {chainExc.type}: {chainExc.value}
                </div>
                {#if chainExc.stacktrace}
                  <pre class="overflow-x-auto bg-[var(--background)] px-5 pb-4 text-xs leading-relaxed"><code class="text-[var(--muted-foreground)]">{chainExc.stacktrace}</code></pre>
                {/if}
              </div>
            {/each}
          {/if}
        </div>

        <!-- Breadcrumbs timeline -->
        {#if breadcrumbs.length > 0}
          <div class="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
            <div class="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--accent)]/50 px-4 py-2.5">
              <svg class="h-4 w-4 text-[var(--muted-foreground)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <h2 class="text-sm font-semibold text-[var(--muted-foreground)]">Breadcrumbs</h2>
              <span class="ml-auto text-xs text-[var(--muted-foreground)]">{breadcrumbs.length} events</span>
            </div>
            <div class="relative p-4">
              <div class="absolute left-[27px] top-4 bottom-4 w-px bg-[var(--border)]"></div>
              <div class="space-y-3">
                {#each breadcrumbs as crumb, i (i)}
                  <div class="relative flex items-start gap-3 pl-2">
                    <div class="relative z-10 mt-1 h-3 w-3 shrink-0 rounded-full border-2 border-[var(--primary)] bg-[var(--card)]"></div>
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-2">
                        <span class="rounded bg-[var(--accent)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--muted-foreground)] uppercase">{crumb.category || crumb.type || "event"}</span>
                        {#if crumb.timestamp}
                          <span class="text-[10px] text-[var(--muted-foreground)]">{new Date(crumb.timestamp * 1000).toLocaleTimeString()}</span>
                        {/if}
                      </div>
                      <p class="mt-0.5 truncate text-sm text-[var(--muted-foreground)]">{crumb.message ?? JSON.stringify(crumb.data ?? "")}</p>
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          </div>
        {/if}

        <!-- Event list (navigator) -->
        {#if events.length > 1}
          <div class="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
            <div class="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--accent)]/50 px-4 py-2.5">
              <h2 class="text-sm font-semibold text-[var(--muted-foreground)]">Events ({events.length})</h2>
            </div>
            <div class="max-h-64 overflow-y-auto">
              {#each events as ev, i (ev.id)}
                <button type="button"
                  onclick={() => { selectedEventIdx = i; }}
                  class="flex w-full items-center gap-3 border-b border-[var(--border)] px-4 py-2.5 text-left transition-colors hover:bg-[var(--accent)]/50"
                  class:bg-[color-mix(in_oklch,var(--primary)_12%,transparent)]={i === selectedEventIdx}
                >
                  <span class="h-2 w-2 shrink-0 rounded-full" style="background: {i === selectedEventIdx ? 'var(--primary)' : 'var(--border)'}"></span>
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-xs font-medium text-[var(--foreground)]">{ev.message ?? ev.exceptionType ?? "Event"}</p>
                    <p class="text-[10px] text-[var(--muted-foreground)]">{timeAgo(ev.createdAt)}</p>
                  </div>
                </button>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Comments -->
        <div class="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <div class="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--accent)]/50 px-4 py-2.5">
            <svg class="h-4 w-4 text-[var(--muted-foreground)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
            <h2 class="text-sm font-semibold text-[var(--muted-foreground)]">Comments ({comments.length})</h2>
          </div>

          <!-- Comment form -->
          <div class="border-b border-[var(--border)] p-4 space-y-3">
            <input
              type="text"
              bind:value={commentAuthor}
              placeholder="Your name"
              class="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none"
            />
            <textarea
              bind:value={commentBody}
              placeholder="Write a comment..."
              rows="3"
              class="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none resize-none"
            ></textarea>
            <div class="flex justify-end">
              <button type="button"
                onclick={handleSubmitComment}
                disabled={!commentAuthor.trim() || !commentBody.trim() || submittingComment}
                class="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-40 transition-colors"
              >
                {submittingComment ? "Posting..." : "Post Comment"}
              </button>
            </div>
          </div>

          <!-- Comment list -->
          {#if comments.length === 0}
            <div class="flex flex-col items-center justify-center py-8">
              <p class="text-sm text-[var(--muted-foreground)]">No comments yet</p>
            </div>
          {:else}
            <div class="divide-y divide-[var(--border)]">
              {#each comments as comment (comment.id)}
                <div class="px-4 py-3">
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                      <div class="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--accent)] text-[10px] font-medium text-[var(--muted-foreground)]">
                        {comment.authorName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                      </div>
                      <span class="text-sm font-medium text-[var(--foreground)]">{comment.authorName}</span>
                      <span class="text-xs text-[var(--muted-foreground)]">{timeAgo(comment.createdAt)}</span>
                    </div>
                    <button type="button"
                      onclick={() => { confirmDeleteCommentId = comment.id; showDeleteCommentDialog = true; }}
                      class="text-xs text-[var(--destructive)] hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                  <p class="mt-2 text-sm text-[var(--muted-foreground)] whitespace-pre-wrap">{comment.body}</p>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>

      <!-- Sidebar -->
      <div class="space-y-4">
        <!-- Request context -->
        {#if requestContext}
          <div class="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 space-y-3">
            <h3 class="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">Request</h3>
            <dl class="space-y-2">
              {#if requestContext.method}
                <div>
                  <dt class="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">Method</dt>
                  <dd class="mt-0.5 text-xs font-mono text-[var(--muted-foreground)]">{requestContext.method}</dd>
                </div>
              {/if}
              {#if requestContext.url}
                <div>
                  <dt class="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">URL</dt>
                  <dd class="mt-0.5 break-all text-xs font-mono text-[var(--muted-foreground)]">{requestContext.url}</dd>
                </div>
              {/if}
              {#if requestContext.query_string}
                <div>
                  <dt class="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">Query</dt>
                  <dd class="mt-0.5 break-all text-xs font-mono text-[var(--muted-foreground)]">{requestContext.query_string}</dd>
                </div>
              {/if}
            </dl>
          </div>
        {/if}

        <!-- User context -->
        {#if userContext}
          <div class="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 space-y-3">
            <h3 class="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">User</h3>
            <dl class="space-y-2">
              {#if userContext.id}
                <div>
                  <dt class="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">ID</dt>
                  <dd class="mt-0.5 text-xs font-mono text-[var(--muted-foreground)]">{userContext.id}</dd>
                </div>
              {/if}
              {#if userContext.email}
                <div>
                  <dt class="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">Email</dt>
                  <dd class="mt-0.5 text-xs text-[var(--muted-foreground)]">{userContext.email}</dd>
                </div>
              {/if}
              {#if userContext.ip_address}
                <div>
                  <dt class="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">IP</dt>
                  <dd class="mt-0.5 text-xs font-mono text-[var(--muted-foreground)]">{userContext.ip_address}</dd>
                </div>
              {/if}
              {#if userContext.username}
                <div>
                  <dt class="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">Username</dt>
                  <dd class="mt-0.5 text-xs text-[var(--muted-foreground)]">{userContext.username}</dd>
                </div>
              {/if}
            </dl>
          </div>
        {/if}

        <!-- Timing -->
        <div class="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 space-y-3">
          <h3 class="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">Timing</h3>
          <div class="space-y-2">
            <div class="flex justify-between text-sm">
              <span class="text-[var(--muted-foreground)]">First seen</span>
              <span class="text-[var(--muted-foreground)]">{timeAgo(issue.firstSeen)}</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-[var(--muted-foreground)]">Last seen</span>
              <span class="text-[var(--muted-foreground)]">{timeAgo(issue.lastSeen)}</span>
            </div>
          </div>
        </div>

        <!-- Assignee -->
        <div class="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 space-y-3">
          <h3 class="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">Assignee</h3>
          {#if teamMembers.length > 0}
            <select
              value={issue.assignedTo ?? ""}
              onchange={(e) => handleAssign((e.target as HTMLSelectElement).value)}
              class="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none"
            >
              <option value="">Unassigned</option>
              {#each teamMembers as member (member.id)}
                <option value={member.id}>{member.name} ({member.role})</option>
              {/each}
            </select>
          {:else}
            <p class="text-xs text-[var(--muted-foreground)]">
              {#if assigneeName}
                {assigneeName}
              {:else}
                No team members configured
              {/if}
            </p>
          {/if}
          {#if assigneeName}
            <div class="flex items-center gap-2">
              <div class="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--accent)] text-[10px] font-medium text-[var(--muted-foreground)]">
                {assigneeName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
              </div>
              <span class="text-sm text-[var(--muted-foreground)]">{assigneeName}</span>
            </div>
          {/if}
        </div>

        <!-- Tags -->
        {#if issue.metadata && typeof issue.metadata === "object" && Object.keys(issue.metadata).length > 0}
          <div class="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 space-y-3">
            <h3 class="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">Tags</h3>
            <div class="flex flex-wrap gap-1.5">
              {#each Object.entries(issue.metadata).filter(([k]) => !["stackTrace", "rawPayload", "breadcrumbs"].includes(k)) as [key, value] (key)}
                <span class="inline-flex items-center gap-1 rounded-md bg-[var(--accent)] px-2 py-1 text-xs">
                  <span class="text-[var(--muted-foreground)]">{key}:</span>
                  <span class="font-medium text-[var(--muted-foreground)]">{typeof value === "object" ? JSON.stringify(value) : String(value)}</span>
                </span>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Affected Users -->
        {#if affectedUsers.length > 0}
          <div class="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 space-y-3">
            <h3 class="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
              Affected Users ({affectedUsers.length})
            </h3>
            <div class="space-y-1.5">
              {#each affectedUsers.slice(0, 10) as u, i (i)}
                <div class="flex items-center gap-2 text-xs">
                  <span class="h-2 w-2 shrink-0 rounded-full bg-[var(--warning)]"></span>
                  <span class="font-mono text-[var(--muted-foreground)]">{u.id ?? u.email ?? u.username ?? "unknown"}</span>
                  {#if u.email && u.id}
                    <span class="text-[var(--muted-foreground)]">({u.email})</span>
                  {/if}
                </div>
              {/each}
              {#if affectedUsers.length > 10}
                <p class="text-[10px] text-[var(--muted-foreground)]">+{affectedUsers.length - 10} more</p>
              {/if}
            </div>
          </div>
        {/if}

        <!-- Metadata -->
        {#if issue.metadata && Object.keys(issue.metadata).length > 0}
          <div class="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 space-y-3">
            <h3 class="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">Context</h3>
            <dl class="space-y-2">
              {#each Object.entries(issue.metadata).filter(([k]) => !["stackTrace", "rawPayload", "breadcrumbs"].includes(k)) as [key, value] (key)}
                <div>
                  <dt class="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">{key}</dt>
                  <dd class="mt-0.5 break-all text-xs text-[var(--muted-foreground)]">{typeof value === "object" ? JSON.stringify(value) : String(value)}</dd>
                </div>
              {/each}
            </dl>
          </div>
        {/if}

        <!-- SDK info -->
        {#if issue.sdk}
          <div class="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 space-y-3">
            <h3 class="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">SDK</h3>
            <p class="text-sm font-mono text-[var(--muted-foreground)]">{issue.sdk}</p>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<ConfirmDialog
  bind:open={showDeleteCommentDialog}
  title="Delete Comment"
  message="Are you sure you want to delete this comment? This action cannot be undone."
  confirmLabel="Delete"
  variant="danger"
  onconfirm={() => { if (confirmDeleteCommentId) handleDeleteComment(confirmDeleteCommentId); }}
  oncancel={() => { confirmDeleteCommentId = null; }}
/>
