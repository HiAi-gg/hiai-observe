import { Elysia, t } from "elysia";
import { db, client } from "../store/db.js";
import { events, traces, logs, containerStats, hostStats, uptimeChecks, alertHistory, retentionConfig } from "../store/schema.js";
import { lt, sql, eq } from "drizzle-orm";
import { recordWorkerRun } from "./health.js";
import { logger } from "../lib/logger.js";

const DEFAULT_RETENTION_DAYS = Number(process.env.RETENTION_DAYS) || 30;
const BATCH_SIZE = 5000;

let intervalId: ReturnType<typeof setInterval> | null = null;

const TABLE_DEFS: Array<{ tableName: string; timeColumn: string }> = [
  { tableName: "events", timeColumn: "created_at" },
  { tableName: "traces", timeColumn: "start_time" },
  { tableName: "logs", timeColumn: "timestamp" },
  { tableName: "container_stats", timeColumn: "collected_at" },
  { tableName: "host_stats", timeColumn: "collected_at" },
  { tableName: "uptime_checks", timeColumn: "checked_at" },
  { tableName: "alert_history", timeColumn: "triggered_at" },
];

async function getRetentionDays(tableName: string): Promise<number> {
  const [config] = await db.select().from(retentionConfig).where(eq(retentionConfig.tableName, tableName)).limit(1);
  return config?.retentionDays ?? DEFAULT_RETENTION_DAYS;
}

async function batchDelete(tableName: string, timeColumn: string, cutoff: Date): Promise<number> {
  let totalDeleted = 0;
  while (true) {
    const result = await db.execute(
      sql`DELETE FROM ${sql.raw(tableName)} WHERE id IN (SELECT id FROM ${sql.raw(tableName)} WHERE ${sql.raw(timeColumn)} < ${cutoff.toISOString()} LIMIT ${BATCH_SIZE})`
    );
    const deleted = result.length;
    totalDeleted += deleted;
    if (deleted < BATCH_SIZE) break;
  }
  return totalDeleted;
}

async function cleanupOldData() {
  let totalCleaned = 0;
  for (const { tableName, timeColumn } of TABLE_DEFS) {
    try {
      const days = await getRetentionDays(tableName);
      const cutoff = new Date(Date.now() - days * 86400000);
      const deleted = await batchDelete(tableName, timeColumn, cutoff);
      if (deleted > 0) {
        logger.info(`Retention cleanup: ${tableName}`, { deleted, retentionDays: days });
      }
      totalCleaned += deleted;
    } catch (err) {
      logger.error(`Retention cleanup failed: ${tableName}`, { error: err instanceof Error ? err.message : String(err) });
    }
  }

  if (totalCleaned > 0) {
    logger.info("Retention cleanup complete", { totalDeleted: totalCleaned });
  } else {
    logger.debug("Retention cleanup: no old data to clean");
  }

  recordWorkerRun("retention");
}

export function startRetentionWorker(): void {
  if (intervalId) return;
  const intervalMs = 24 * 60 * 60 * 1000;
  logger.info("Retention worker starting", { intervalHours: 24, defaultRetentionDays: DEFAULT_RETENTION_DAYS });
  intervalId = setInterval(cleanupOldData, intervalMs);
}

export function stopRetentionWorker(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info("Retention worker stopped");
  }
}

function requireAdminKey(headers: Record<string, string | undefined>): { ok: true } | { ok: false; status: number; error: string } {
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) {
    return { ok: false, status: 403, error: "Admin API key not configured. Set ADMIN_API_KEY in .env" };
  }
  const auth = headers.authorization;
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : auth;
  if (!token) {
    return { ok: false, status: 401, error: "Missing admin API key" };
  }

  // Constant-time comparison to prevent timing attacks
  try {
    const tokenBuf = Buffer.from(token, "utf-8");
    const keyBuf = Buffer.from(adminKey, "utf-8");
    if (tokenBuf.length !== keyBuf.length || !crypto.timingSafeEqual(tokenBuf, keyBuf)) {
      return { ok: false, status: 401, error: "Invalid admin API key" };
    }
  } catch {
    return { ok: false, status: 401, error: "Invalid admin API key" };
  }

  return { ok: true };
}

export const adminRoutes = new Elysia({ prefix: "/api/admin" })
  .post("/cleanup", async ({ headers, set }) => {
    const check = requireAdminKey(headers as Record<string, string | undefined>);
    if (!check.ok) { set.status = check.status; return { error: check.error }; }
    await cleanupOldData();
    return { message: "Cleanup complete" };
  })
  .get("/retention", async ({ headers, set }) => {
    const check = requireAdminKey(headers as Record<string, string | undefined>);
    if (!check.ok) { set.status = check.status; return { error: check.error }; }
    const configs = await db.select().from(retentionConfig);
    const configMap = new Map(configs.map(c => [c.tableName, c.retentionDays]));
    return {
      defaultDays: DEFAULT_RETENTION_DAYS,
      tables: TABLE_DEFS.map(t => ({
        tableName: t.tableName,
        retentionDays: configMap.get(t.tableName) ?? DEFAULT_RETENTION_DAYS,
      })),
    };
  })
  .put("/retention/:table", async ({ params, body, headers, set }) => {
    const check = requireAdminKey(headers as Record<string, string | undefined>);
    if (!check.ok) { set.status = check.status; return { error: check.error }; }
    const validTable = TABLE_DEFS.find(t => t.tableName === params.table);
    if (!validTable) { set.status = 400; return { error: `Invalid table. Valid: ${TABLE_DEFS.map(t => t.tableName).join(", ")}` }; }
    const [existing] = await db.select().from(retentionConfig).where(eq(retentionConfig.tableName, params.table)).limit(1);
    if (existing) {
      await db.update(retentionConfig).set({ retentionDays: body.retentionDays, updatedAt: new Date() }).where(eq(retentionConfig.tableName, params.table));
    } else {
      await db.insert(retentionConfig).values({ tableName: params.table, retentionDays: body.retentionDays });
    }
    return { tableName: params.table, retentionDays: body.retentionDays };
  }, {
    params: t.Object({ table: t.String() }),
    body: t.Object({ retentionDays: t.Number({ minimum: 1 }) }),
  })
  .get("/storage", async ({ headers, set }) => {
    const check = requireAdminKey(headers as Record<string, string | undefined>);
    if (!check.ok) { set.status = check.status; return { error: check.error }; }

    const tableNames = TABLE_DEFS.map((t) => t.tableName);
    const sizes: Array<{ tableName: string; sizeBytes: number; sizeHuman: string }> = [];

    for (const tableName of tableNames) {
      try {
        const result = await client<{ size_bytes: number }[]>`
          SELECT pg_total_relation_size(${tableName})::bigint AS size_bytes
        `;
        const sizeBytes = Number(result[0]?.size_bytes ?? 0);
        sizes.push({
          tableName,
          sizeBytes,
          sizeHuman: formatBytes(sizeBytes),
        });
      } catch (err) {
        logger.error(`Storage query failed: ${tableName}`, { error: err instanceof Error ? err.message : String(err) });
        sizes.push({ tableName, sizeBytes: 0, sizeHuman: "unknown" });
      }
    }

    const totalBytes = sizes.reduce((sum, s) => sum + s.sizeBytes, 0);
    return {
      totalBytes,
      totalHuman: formatBytes(totalBytes),
      tables: sizes,
    };
  });

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(1)} ${units[i]}`;
}
