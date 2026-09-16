/**
 * Best-effort secret redaction for stored log lines.
 *
 * Applied at insert so every ingest path (OTLP, Docker streamer, tests)
 * stores the same scrubbed text. Patterns are conservative: ordinary
 * request logs must pass through unchanged.
 */

const REPLACEMENTS: Array<{ re: RegExp; to: string }> = [
  { re: /(authorization\s*[:=]\s*bearer\s+)\S+/gi, to: "$1[redacted]" },
  { re: /(\bbeare?r\s+)\S{8,}/gi, to: "$1[redacted]" },
  {
    re: /((?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis(?:s)?|amqp):\/\/[^:/?#\s]+:)([^@\s/]+)(@)/gi,
    to: "$1[redacted]$3",
  },
  {
    re: /(\b(?:password|passwd|pwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|private[_-]?key)\s*[:=]\s*)([^\s"'&]+)/gi,
    to: "$1[redacted]",
  },
  { re: /\bAKIA[0-9A-Z]{16}\b/g, to: "[redacted]" },
  { re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, to: "[redacted]" },
  { re: /\bho_[a-f0-9]{16,}\b/gi, to: "[redacted]" },
  { re: /\bsk[-_][A-Za-z0-9_-]{16,}\b/g, to: "[redacted]" },
];

export function redactSecrets(input: string): string {
  let out = input;
  for (const { re, to } of REPLACEMENTS) {
    out = out.replace(re, to);
  }
  return out;
}

export function redactDeep<T>(value: T): T {
  if (typeof value === "string") return redactSecrets(value) as T;
  if (Array.isArray(value)) return value.map((item) => redactDeep(item)) as T;
  if (value && typeof value === "object") {
    if (value instanceof Date) return value;
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      out[key] = redactDeep(nested);
    }
    return out as T;
  }
  return value;
}
