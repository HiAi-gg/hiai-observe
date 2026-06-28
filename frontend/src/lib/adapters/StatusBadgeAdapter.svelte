<script lang="ts">
// StatusBadgeAdapter — wraps @hiai/ui StatusBadge, preserving local API.
//
// Local API (used by frontend):
//   status: "operational" | "degraded" | "down" | "unresolved" | "resolved"
//         | "ignored" | "up" | "ok" | "success" | "warning" | "error" | string
//   size:   "sm" | "md"
//
// Canonical @hiai/ui StatusBadge:
//   status: string  (with built-in map for active/suspended/pending/.../completed/cancelled)
//   size:   "sm" | "default" | "lg"
//
// Mapping: observability-specific names → canonical admin/billing names.
// The canonical name is used to look up the badge color in @hiai/ui, but
// the *displayed text* is the original status (so e.g. "ok" stays "ok"
// instead of being relabeled to the admin-billing term "active"). This
// matches what a user looking at a trace / issue / monitor would expect.
//
// Unknown statuses fall through to canonical's "pending" default color.
import { StatusBadge } from "@hiai/ui";

interface Props {
  status: string;
  size?: "sm" | "md";
}

let { status, size = "sm" }: Props = $props();

const statusMap: Record<string, string> = {
  operational: "active",
  up: "active",
  ok: "active",
  success: "active",
  resolved: "active",
  degraded: "pending",
  warning: "pending",
  down: "error",
  error: "error",
  unresolved: "error",
  ignored: "cancelled",
};

// Color lookup uses the mapped canonical name; the badge label shows the
// original status string (with a sensible capitalization for readability).
let canonicalStatus = $derived(statusMap[status] ?? status);
let canonicalSize: "sm" | "default" | "lg" = $derived(size === "md" ? "default" : "sm");
let displayStatus = $derived(status || "unknown");
</script>

<StatusBadge status={canonicalStatus} size={canonicalSize} label={displayStatus} />
