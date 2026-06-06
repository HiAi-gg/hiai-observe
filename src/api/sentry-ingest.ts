import { Elysia, t } from "elysia";
import { z } from "zod";
import { db } from "../store/db.js";
import { events } from "../store/schema.js";
import { resolveApiKey, lookupProject } from "../lib/auth.js";
import { parseSentryEvent, parseSentryEnvelope } from "../ingestion/sentry-parser.js";
import { groupEvent } from "../ingestion/grouper.js";
import type { SentryEvent } from "../ingestion/sentry-parser.js";

const MAX_BODY_BYTES = 5 * 1024 * 1024; // 5MB

const sentryEventSchema = z
  .object({})
  .passthrough()
  .refine((val) => Object.keys(val).length > 0, "Event body must not be empty");

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
    stackTrace: parsed.exception?.stacktrace
      ? JSON.stringify(parsed.exception.stacktrace)
      : null,
    level: parsed.type === "exception" ? "error" : "info",
    tags: Object.keys(parsed.tags).length > 0 ? parsed.tags : null,
    context: parsed.rawPayload as Record<string, unknown>,
    fingerprint: parsed.eventId,
    sdk: parsed.sdk ? `${parsed.sdk.name}@${parsed.sdk.version}` : null,
  });

  return { id: parsed.eventId };
}

export const sentryIngestPlugin = new Elysia({ prefix: "/api" })
  .post(
    "/:projectId/store",
    async ({ headers, body, set }) => {
      const authorizedProjectId = await authorizeProject(headers.authorization);
      if (!authorizedProjectId) {
        set.status = 401;
        return { error: "Invalid API key" };
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
    async ({ headers, body, set }) => {
      const authorizedProjectId = await authorizeProject(headers.authorization);
      if (!authorizedProjectId) {
        set.status = 401;
        return { error: "Invalid API key" };
      }

      // Body size guard for envelope (string or binary)
      const bodySize = typeof body === "string"
        ? body.length
        : (body as Uint8Array).byteLength;
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
