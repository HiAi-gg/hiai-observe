import { getMonitors, insertCheck } from "../store/uptime.js";

const CHECK_TIMEOUT_MS = 10_000;
const TICK_INTERVAL_MS = 10_000; // Check every 10s which monitors are due

// Track next check time per monitor
const nextCheckAt = new Map<string, { nextAt: number; intervalSeconds: number }>();

async function runCheck(
  url: string
): Promise<{ statusCode: number | null; responseTimeMs: number; error: string | null; success: boolean }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  const start = Date.now();

  try {
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      redirect: "follow",
    });
    const responseTimeMs = Date.now() - start;
    clearTimeout(timeout);

    return {
      statusCode: res.status,
      responseTimeMs,
      error: null,
      success: res.status >= 200 && res.status < 400,
    };
  } catch (err: unknown) {
    clearTimeout(timeout);
    const message = err instanceof Error ? err.message : "Unknown error";
    return {
      statusCode: null,
      responseTimeMs: Date.now() - start,
      error: message,
      success: false,
    };
  }
}

async function tick() {
  const now = Date.now();

  try {
    // Refresh monitor list each tick to pick up new/removed monitors
    const monitors = await getMonitors();
    const activeMonitors = monitors.filter((m: { active: boolean }) => m.active);

    // Update schedule map with current monitors
    const activeIds = new Set(activeMonitors.map((m: { id: string }) => m.id));

    // Remove deleted/inactive monitors from schedule
    for (const id of nextCheckAt.keys()) {
      if (!activeIds.has(id)) {
        nextCheckAt.delete(id);
      }
    }

    // Add new monitors or update intervals
    for (const monitor of activeMonitors) {
      const existing = nextCheckAt.get(monitor.id);
      if (!existing) {
        // New monitor — schedule immediately
        nextCheckAt.set(monitor.id, {
          nextAt: now,
          intervalSeconds: monitor.intervalSeconds,
        });
      } else if (existing.intervalSeconds !== monitor.intervalSeconds) {
        // Interval changed — update
        existing.intervalSeconds = monitor.intervalSeconds;
      }
    }

    // Find monitors due for check
    const dueMonitors = activeMonitors.filter((m: { id: string }) => {
      const schedule = nextCheckAt.get(m.id);
      return schedule && now >= schedule.nextAt;
    });

    if (dueMonitors.length === 0) return;

    // Run checks in parallel
    await Promise.allSettled(
      dueMonitors.map(async (monitor: { id: string; url: string; intervalSeconds: number }) => {
        const result = await runCheck(monitor.url);
        await insertCheck({
          monitorId: monitor.id,
          ...result,
        });

        // Schedule next check
        const schedule = nextCheckAt.get(monitor.id);
        if (schedule) {
          schedule.nextAt = now + monitor.intervalSeconds * 1000;
        }
      })
    );
  } catch (err) {
    console.error("[uptime-worker] Tick error:", err);
  }
}

let running = false;
let timer: ReturnType<typeof setInterval> | null = null;

export function startUptimeWorker() {
  if (running) return;
  running = true;

  // Run immediately on start
  tick().catch(console.error);

  timer = setInterval(() => {
    tick().catch(console.error);
  }, TICK_INTERVAL_MS);

  console.log("[uptime-worker] Started — checking monitors per their intervals");
}

export function stopUptimeWorker() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  nextCheckAt.clear();
  running = false;
  console.log("[uptime-worker] Stopped");
}
