<script lang="ts">
// ConfirmDialogAdapter — wraps @hiai-gg/hiai-ui ConfirmModal, preserving local API.
//
// Local API (used by frontend):
//   open: boolean (bindable)
//   variant: "danger" | "warning" | "info"
//   onconfirm: () => void
//   oncancel:  () => void
//
// Canonical @hiai-gg/hiai-ui ConfirmModal:
//   open: boolean (one-way)
//   variant: "default" | "destructive"
//   onConfirm: (reason?: string) => void
//   onCancel:  () => void
//
// Mapping:
//   variant:  danger|warning → destructive, info → default
//   callbacks: onconfirm→onConfirm, oncancel→onCancel
//   bindable open → mirrored to local state, set false on close.
import { ConfirmModal } from "@hiai-gg/hiai-ui";

interface Props {
  open?: boolean;
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "info";
  onconfirm?: () => void;
  oncancel?: () => void;
}

let {
  open = $bindable(false),
  title = "Confirm",
  message = "Are you sure?",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  onconfirm,
  oncancel,
}: Props = $props();

let canonicalVariant = $derived(
  variant === "danger" || variant === "warning" ? "destructive" : "default",
) as "default" | "destructive";

function handleConfirm() {
  onconfirm?.();
  open = false;
}

function handleCancel() {
  oncancel?.();
  open = false;
}
</script>

<ConfirmModal
  {open}
  {title}
  {message}
  {confirmLabel}
  {cancelLabel}
  variant={canonicalVariant}
  onConfirm={handleConfirm}
  onCancel={handleCancel}
/>
