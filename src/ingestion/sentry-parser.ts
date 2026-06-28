import { logger } from "../lib/logger.js";

export interface StackFrame {
  filename: string;
  function: string;
  lineno?: number;
  colno?: number;
  absPath?: string;
  contextLine?: string;
  preContext?: string[];
  postContext?: string[];
  inApp: boolean;
}

export interface SentryEvent {
  event_id?: string;
  message?: string;
  exception?: {
    values?: Array<{
      type?: string;
      value?: string;
      stacktrace?: {
        frames?: Array<{
          filename?: string;
          function?: string;
          lineno?: number;
          colno?: number;
          abs_path?: string;
          context_line?: string;
          pre_context?: string[];
          post_context?: string[];
          in_app?: boolean;
        }>;
      };
    }>;
  };
  breadcrumbs?: {
    values?: Array<{
      type?: string;
      category?: string;
      message?: string;
      data?: Record<string, unknown>;
      timestamp?: number;
    }>;
  };
  user?: {
    id?: string;
    email?: string;
    username?: string;
    ip_address?: string;
  };
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
  sdk?: {
    name?: string;
    version?: string;
  };
  release?: string;
  environment?: string;
  timestamp?: number;
  level?: string;
  logger?: string;
  platform?: string;
  server_name?: string;
}

export interface ExceptionChainEntry {
  type: string;
  value: string;
  stacktrace: StackFrame[];
  mechanism?: string;
}

export interface ParsedEvent {
  eventId: string;
  message: string | null;
  type: string;
  exception: {
    type: string;
    value: string;
    stacktrace: StackFrame[];
  } | null;
  exceptionChain: ExceptionChainEntry[];
  fingerprint: string[] | null;
  breadcrumbs: Array<{
    type: string;
    category: string;
    message: string;
    data: Record<string, unknown> | null;
    timestamp: number | null;
  }>;
  user: {
    id: string | null;
    email: string | null;
    username: string | null;
    ipAddress: string | null;
  } | null;
  tags: Record<string, string>;
  sdk: { name: string; version: string } | null;
  release: string | null;
  environment: string | null;
  rawPayload: SentryEvent;
}

function mapFrames(frames: Array<Record<string, unknown>>): StackFrame[] {
  return frames.map((f) => ({
    filename: (f.filename as string) ?? "<unknown>",
    function: (f.function as string) ?? "<unknown>",
    lineno: f.lineno as number | undefined,
    colno: f.colno as number | undefined,
    absPath: f.abs_path as string | undefined,
    contextLine: f.context_line as string | undefined,
    preContext: f.pre_context as string[] | undefined,
    postContext: f.post_context as string[] | undefined,
    inApp: (f.in_app as boolean) ?? false,
  }));
}

function parseExceptionChain(event: SentryEvent): ExceptionChainEntry[] {
  const values = event.exception?.values ?? [];
  return values.map((exc) => ({
    type: exc.type ?? "Error",
    value: exc.value ?? "",
    stacktrace: exc.stacktrace?.frames ? mapFrames(exc.stacktrace.frames) : [],
    mechanism: undefined,
  }));
}

function parseException(event: SentryEvent): ParsedEvent["exception"] {
  const values = event.exception?.values ?? [];
  if (values.length === 0) return null;
  // Pick the LAST exception as primary (outermost, most relevant)
  const exc = values[values.length - 1]!;
  return {
    type: exc.type ?? "Error",
    value: exc.value ?? "",
    stacktrace: exc.stacktrace?.frames ? mapFrames(exc.stacktrace.frames) : [],
  };
}

function parseBreadcrumbs(event: SentryEvent): ParsedEvent["breadcrumbs"] {
  const crumbs = event.breadcrumbs?.values ?? [];
  return crumbs.map((c) => ({
    type: c.type ?? "default",
    category: c.category ?? "",
    message: c.message ?? "",
    data: (c.data as Record<string, unknown>) ?? null,
    timestamp: c.timestamp ?? null,
  }));
}

function buildMessage(event: SentryEvent): string | null {
  if (event.message) return event.message;
  const exc = event.exception?.values?.[0];
  if (exc?.type && exc?.value) return `${exc.type}: ${exc.value}`;
  return null;
}

export function parseSentryEvent(raw: SentryEvent): ParsedEvent {
  const eventId = raw.event_id ?? crypto.randomUUID().replace(/-/g, "");
  return {
    eventId,
    message: buildMessage(raw),
    type: raw.exception?.values ? "exception" : "message",
    exception: parseException(raw),
    exceptionChain: parseExceptionChain(raw),
    fingerprint: ((raw as Record<string, unknown>).fingerprint as string[]) ?? null,
    breadcrumbs: parseBreadcrumbs(raw),
    user: raw.user
      ? {
          id: raw.user.id ?? null,
          email: raw.user.email ?? null,
          username: raw.user.username ?? null,
          ipAddress: raw.user.ip_address ?? null,
        }
      : null,
    tags: raw.tags ?? {},
    sdk: raw.sdk?.name ? { name: raw.sdk.name, version: raw.sdk.version ?? "unknown" } : null,
    release: raw.release ?? null,
    environment: raw.environment ?? null,
    rawPayload: raw,
  };
}

/**
 * Parse Sentry envelope format (SDK v7+).
 * Envelope = header line + item header line + item payload (all JSON, newline-separated)
 */
export function parseSentryEnvelope(body: string): ParsedEvent[] {
  const lines = body.split("\n").filter((l) => l.trim());
  const events: ParsedEvent[] = [];
  let i = 0;

  // First line is envelope header
  const envelopeHeader = safeJson(lines[i] ?? "");
  i++;

  while (i < lines.length - 1) {
    const itemHeader = safeJson(lines[i] ?? "");
    i++;
    if (i >= lines.length) break;

    const payload = safeJson(lines[i] ?? "");
    i++;

    if (itemHeader?.type === "event" || itemHeader?.type === "transaction") {
      if (payload && typeof payload === "object") {
        const event = payload as SentryEvent;
        if (!event.event_id && envelopeHeader?.event_id) {
          event.event_id = envelopeHeader.event_id as string;
        }
        events.push(parseSentryEvent(event));
      }
    }
  }

  return events;
}

function safeJson(line: string): Record<string, unknown> | null {
  try {
    return JSON.parse(line) as Record<string, unknown>;
  } catch (err) {
    // Malformed envelope/header lines are common (clients sometimes send
    // blank separators or partial frames); null is the right sentinel for
    // the parser. Debug-log the failure so it's diagnosable in dev.
    logger.debug("safeJson: ignoring malformed JSON line", {
      preview: line.slice(0, 80),
      error: String(err),
    });
    return null;
  }
}
