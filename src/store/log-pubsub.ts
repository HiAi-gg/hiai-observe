import { Redis } from "ioredis";
import { config } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import type { LogEntry } from "../monitoring/log-streamer.js";
import { redis } from "./redis.js";

const LOGS_CHANNEL_PREFIX = "logs:";
const LOGS_RECENT_PREFIX = "logs:recent:";
const LOGS_ALL_CHANNEL = "logs:*";
const MAX_RECENT_LOGS = 10_000;

// Redis requires a SEPARATE connection for subscribe — cannot reuse the shared client.
let subscriber: Redis | null = null;

function getSubscriber(): Redis {
  if (!subscriber) {
    subscriber = new Redis(config.REDIS_URL, { lazyConnect: true });
  }
  return subscriber;
}

/**
 * Publish a log entry to Redis channel `logs:{containerId}`.
 * Also stores in a Redis list for recent log retrieval.
 */
export async function publishLog(entry: LogEntry): Promise<void> {
  const payload = JSON.stringify(entry);

  try {
    await redis.publish(`${LOGS_CHANNEL_PREFIX}${entry.container_id}`, payload);
    await redis.publish(LOGS_ALL_CHANNEL, payload);

    // Store in recent list (trim to MAX_RECENT_LOGS)
    const key = `${LOGS_RECENT_PREFIX}${entry.container_id}`;
    await redis.lpush(key, payload);
    await redis.ltrim(key, 0, MAX_RECENT_LOGS - 1);
  } catch (err) {
    logger.error("[log-pubsub] Publish error", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Subscribe to logs for a specific container.
 * Returns unsubscribe function.
 */
export async function subscribeLogs(
  containerId: string,
  callback: (entry: LogEntry) => void,
): Promise<() => void> {
  const sub = getSubscriber();
  const channel = `${LOGS_CHANNEL_PREFIX}${containerId}`;

  const handler = (ch: string, message: string) => {
    if (ch === channel) {
      try {
        callback(JSON.parse(message));
      } catch {
        // ignore parse errors
      }
    }
  };

  sub.on("message", handler);
  await sub.subscribe(channel);

  return () => {
    sub.off("message", handler);
    sub.unsubscribe(channel);
  };
}

/**
 * Subscribe to all container logs via pattern subscription.
 * Returns unsubscribe function.
 */
export async function subscribeAllLogs(callback: (entry: LogEntry) => void): Promise<() => void> {
  const sub = getSubscriber();

  const handler = (_pattern: string, ch: string, message: string) => {
    if (ch === LOGS_ALL_CHANNEL) return; // skip the literal wildcard channel
    try {
      callback(JSON.parse(message));
    } catch {
      // ignore parse errors
    }
  };

  sub.on("pmessage", handler);
  await sub.psubscribe(LOGS_ALL_CHANNEL);

  return () => {
    sub.off("pmessage", handler);
    sub.punsubscribe(LOGS_ALL_CHANNEL);
  };
}

/**
 * Get recent logs from Redis for a container (last N entries).
 */
export async function getRecentLogs(containerId: string, count = 100): Promise<LogEntry[]> {
  const key = `${LOGS_RECENT_PREFIX}${containerId}`;
  const raw = await redis.lrange(key, 0, count - 1);

  return raw
    .map((r) => {
      try {
        return JSON.parse(r) as LogEntry;
      } catch {
        return null;
      }
    })
    .filter((e): e is LogEntry => e !== null);
}

/**
 * Get all container IDs that have recent logs in Redis.
 * Uses SCAN instead of KEYS for non-blocking iteration.
 */
export async function getLogContainerIds(): Promise<string[]> {
  const ids: string[] = [];
  let cursor = "0";
  const pattern = `${LOGS_RECENT_PREFIX}*`;

  do {
    const [nextCursor, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
    cursor = nextCursor;
    for (const k of keys) {
      ids.push(k.replace(LOGS_RECENT_PREFIX, ""));
    }
  } while (cursor !== "0");

  return ids;
}

/**
 * Cleanup: disconnect subscriber connection.
 * The shared redis client lifecycle is managed by redis.ts.
 */
export async function closePubSub(): Promise<void> {
  if (subscriber) {
    await subscriber.quit();
    subscriber = null;
  }
}
