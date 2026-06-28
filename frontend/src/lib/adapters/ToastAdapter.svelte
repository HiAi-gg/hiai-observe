<script lang="ts">
// ToastAdapter — local toast notification, no @hiai/ui equivalent yet.
//
// @hiai/ui exposes a `notificationStore` in `stores/notifications.svelte.ts`
// (id, message, type, duration) — the same data model this component renders.
// However, the store has no DOM rendering; consuming apps are expected to
// build their own renderer on top of it. This file is the renderer for
// hiai-observe's `showToast` / `getToasts` / `dismissToast` trio in
// `lib/stores.svelte.ts`, which is the project's local mirror of the
// canonical store.
//
// When @hiai/ui ships a renderer primitive, this adapter should wrap it.
//
// Local API (used by frontend):
//   message: string
//   type: "success" | "error" | "info" (default "info")
//   duration: number (ms, default 3000, <=0 to disable auto-dismiss)
//   ondismiss: () => void
import { onMount } from "svelte";

let {
  message,
  type = "info",
  duration = 3000,
  ondismiss,
}: {
  message: string;
  type?: "success" | "error" | "info";
  duration?: number;
  ondismiss?: () => void;
} = $props();

let visible = $state(true);

onMount(() => {
  if (duration > 0) {
    const timer = setTimeout(() => {
      visible = false;
      ondismiss?.();
    }, duration);
    return () => clearTimeout(timer);
  }
});

function dismiss() {
  visible = false;
  ondismiss?.();
}

function borderColor(t: string) {
  if (t === "success") return "color-mix(in oklch, var(--success) 50%, transparent)";
  if (t === "error") return "color-mix(in oklch, var(--destructive) 50%, transparent)";
  return "color-mix(in oklch, var(--info) 50%, transparent)";
}

function bgColor(t: string) {
  if (t === "success") return "color-mix(in oklch, var(--success) 18%, transparent)";
  if (t === "error") return "color-mix(in oklch, var(--destructive) 18%, transparent)";
  return "color-mix(in oklch, var(--info) 18%, transparent)";
}

function textColor(t: string) {
  if (t === "success") return "var(--success)";
  if (t === "error") return "var(--destructive)";
  return "var(--info)";
}
</script>

{#if visible}
  <div
    class="flex items-center gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg transition-all"
    style="border-color: {borderColor(type)}; background-color: {bgColor(type)}; color: {textColor(type)};"
    role="alert"
  >
    {#if type === "success"}
      <svg class="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
    {:else if type === "error"}
      <svg class="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
    {:else}
      <svg class="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
    {/if}
    <span class="flex-1">{message}</span>
    <button type="button" onclick={dismiss} class="shrink-0 rounded p-1 hover:bg-black/10 dark:hover:bg-white/10" aria-label="Dismiss">
      <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
    </button>
  </div>
{/if}
