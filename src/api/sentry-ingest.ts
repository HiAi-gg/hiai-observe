import { Elysia, t } from "elysia";
import { db } from "../store/db.js";
import { projects, events } from "../store/schema.js";
import { eq } from "drizzle-orm";
import { parseSentryEvent, parseSentryEnvelope } from "../ingestion/sentry-parser.js";
import { groupEvent } from "../ingestion/grouper.js";
import type { SentryEvent } from "../ingestion/sentry-parser.js";

async function resolveApiKey(authHeader: string | undefined, projectId: string): Promise<boolean> {
  if (!authHeader) return false;

  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const project = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.apiKey, token))
      .limit(1);
    return project[0]?.id === projectId;
  }

  if (authHeader.startsWith("Basic ")) {
    const decoded = atob(authHeader.slice(6));
    const key = decoded.split(":")[0];
    if (!key) return false;
    const project = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.apiKey, key))
      .limit(1);
    return project[0]?.id === projectId;
  }

  if (authHeader.startsWith("Sentry ")) {
    const match = authHeader.match(/sentry_key="?([^",\s]+)/);
    if (match?.[1]) {
      const sentryKey = match[1];
      const project = await db
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.apiKey, sentryKey))
        .limit(1);
      return project[0]?.id === projectId;
    }
  }

  return false;
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
    async ({ params, headers, body, set }) => {
      const authorized = await resolveApiKey(headers.authorization, params.projectId);
      if (!authorized) {
        set.status = 401;
        return { error: "Invalid API key" };
      }

      const raw = body as SentryEvent;
      const parsed = parseSentryEvent(raw);
      const result = await ingestEvent(params.projectId, parsed);

      return result;
    },
    {
      params: t.Object({ projectId: t.String({ format: "uuid" }) }),
      body: t.Any(),
    },
  )
  .post(
    "/:projectId/envelope",
    async ({ params, headers, body, set }) => {
      const authorized = await resolveApiKey(headers.authorization, params.projectId);
      if (!authorized) {
        set.status = 401;
        return { error: "Invalid API key" };
      }

      const text = typeof body === "string" ? body : new TextDecoder().decode(body as Uint8Array);
      const parsedEvents = parseSentryEnvelope(text);

      if (parsedEvents.length === 0) {
        set.status = 400;
        return { error: "No valid events in envelope" };
      }

      const results = [];
      for (const parsed of parsedEvents) {
        const result = await ingestEvent(params.projectId, parsed);
        results.push(result);
      }

      return results.length === 1 ? results[0] : results;
    },
    {
      params: t.Object({ projectId: t.String({ format: "uuid" }) }),
      body: t.Any(),
    },
  );
