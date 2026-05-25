import { Elysia } from "elysia";
import { sql } from "drizzle-orm";
import { db } from "../store/db.js";
import { redis } from "../store/redis.js";
import { readFileSync } from "fs";
import { getWorkerHealth } from "../workers/health.js";

const startTime = Date.now();

let version = "0.1.0";
try {
  const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf-8"));
  version = pkg.version ?? "0.1.0";
} catch { /* use default */ }

let lastError: { message: string; timestamp: number } | null = null;

export function recordHealthError(message: string) {
  lastError = { message, timestamp: Date.now() };
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (mins > 0) parts.push(`${mins}m`);
  parts.push(`${secs}s`);
  return parts.join(" ");
}

async function checkPostgres(): Promise<"ok" | "error"> {
  try {
    await db.execute(sql`SELECT 1`);
    return "ok";
  } catch {
    return "error";
  }
}

async function checkRedis(): Promise<"ok" | "error"> {
  try {
    await redis.ping();
    return "ok";
  } catch {
    return "error";
  }
}

function checkDisk(): { status: "ok" | "degraded"; freeBytes: number } {
  try {
    const result = Bun.spawnSync(["df", "-B1", "/"]);
    const output = result.stdout.toString();
    const lines = output.trim().split("\n");
    if (lines.length >= 2) {
      const parts = lines[1]!.split(/\s+/);
      // df output: Filesystem 1B-blocks Used Available Use% Mounted
      const available = Number(parts[3]);
      if (!Number.isNaN(available)) {
        const ONE_GB = 1_073_741_824;
        return { status: available < ONE_GB ? "degraded" : "ok", freeBytes: available };
      }
    }
  } catch { /* ignore */ }
  return { status: "ok", freeBytes: -1 };
}

export const healthPlugin = new Elysia()
  .get("/health", async ({ set }) => {
    const [postgres, redisStatus] = await Promise.all([
      checkPostgres(),
      checkRedis(),
    ]);

    const disk = checkDisk();

    const allOk = postgres === "ok" && redisStatus === "ok" && disk.status === "ok";
    const anyOk = postgres === "ok" || redisStatus === "ok";

    const status = allOk ? "ok" : anyOk ? "degraded" : "error";
    if (!anyOk) set.status = 503;

    const mem = process.memoryUsage();
    const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);

    return {
      status,
      version,
      uptime: formatUptime(uptimeSeconds),
      uptimeSeconds,
      memory: {
        rss: `${Math.round(mem.rss / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(mem.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(mem.heapTotal / 1024 / 1024)}MB`,
        external: `${Math.round(mem.external / 1024 / 1024)}MB`,
      },
      diskFreeBytes: disk.freeBytes,
      dependencies: {
        postgres,
        redis: redisStatus,
        disk: disk.status,
      },
      workers: getWorkerHealth(),
      lastError: lastError ? {
        message: lastError.message,
        ago: formatUptime(Math.floor((Date.now() - lastError.timestamp) / 1000)),
      } : null,
    };
  });
