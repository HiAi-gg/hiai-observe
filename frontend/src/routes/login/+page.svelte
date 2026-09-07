<script lang="ts">
import { goto } from "$app/navigation";
import { resolve } from "$app/paths";

let email = $state("");
let password = $state("");
let submitting = $state(false);
let errorMessage = $state<string | null>(null);

async function handleSubmit(event: SubmitEvent) {
  event.preventDefault();
  if (submitting) return;
  errorMessage = null;
  const trimmed = email.trim();
  if (!trimmed || !password) {
    errorMessage = "Email and password are required.";
    return;
  }
  submitting = true;
  try {
    const res = await fetch(`${window.location.origin}/api/auth/sign-in/email`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: trimmed, password }),
    });
    const payload = (await res.json().catch(() => null)) as
      | { user?: unknown }
      | { message?: string; error?: string }
      | null;
    if (!res.ok) {
      errorMessage = String(
        (payload && "message" in payload && payload.message) ||
          (payload && "error" in payload && payload.error) ||
          "Invalid email or password.",
      );
      return;
    }
    await goto(resolve("/"));
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Unable to reach the server.";
  } finally {
    submitting = false;
  }
}
</script>

<svelte:head>
  <title>Sign in — HiAi Observe</title>
</svelte:head>

<main class="flex min-h-screen items-center justify-center bg-[var(--background)] px-4 py-12">
  <div class="w-full max-w-sm">
    <div class="mb-8 text-center">
      <h1 class="text-2xl font-bold tracking-tight text-[var(--foreground)]">HiAi Observe</h1>
      <p class="mt-1 text-sm text-[var(--muted-foreground)]">Sign in to the observability console</p>
    </div>
    <form
      class="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6"
      onsubmit={handleSubmit}
      novalidate
    >
      <div class="space-y-1.5">
        <label for="email" class="text-sm font-medium">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          autocomplete="username"
          required
          bind:value={email}
          disabled={submitting}
          class="flex h-10 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 text-sm"
        />
      </div>
      <div class="space-y-1.5">
        <label for="password" class="text-sm font-medium">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autocomplete="current-password"
          required
          bind:value={password}
          disabled={submitting}
          class="flex h-10 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 text-sm"
        />
      </div>
      {#if errorMessage}
        <p class="rounded-md border border-[var(--destructive)]/30 bg-[color-mix(in_oklch,var(--destructive)_12%,transparent)] px-3 py-2 text-sm text-[var(--destructive)]" role="alert">
          {errorMessage}
        </p>
      {/if}
      <button
        type="submit"
        disabled={submitting}
        class="inline-flex h-10 w-full items-center justify-center rounded-md bg-[var(--primary)] px-4 text-sm font-medium text-white disabled:opacity-60"
      >
        {submitting ? "Signing in…" : "Sign in"}
      </button>
    </form>
    <p class="mt-6 text-center text-xs text-[var(--muted-foreground)]">
      Restricted to authorized operators.
    </p>
  </div>
</main>
