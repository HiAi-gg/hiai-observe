<script lang="ts">
import { page } from "$app/state";

function retry() {
  window.location.reload();
}

function goHome() {
  window.location.href = "/";
}
</script>

<div class="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 text-center">
  <div class="rounded-full border border-[var(--destructive)]/30 bg-[color-mix(in_oklch,var(--destructive)_18%,transparent)] p-4">
    <svg class="h-10 w-10 text-[var(--destructive)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
    </svg>
  </div>

  <div>
    <h1 class="text-2xl font-bold text-[var(--foreground)]">
      {page.status === 404 ? "Page Not Found" : "Something Went Wrong"}
    </h1>
    <p class="mt-2 max-w-md text-[var(--muted-foreground)]">
      {page.error?.message ?? "An unexpected error occurred. Please try again."}
    </p>
    <p class="mt-1 font-mono text-sm text-[var(--muted-foreground)]">
      Error {page.status}
    </p>
  </div>

  <div class="flex gap-3">
    <button type="button"
      onclick={retry}
      class="rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)] transition-colors"
    >
      Retry
    </button>
    <button type="button"
      onclick={goHome}
      class="rounded-md border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--muted-foreground)] hover:border-[var(--primary)] hover:text-[var(--foreground)] transition-colors"
    >
      Go Home
    </button>
  </div>
</div>
