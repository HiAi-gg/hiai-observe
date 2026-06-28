export function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout>;
  return ((...args: unknown[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

export function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// Strip ANSI escape codes from log messages
export function stripAnsi(str: string): string {
  return str.replace(
    /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><~]/g,
    "",
  );
}

// Detect if a string is valid JSON
export function isJson(str: string): boolean {
  if (!str || typeof str !== "string") return false;
  const trimmed = str.trim();
  return (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  );
}

// Syntax-highlight a JSON value for HTML display
export function highlightJson(value: unknown, indent = 2): string {
  const json = JSON.stringify(value, null, indent);
  if (!json) return "";
  return (
    json
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      // Keys
      .replace(/"([^"]+)":/g, '<span class="text-[var(--primary)]">"$1"</span>:')
      // String values
      .replace(/: "([^"]*)"(,?)/g, ': <span class="text-[var(--success)]">"$1"</span>$2')
      // Numbers
      .replace(/: (\d+\.?\d*)(,?)/g, ': <span class="text-[var(--warning)]">$1</span>$2')
      // Booleans/null
      .replace(/: (true|false|null)(,?)/g, ': <span class="text-[var(--violet)]">$1</span>$2')
  );
}

// Detect stack trace lines
export function isStackTrace(message: string): boolean {
  const lines = message.split("\n");
  if (lines.length < 2) return false;
  const stackPatterns = [
    /^\s+at\s+/, // Node/Bun: "at functionName (file:line:col)"
    /^Traceback \(most recent/, // Python
    /^File "/, // Python file lines
    /^\s+File "/, // Python nested file lines
    /^\[ERROR\]/, // Generic error prefix with stack
  ];
  let matchCount = 0;
  for (const line of lines) {
    if (stackPatterns.some((p) => p.test(line))) matchCount++;
  }
  return matchCount >= 2;
}
