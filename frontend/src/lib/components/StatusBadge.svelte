<script lang="ts">
  interface Props {
    status: "operational" | "degraded" | "down" | "unresolved" | "resolved" | "ignored" | string;
    size?: "sm" | "md";
  }

  let { status, size = "sm" }: Props = $props();

  const colorMap: Record<string, { bg: string; text: string; dot: string }> = {
    operational: { bg: "bg-emerald-900/40", text: "text-emerald-300", dot: "bg-emerald-400" },
    up: { bg: "bg-emerald-900/40", text: "text-emerald-300", dot: "bg-emerald-400" },
    ok: { bg: "bg-emerald-900/40", text: "text-emerald-300", dot: "bg-emerald-400" },
    success: { bg: "bg-emerald-900/40", text: "text-emerald-300", dot: "bg-emerald-400" },
    resolved: { bg: "bg-emerald-900/40", text: "text-emerald-300", dot: "bg-emerald-400" },
    degraded: { bg: "bg-amber-900/40", text: "text-amber-300", dot: "bg-amber-400" },
    warning: { bg: "bg-amber-900/40", text: "text-amber-300", dot: "bg-amber-400" },
    down: { bg: "bg-red-900/40", text: "text-red-300", dot: "bg-red-400" },
    error: { bg: "bg-red-900/40", text: "text-red-300", dot: "bg-red-400" },
    unresolved: { bg: "bg-red-900/40", text: "text-red-300", dot: "bg-red-400" },
    ignored: { bg: "bg-slate-800/60", text: "text-slate-400", dot: "bg-slate-500" },
  };

  const colors = $derived(colorMap[status] ?? colorMap.ignored);
  const sizeClass = $derived(size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm");
</script>

<span class="inline-flex items-center gap-1.5 rounded-full font-medium {colors.bg} {colors.text} {sizeClass}">
  <span class="h-1.5 w-1.5 rounded-full {colors.dot}"></span>
  {status}
</span>
