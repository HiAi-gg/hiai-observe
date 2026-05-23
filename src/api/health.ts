import { Elysia } from "elysia";
import { sql } from "drizzle-orm";
import { db } from "../store/db.js";
import { redis } from "../store/redis.js";

const startTime = Date.now();
const version = "0.1.0";

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

export const healthPlugin = new Elysia()
  .get("/health", async ({ set }) => {
    const [postgres, redisStatus] = await Promise.all([
      checkPostgres(),
      checkRedis(),
    ]);

    const allOk = postgres === "ok" && redisStatus === "ok";
    const anyOk = postgres === "ok" || redisStatus === "ok";

    const status = allOk ? "ok" : anyOk ? "degraded" : "error";
    if (!anyOk) set.status = 503;

    return {
      status,
      version,
      uptime: Math.floor((Date.now() - startTime) / 1000),
      dependencies: {
        postgres,
        redis: redisStatus,
      },
    };
  });
