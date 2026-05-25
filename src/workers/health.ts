/**
 * Worker health tracking.
 *
 * Each worker calls `recordWorkerRun(name)` after every cycle.
 * The health endpoint reads status via `getWorkerHealth()`.
 */

export interface WorkerStatus {
  lastRunAt: number; // epoch ms
  status: "ok" | "stale" | "unknown";
}

const heartbeats = new Map<string, number>();

/** Interval thresholds per worker (ms). A worker is "stale" if overdue by 2x. */
const INTERVALS: Record<string, number> = {
  uptime:    10_000,   // TICK_INTERVAL_MS in uptime-worker
  alert:     60_000,   // EVALUATION_INTERVAL_MS in alerts/worker
  infra:     30_000,   // default COLLECTION_INTERVAL_MS
  log:       15_000,   // streamer flush cadence (approximate)
  retention:  86_400_000, // 24h
  maintenance: 691_200_000, // 8 days (7-day cycle + 1 day grace)
};

/** Record that a worker completed a cycle. */
export function recordWorkerRun(name: string): void {
  heartbeats.set(name, Date.now());
}

/** Read current health for all known workers. */
export function getWorkerHealth(): Record<string, WorkerStatus> {
  const now = Date.now();
  const result: Record<string, WorkerStatus> = {};

  for (const [name, interval] of Object.entries(INTERVALS)) {
    const lastRunAt = heartbeats.get(name);
    if (lastRunAt === undefined) {
      result[name] = { lastRunAt: 0, status: "unknown" };
    } else {
      const age = now - lastRunAt;
      result[name] = {
        lastRunAt,
        status: age <= interval * 2 ? "ok" : "stale",
      };
    }
  }

  return result;
}
