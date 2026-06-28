/**
 * External Health Pinger
 *
 * Periodically sends a GET request to HEALTH_PING_URL (e.g., Uptime Kuma,
 * Healthchecks.io, or any external monitoring endpoint) with a JSON payload
 * summarising local health status.
 *
 * Gracefully disabled when HEALTH_PING_URL is not set.
 */

import { config } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import { getWorkerHealth } from "../workers/health.js";

const PING_INTERVAL_MS = 60_000; // 60 seconds

let intervalId: ReturnType<typeof setInterval> | null = null;

function getMemoryStats(): { rssMb: number; heapUsedMb: number; heapTotalMb: number } {
  const mem = process.memoryUsage();
  return {
    rssMb: Math.round(mem.rss / 1024 / 1024),
    heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
    heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
  };
}

async function sendPing(): Promise<void> {
  const url = config.HEALTH_PING_URL;
  if (!url) return;

  const workers = getWorkerHealth();
  const allOk = Object.values(workers).every((w) => w.status === "ok" || w.status === "unknown");
  const memory = getMemoryStats();

  const payload = {
    status: allOk ? "ok" : "degraded",
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    memory,
    workers: Object.fromEntries(Object.entries(workers).map(([name, w]) => [name, w.status])),
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const res = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "hiai-observe/1.0",
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      logger.warn("Health ping: non-2xx response", { status: res.status, url });
    } else {
      logger.debug("Health ping: sent", { url, status: payload.status });
    }
  } catch (err) {
    logger.warn("Health ping: request failed", {
      url,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export function startHealthPinger(): void {
  const url = config.HEALTH_PING_URL;
  if (!url) {
    logger.info("Health pinger: disabled (HEALTH_PING_URL not set)");
    return;
  }

  if (intervalId) return;

  logger.info("Health pinger starting", { url, intervalSeconds: 60 });

  // Initial ping after 5s
  setTimeout(() => {
    sendPing().catch((err) =>
      logger.error("Health ping: initial send failed", { error: String(err) }),
    );
  }, 5_000);

  intervalId = setInterval(() => {
    sendPing().catch((err) => logger.error("Health ping: send failed", { error: String(err) }));
  }, PING_INTERVAL_MS);
}

export function stopHealthPinger(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info("Health pinger stopped");
  }
}
