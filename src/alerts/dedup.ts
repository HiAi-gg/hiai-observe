/**
 * Alert Deduplication via Redis
 *
 * Prevents duplicate alerts from firing within a cooldown window.
 * Uses Redis SET with TTL for efficient cooldown tracking.
 */

import { redis } from "../store/redis.js";

const KEY_PREFIX = "alert:cooldown";

/**
 * Check if an alert should fire (not in cooldown period).
 * Returns true if the alert is allowed to fire.
 */
export async function shouldFireAlert(alertId: string, cooldownSeconds = 300): Promise<boolean> {
  const key = `${KEY_PREFIX}:${alertId}`;
  // Atomic: SET NX + EX — returns "OK" only if key didn't exist (not in cooldown)
  const result = await redis.set(key, "1", "EX", cooldownSeconds, "NX");
  return result === "OK";
}

/**
 * Clear cooldown for a specific alert (e.g., for testing).
 */
export async function clearCooldown(alertId: string): Promise<void> {
  await redis.del(`${KEY_PREFIX}:${alertId}`);
}

/**
 * Get remaining cooldown seconds for an alert.
 * Returns 0 if not in cooldown.
 */
export async function getRemainingCooldown(alertId: string): Promise<number> {
  const ttl = await redis.ttl(`${KEY_PREFIX}:${alertId}`);
  return Math.max(ttl, 0);
}
