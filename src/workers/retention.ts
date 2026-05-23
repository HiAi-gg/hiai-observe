import { Elysia } from "elysia";
import { db } from "../store/db.js";
import { events, traces, logs, containerStats, hostStats, uptimeChecks, alertHistory } from "../store/schema.js";
import { lt } from "drizzle-orm";

const RETENTION_DAYS = Number(process.env.RETENTION_DAYS) || 30;

let intervalId: ReturnType<typeof setInterval> | null = null;

async function cleanupOldData() {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400000);
  console.log(`[retention] Cleaning data older than ${cutoff.toISOString()} (${RETENTION_DAYS} days)`);

  const results = await Promise.allSettled([
    db.delete(events).where(lt(events.createdAt, cutoff)),
    db.delete(traces).where(lt(traces.startTime, cutoff)),
    db.delete(logs).where(lt(logs.timestamp, cutoff)),
    db.delete(containerStats).where(lt(containerStats.collectedAt, cutoff)),
    db.delete(hostStats).where(lt(hostStats.collectedAt, cutoff)),
    db.delete(uptimeChecks).where(lt(uptimeChecks.checkedAt, cutoff)),
    db.delete(alertHistory).where(lt(alertHistory.triggeredAt, cutoff)),
  ]);

  const deleted = results.filter((r) => r.status === "fulfilled").length;
  console.log(`[retention] Cleaned ${deleted}/7 tables`);
}

export function startRetentionWorker(): void {
  if (intervalId) return;
  const intervalMs = 24 * 60 * 60 * 1000; // Daily
  console.log(`[retention] Started — cleaning every 24h, retention=${RETENTION_DAYS} days`);
  intervalId = setInterval(cleanupOldData, intervalMs);
}

export function stopRetentionWorker(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log("[retention] Stopped");
  }
}

function requireAdminKey(headers: Record<string, string | undefined>): { ok: true } | { ok: false; status: number; error: string } {
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) {
    return { ok: false, status: 403, error: "Admin API key not configured. Set ADMIN_API_KEY in .env" };
  }
  const auth = headers.authorization;
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : auth;
  if (token !== adminKey) {
    return { ok: false, status: 401, error: "Invalid admin API key" };
  }
  return { ok: true };
}

export const adminRoutes = new Elysia({ prefix: "/api/admin" })
  .post("/cleanup", async ({ headers, set }) => {
    const check = requireAdminKey(headers as Record<string, string | undefined>);
    if (!check.ok) {
      set.status = check.status;
      return { error: check.error };
    }
    await cleanupOldData();
    return { message: `Cleaned data older than ${RETENTION_DAYS} days` };
  })
  .get("/retention", ({ headers, set }) => {
    const check = requireAdminKey(headers as Record<string, string | undefined>);
    if (!check.ok) {
      set.status = check.status;
      return { error: check.error };
    }
    return { retentionDays: RETENTION_DAYS };
  });
