<script lang="ts">
  import { onMount } from "svelte";

  let {
    open = $bindable(false),
    title = "Confirm",
    message = "Are you sure?",
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    variant = "danger",
    onconfirm,
    oncancel,
  }: {
    open?: boolean;
    title?: string;
    message?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: "danger" | "warning" | "info";
    onconfirm?: () => void;
    oncancel?: () => void;
  } = $props();

  let dialogEl = $state<HTMLDialogElement | null>(null);

  $effect(() => {
    if (dialogEl) {
      if (open && !dialogEl.open) {
        dialogEl.showModal();
      } else if (!open && dialogEl.open) {
        dialogEl.close();
      }
    }
  });

  function handleConfirm() {
    onconfirm?.();
    open = false;
  }

  function handleCancel() {
    oncancel?.();
    open = false;
  }

  function handleDialogClose() {
    open = false;
    oncancel?.();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      handleCancel();
    }
  }
</script>

<dialog
  bind:this={dialogEl}
  onclose={handleDialogClose}
  onkeydown={handleKeydown}
  class="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-0 shadow-2xl backdrop:bg-black/50 fixed inset-0 m-auto max-w-md w-[calc(100%-2rem)]"
>
  <div class="p-6">
    <h3 class="text-lg font-semibold text-[var(--color-text-primary)]">{title}</h3>
    <p class="mt-2 text-sm text-[var(--color-text-secondary)]">{message}</p>
    <div class="mt-6 flex justify-end gap-3">
      <button type="button"
        onclick={handleCancel}
        class="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-overlay)]"
      >
        {cancelLabel}
      </button>
      <button type="button"
        onclick={handleConfirm}
        class="rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors"
        class:bg-[var(--color-danger)]={variant === "danger"}
        class:hover:bg-[var(--color-danger)]={variant === "danger"}
        class:bg-[var(--color-warning)]={variant === "warning"}
        class:hover:bg-[var(--color-warning)]={variant === "warning"}
        class:bg-[var(--color-accent)]={variant === "info"}
        class:hover:bg-[var(--color-accent-hover)]={variant === "info"}
      >
        {confirmLabel}
      </button>
    </div>
  </div>
</dialog>
