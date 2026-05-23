import Redis from "ioredis";
import type { LogEntry } from "../monitoring/log-streamer.js";

const LOGS_CHANNEL_PREFIX = "logs:";
const LOGS_RECENT_PREFIX = "logs:recent:";
const LOGS_ALL_CHANNEL = "logs:*";
const MAX_RECENT_LOGS = 10_000;

let publisher: Redis | null = null;
let subscriber: Redis | null = null;

function getRedisUrl(): string {
  return process.env.REDIS_URL || "redis://localhost:6379";
}

function getPublisher(): Redis {
  if (!publisher) {
    publisher = new Redis(getRedisUrl(), { lazyConnect: true });
  }
  return publisher;
}

function getSubscriber(): Redis {
  if (!subscriber) {
    subscriber = new Redis(getRedisUrl(), { lazyConnect: true });
  }
  return subscriber;
}

/**
 * Publish a log entry to Redis channel `logs:{containerId}`.
 * Also stores in a Redis list for recent log retrieval.
 */
export async function publishLog(entry: LogEntry): Promise<void> {
  const pub = getPublisher();
  const payload = JSON.stringify(entry);

  try {
    await pub.publish(`${LOGS_CHANNEL_PREFIX}${entry.container_id}`, payload);
    await pub.publish(LOGS_ALL_CHANNEL, payload);

    // Store in recent list (trim to MAX_RECENT_LOGS)
    const key = `${LOGS_RECENT_PREFIX}${entry.container_id}`;
    await pub.lpush(key, payload);
    await pub.ltrim(key, 0, MAX_RECENT_LOGS - 1);
  } catch (err) {
    console.error("[log-pubsub] Publish error:", err);
  }
}

/**
 * Subscribe to logs for a specific container.
 * Returns unsubscribe function.
 */
export async function subscribeLogs(
  containerId: string,
  callback: (entry: LogEntry) => void
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
 * Subscribe to all container logs.
 * Returns unsubscribe function.
 */
export async function subscribeAllLogs(
  callback: (entry: LogEntry) => void
): Promise<() => void> {
  const sub = getSubscriber();

  const handler = (ch: string, message: string) => {
    if (ch === LOGS_ALL_CHANNEL) {
      try {
        callback(JSON.parse(message));
      } catch {
        // ignore parse errors
      }
    }
  };

  sub.on("message", handler);
  await sub.subscribe(LOGS_ALL_CHANNEL);

  return () => {
    sub.off("message", handler);
    sub.unsubscribe(LOGS_ALL_CHANNEL);
  };
}

/**
 * Get recent logs from Redis for a container (last N entries).
 */
export async function getRecentLogs(
  containerId: string,
  count = 100
): Promise<LogEntry[]> {
  const pub = getPublisher();
  const key = `${LOGS_RECENT_PREFIX}${containerId}`;
  const raw = await pub.lrange(key, 0, count - 1);

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
 */
export async function getLogContainerIds(): Promise<string[]> {
  const pub = getPublisher();
  const keys = await pub.keys(`${LOGS_RECENT_PREFIX}*`);
  return keys.map((k) => k.replace(LOGS_RECENT_PREFIX, ""));
}

/**
 * Cleanup: disconnect Redis connections.
 */
export async function closePubSub(): Promise<void> {
  if (publisher) {
    await publisher.quit();
    publisher = null;
  }
  if (subscriber) {
    await subscriber.quit();
    subscriber = null;
  }
}
