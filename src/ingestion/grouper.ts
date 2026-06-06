import { db } from "../store/db.js";
import { issues } from "../store/schema.js";
import { eq, and, sql } from "drizzle-orm";
import type { ParsedEvent } from "./sentry-parser.js";

/**
 * Build a fingerprint for issue grouping.
 * Groups by: exception type + first in-app stack frame function + first in-app stack frame filename.
 * Falls back to message-based fingerprint if no exception.
 */
export function buildFingerprint(event: ParsedEvent): string {
  // If the SDK sent a custom fingerprint, use it directly
  if (event.fingerprint && event.fingerprint.length > 0) {
    return event.fingerprint.join("::");
  }

  if (event.exception) {
    const inAppFrame = event.exception.stacktrace.find((f) => f.inApp);
    const frame = inAppFrame ?? event.exception.stacktrace[0];
    if (frame) {
      return [event.exception.type, frame.function, frame.filename].join("::");
    }
    return event.exception.type;
  }
  return `message::${event.message ?? "unknown"}`;
}

function buildTitle(event: ParsedEvent): string {
  if (event.exception) {
    const value = event.exception.value.length > 120
      ? `${event.exception.value.slice(0, 120)}…`
      : event.exception.value;
    return `${event.exception.type}: ${value}`;
  }
  const msg = event.message ?? "Unknown error";
  return msg.length > 140 ? `${msg.slice(0, 140)}…` : msg;
}

/**
 * Find or create an issue by fingerprint. Returns issue_id.
 * Uses a transaction with FOR UPDATE to prevent race conditions on concurrent inserts.
 */
export async function groupEvent(
  projectId: string,
  event: ParsedEvent,
): Promise<{ issueId: string; isNew: boolean }> {
  const fingerprint = buildFingerprint(event);

  return db.transaction(async (tx) => {
    // Lock the row if it exists to prevent concurrent duplicate inserts
    const [existing] = await tx
      .select({ id: issues.id })
      .from(issues)
      .where(and(eq(issues.projectId, projectId), eq(issues.fingerprint, fingerprint)))
      .limit(1)
      .for("update");

    if (existing) {
      await tx
        .update(issues)
        .set({
          count: sql`${issues.count} + 1`,
          lastSeen: new Date(),
          metadata: {
            lastMessage: event.message,
            lastEnvironment: event.environment,
          },
        })
        .where(eq(issues.id, existing.id));

      return { issueId: existing.id, isNew: false };
    }

    const title = buildTitle(event);

    const [inserted] = await tx
      .insert(issues)
      .values({
        projectId,
        title,
        type: event.type,
        fingerprint,
        status: "unresolved",
        count: 1,
        metadata: {
          lastMessage: event.message,
          lastEnvironment: event.environment,
        },
      })
      .returning({ id: issues.id });

    return { issueId: inserted!.id, isNew: true };
  });
}
