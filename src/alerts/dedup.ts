/**
 * Alert Deduplication via Redis
 *
 * Prevents duplicate alerts from firing within a cooldown window.
 * Uses Redis SET with TTL for efficient cooldown tracking.
 */

import { Redis } from "ioredis";

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      maxRetriesPerRequest: 3,
      retryStrategy(times: number) {
        return Math.min(times * 200, 2000);
      },
    });
  }
  return redis;
}

const KEY_PREFIX = "alert:cooldown";

/**
 * Check if an alert should fire (not in cooldown period).
 * Returns true if the alert is allowed to fire.
 */
export async function shouldFireAlert(alertId: string, cooldownSeconds = 300): Promise<boolean> {
  const client = getRedis();
  const key = `${KEY_PREFIX}:${alertId}`;
  // Atomic: SET NX + EX — returns "OK" only if key didn't exist (not in cooldown)
  const result = await client.set(key, "1", "EX", cooldownSeconds, "NX");
  return result === "OK";
}

/**
 * @deprecated Use shouldFireAlert(alertId, cooldownSeconds) which atomically checks and marks.
 */
export async function markAlertFired(
  alertId: string,
  cooldownSeconds: number
): Promise<void> {
  const client = getRedis();
  await client.set(`${KEY_PREFIX}:${alertId}`, "1", "EX", cooldownSeconds, "NX");
}

/**
 * Clear cooldown for a specific alert (e.g., for testing).
 */
export async function clearCooldown(alertId: string): Promise<void> {
  const client = getRedis();
  await client.del(`${KEY_PREFIX}:${alertId}`);
}

/**
 * Get remaining cooldown seconds for an alert.
 * Returns 0 if not in cooldown.
 */
export async function getRemainingCooldown(alertId: string): Promise<number> {
  const client = getRedis();
  const ttl = await client.ttl(`${KEY_PREFIX}:${alertId}`);
  return Math.max(ttl, 0);
}

/**
 * Close Redis connection (for graceful shutdown).
 */
export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}
