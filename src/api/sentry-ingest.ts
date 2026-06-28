import { Elysia, t } from "elysia";
import { z } from "zod";
import { groupEvent } from "../ingestion/grouper.js";
import type { SentryEvent } from "../ingestion/sentry-parser.js";
import { parseSentryEnvelope, parseSentryEvent } from "../ingestion/sentry-parser.js";
import { lookupProject, resolveApiKey } from "../lib/auth.js";
import { db } from "../store/db.js";
import { events } from "../store/schema.js";

const MAX_BODY_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_CONTEXT_BYTES = 64 * 1024; // 64KB hard cap on stored per-event context jsonb
const MAX_BREADCRUMBS_STORED = 50;
const MAX_STACK_FRAMES_STORED = 50;
const MAX_TAG_VALUES = 50;
const MAX_TAG_KEY_LEN = 200;
const MAX_TAG_VAL_LEN = 500;
const MAX_USER_FIELDS = 4;
const MAX_USER_FIELD_LEN = 500;

const sentryEventSchema = z
  .object({})
  .passthrough()
  .refine((val) => Object.keys(val).length > 0, "Event body must not be empty");

/**
 * Build a small, sanitized context object for storage.
 *
 * The raw Sentry payload can be huge (huge stack frames, huge breadcrumbs,
 * huge user/extra blobs). Storing the whole payload in `events.context` is
 * an unbounded-storage DoS vector. We trim aggressively and then enforce a
 * hard byte cap on the resulting JSON.
 *
 * Triage-relevant fields kept: tags, extra, user, contexts, release,
 * environment, server_name, the last N breadcrumbs, and the last N stack
 * frames from the first exception value.
 */
function buildEventContext(
  parsed: ReturnType<typeof parseSentryEvent>,
): Record<string, unknown> | null {
  const raw = parsed.rawPayload ?? {};

  // Truncate tags: cap count, key length, value length, and value type
  const safeTags: Record<string, string> = {};
  let tagCount = 0;
  for (const [k, v] of Object.entries(parsed.tags ?? {})) {
    if (tagCount >= MAX_TAG_VALUES) break;
    if (typeof k !== "string" || k.length === 0 || k.length > MAX_TAG_KEY_LEN) continue;
    const sv = typeof v === "string" ? v : v == null ? "" : String(v);
    safeTags[k] = sv.length > MAX_TAG_VAL_LEN ? sv.slice(0, MAX_TAG_VAL_LEN) : sv;
    tagCount++;
  }

  // Cap user fields (PII) — keep only id/email/username/ip_address, length-bounded
  let safeUser: Record<string, string> | null = null;
  if (raw.user && typeof raw.user === "object") {
    const u = raw.user as Record<string, unknown>;
    const candidates: Array<[string, unknown]> = [
      ["id", u.id],
      ["email", u.email],
      ["username", u.username],
      ["ip_address", u.ip_address],
    ];
    const out: Record<string, string> = {};
    let n = 0;
    for (const [k, v] of candidates) {
      if (n >= MAX_USER_FIELDS) break;
      if (v == null) continue;
      const sv = typeof v === "string" ? v : String(v);
      out[k] = sv.length > MAX_USER_FIELD_LEN ? sv.slice(0, MAX_USER_FIELD_LEN) : sv;
      n++;
    }
    if (Object.keys(out).length > 0) safeUser = out;
  }

  // Keep last N breadcrumbs (most recent are most useful for triage)
  const crumbs = Array.isArray(raw.breadcrumbs?.values) ? raw.breadcrumbs.values : [];
  const trimmedCrumbs = crumbs.slice(-MAX_BREADCRUMBS_STORED).map((c) => ({
    type: typeof c?.type === "string" ? c.type : "default",
    category: typeof c?.category === "string" ? c.category : "",
    message: typeof c?.message === "string" ? c.message : "",
    timestamp: typeof c?.timestamp === "number" ? c.timestamp : null,
  }));

  // Keep last N stack frames from the first exception (most recent frame = origin)
  const firstExc = raw.exception?.values?.[0];
  const frames = Array.isArray(firstExc?.stacktrace?.frames) ? firstExc.stacktrace.frames : [];
  const trimmedFrames = frames.slice(-MAX_STACK_FRAMES_STORED).map((f) => ({
    filename: typeof f?.filename === "string" ? f.filename : "<unknown>",
    function: typeof f?.function === "string" ? f.function : "<unknown>",
    lineno: typeof f?.lineno === "number" ? f.lineno : undefined,
    colno: typeof f?.colno === "number" ? f.colno : undefined,
    in_app: typeof f?.in_app === "boolean" ? f.in_app : undefined,
  }));

  // Build the trimmed context. Only include non-empty sections.
  const context: Record<string, unknown> = {};
  if (Object.keys(safeTags).length > 0) context.tags = safeTags;
  if (safeUser) context.user = safeUser;
  if (raw.extra && typeof raw.extra === "object" && Object.keys(raw.extra as object).length > 0) {
    context.extra = raw.extra;
  }
  if (
    raw.contexts &&
    typeof raw.contexts === "object" &&
    Object.keys(raw.contexts as object).length > 0
  ) {
    context.contexts = raw.contexts;
  }
  if (typeof raw.release === "string") context.release = raw.release.slice(0, 200);
  if (typeof raw.environment === "string") context.environment = raw.environment.slice(0, 200);
  if (typeof raw.server_name === "string") context.server_name = raw.server_name.slice(0, 200);
  if (trimmedCrumbs.length > 0) context.breadcrumbs = trimmedCrumbs;
  if (trimmedFrames.length > 0) context.frames = trimmedFrames;

  if (Object.keys(context).length === 0) return null;

  // Hard byte cap: if serialized JSON still exceeds the cap, drop optional
  // sections in order (extra, contexts, breadcrumbs, frames) until it fits.
  const sections: Array<keyof typeof context> = [
    "extra",
    "contexts",
    "breadcrumbs",
    "frames",
    "user",
    "tags",
  ];
  let current: Record<string, unknown> = context;
  for (let i = 0; i <= sections.length; i++) {
    const serialized = JSON.stringify(current);
    if (serialized.length <= MAX_CONTEXT_BYTES) {
      return serialized.length > 0 ? current : null;
    }
    const nextSection = sections[i];
    if (nextSection && nextSection in current) {
      const copy: Record<string, unknown> = { ...current };
      delete copy[nextSection as string];
      current = copy;
    } else {
      break;
    }
  }

  // Still over cap — store nothing rather than blow the storage budget.
  return null;
}

async function authorizeProject(authHeader: string | undefined): Promise<string | null> {
  const parsed = resolveApiKey(authHeader);
  if (!parsed) return null;

  const project = await lookupProject(parsed.apiKey);
  return project?.projectId ?? null;
}

async function ingestEvent(projectId: string, parsed: ReturnType<typeof parseSentryEvent>) {
  const { issueId } = await groupEvent(projectId, parsed);

  await db.insert(events).values({
    issueId,
    projectId,
    message: parsed.message,
    exceptionType: parsed.exception?.type ?? null,
    stackTrace: parsed.exception?.stacktrace ? JSON.stringify(parsed.exception.stacktrace) : null,
    level: parsed.type === "exception" ? "error" : "info",
    tags: Object.keys(parsed.tags).length > 0 ? parsed.tags : null,
    context: buildEventContext(parsed),
    fingerprint: parsed.eventId,
    sdk: parsed.sdk ? `${parsed.sdk.name}@${parsed.sdk.version}` : null,
  });

  return { id: parsed.eventId };
}

export const sentryIngestPlugin = new Elysia({ prefix: "/api" })
  .post(
    "/:projectId/store",
    async ({ headers, body, params, set }) => {
      const authorizedProjectId = await authorizeProject(headers.authorization);
      if (!authorizedProjectId) {
        set.status = 401;
        return { error: "Invalid API key" };
      }

      // CRITICAL: ensure URL projectId matches the authenticated project
      if (authorizedProjectId !== params.projectId) {
        set.status = 403;
        return { error: "Project mismatch" };
      }

      // Body size guard (Elysia body parser already consumed, check serialized size)
      const rawStr = JSON.stringify(body);
      if (rawStr.length > MAX_BODY_BYTES) {
        set.status = 413;
        return { error: "Payload too large", detail: "Max size: 5MB" };
      }

      const result = sentryEventSchema.safeParse(body);
      if (!result.success) {
        set.status = 400;
        return { error: "Invalid event body", detail: JSON.stringify(result.error.issues) };
      }

      const raw = body as SentryEvent;
      const parsed = parseSentryEvent(raw);
      const insertResult = await ingestEvent(authorizedProjectId, parsed);

      return insertResult;
    },
    {
      params: t.Object({ projectId: t.String() }),
      body: t.Any(),
    },
  )
  .post(
    "/:projectId/envelope",
    async ({ headers, body, params, set }) => {
      const authorizedProjectId = await authorizeProject(headers.authorization);
      if (!authorizedProjectId) {
        set.status = 401;
        return { error: "Invalid API key" };
      }

      // CRITICAL: ensure URL projectId matches the authenticated project
      if (authorizedProjectId !== params.projectId) {
        set.status = 403;
        return { error: "Project mismatch" };
      }

      // Body size guard for envelope (string or binary)
      const bodySize = typeof body === "string" ? body.length : (body as Uint8Array).byteLength;
      if (bodySize > MAX_BODY_BYTES) {
        set.status = 413;
        return { error: "Payload too large", detail: "Max size: 5MB" };
      }

      const text = typeof body === "string" ? body : new TextDecoder().decode(body as Uint8Array);
      const parsedEvents = parseSentryEnvelope(text);

      if (parsedEvents.length === 0) {
        set.status = 400;
        return { error: "No valid events in envelope" };
      }

      const results = [];
      for (const parsed of parsedEvents) {
        const result = await ingestEvent(authorizedProjectId, parsed);
        results.push(result);
      }

      return results.length === 1 ? results[0] : results;
    },
    {
      params: t.Object({ projectId: t.String() }),
      body: t.Any(),
    },
  );
