<script lang="ts">
  import type { LogEntry } from "$lib/api";

  let {
    logs = [],
    expanded = $bindable(new Set<string>()),
    levelColor,
    toggleJson,
    toggleStack,
    expandedJson,
    expandedStack,
    ansiToHtml,
  }: {
    logs: LogEntry[];
    expanded?: Set<string>;
    levelColor: (level: string) => string;
    toggleJson: (id: string) => void;
    toggleStack: (id: string) => void;
    expandedJson: Set<string>;
    expandedStack: Set<string>;
    ansiToHtml: (text: string) => string;
  } = $props();

  import { stripAnsi, isJson, isStackTrace, highlightJson } from "$lib/utils";

  interface ContainerGroup {
    name: string;
    entries: LogEntry[];
    errorCount: number;
    warnCount: number;
  }

  let groups = $derived.by(() => {
    const map = new Map<string, ContainerGroup>();
    for (const log of logs) {
      let g = map.get(log.container);
      if (!g) {
        g = { name: log.container, entries: [], errorCount: 0, warnCount: 0 };
        map.set(log.container, g);
      }
      g.entries.push(log);
      if (log.level === "error") g.errorCount++;
      if (log.level === "warn") g.warnCount++;
    }
    return Array.from(map.values()).sort((a, b) => b.entries.length - a.entries.length);
  });

  function toggleGroup(name: string) {
    const next = new Set(expanded);
    if (next.has(name)) next.delete(name); else next.add(name);
    expanded = next;
  }

  function levelBg(level: string) {
    if (level === "error") return "bg-[var(--color-danger-bg)]";
    if (level === "warn") return "bg-[var(--color-warning-bg)]";
    return "";
  }
</script>

<div class="space-y-1">
  {#each groups as g (g.name)}
    {@const isExpanded = expanded.has(g.name)}
    <div class="overflow-hidden rounded-lg border border-[var(--color-border)]">
      <button type="button"
        onclick={() => toggleGroup(g.name)}
        class="flex w-full items-center gap-3 bg-[var(--color-surface-raised)] px-3 py-2 text-left text-xs transition-colors hover:bg-[var(--color-surface-overlay)]"
      >
        <svg class="h-3 w-3 shrink-0 text-[var(--color-text-muted)] transition-transform {isExpanded ? 'rotate-90' : ''}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        <span class="font-medium text-[var(--color-text-secondary)]">{g.name}</span>
        <span class="text-[var(--color-text-muted)]">{g.entries.length.toLocaleString()}</span>
        {#if g.errorCount > 0}
          <span class="rounded-full bg-[var(--color-danger-bg)] px-1.5 text-[10px] font-semibold text-[var(--color-danger)]">{g.errorCount}</span>
        {/if}
        {#if g.warnCount > 0}
          <span class="rounded-full bg-[var(--color-warning-bg)] px-1.5 text-[10px] font-semibold text-[var(--color-warning)]">{g.warnCount}</span>
        {/if}
      </button>

      {#if isExpanded}
        <div class="max-h-96 overflow-y-auto">
          <table class="w-full font-mono text-xs">
            <tbody>
              {#each g.entries as log (log.id)}
                {@const isJsonMsg = isJson(stripAnsi(log.message))}
                {@const isStack = isStackTrace(stripAnsi(log.message))}
                <tr class="border-t border-[var(--color-border)] {levelBg(log.level)} align-top">
                  <td class="whitespace-nowrap px-3 py-1 text-[var(--color-text-muted)]">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </td>
                  <td class="whitespace-nowrap px-3 py-1 {levelColor(log.level)} font-semibold uppercase">
                    {log.level}
                  </td>
                  <td class="px-3 py-1 text-[var(--color-text-primary)] break-all">
                    {#if isJsonMsg}
                      {@const plainMsg = stripAnsi(log.message)}
                      <button type="button"
                        onclick={() => toggleJson(log.id)}
                        class="inline-flex items-center gap-1 text-[var(--color-accent)] hover:underline"
                      >
                        <span class="inline-block transition-transform {expandedJson.has(log.id) ? 'rotate-90' : ''}">&#9654;</span>
                        JSON
                      </button>
                      {#if expandedJson.has(log.id)}
                        <pre class="mt-1 overflow-x-auto rounded bg-[var(--color-surface-raised)] p-2 text-xs">{@html highlightJson(JSON.parse(plainMsg))}</pre>
                      {:else}
                        <span class="text-[var(--color-text-muted)]">{plainMsg.slice(0, 120)}{plainMsg.length > 120 ? "..." : ""}</span>
                      {/if}
                    {:else if isStack}
                      {@const plainMsg = stripAnsi(log.message)}
                      {@const lines = plainMsg.split("\n")}
                      <button type="button"
                        onclick={() => toggleStack(log.id)}
                        class="inline-flex items-center gap-1 text-[var(--color-warning)] hover:underline"
                      >
                        <span class="inline-block transition-transform {expandedStack.has(log.id) ? 'rotate-90' : ''}">&#9654;</span>
                        Stack trace ({lines.length} lines)
                      </button>
                      {#if expandedStack.has(log.id)}
                        <pre class="mt-1 overflow-x-auto rounded bg-[var(--color-surface-raised)] p-2 text-xs">{#each lines as line, i}<span class="{line.trimStart().startsWith('at ') ? 'text-[var(--color-danger)]' : 'text-[var(--color-text-secondary)]'}">{line}</span>{#if i < lines.length - 1}{"\n"}{/if}{/each}</pre>
                      {:else}
                        <span class="text-[var(--color-text-muted)]">{lines[0]?.slice(0, 120)}...</span>
                      {/if}
                    {:else}
                      {@html ansiToHtml(log.message)}
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>
  {/each}
</div>
