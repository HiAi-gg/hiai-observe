import { getMonitors, insertCheck } from "../store/uptime.js";

const CHECK_TIMEOUT_MS = 10_000;
const TCP_TIMEOUT_MS = 5_000;
const TICK_INTERVAL_MS = 10_000;

// Track next check time per monitor
const nextCheckAt = new Map<string, { nextAt: number; intervalSeconds: number }>();

// Track monitor state for recovery detection
const monitorState = new Map<string, { wasDown: boolean; consecutiveFailures: number }>();

// ── HTTP Check ─────────────────────────────────────────────────────────────
async function runHttpCheck(
  url: string
): Promise<{ statusCode: number | null; responseTimeMs: number; error: string | null; success: boolean; certExpiry: Date | null }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  const start = Date.now();
  let certExpiry: Date | null = null;

  try {
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      redirect: "follow",
    });
    const responseTimeMs = Date.now() - start;
    clearTimeout(timeout);

    // Try to get TLS cert expiry for HTTPS URLs
    if (url.startsWith("https://")) {
      try {
        const urlObj = new URL(url);
        const conn = await Bun.connect({ hostname: urlObj.hostname, port: Number(urlObj.port) || 443, socket: {} });
        // Bun TLS cert extraction not directly available — skip for now
        conn.end();
      } catch {
        // TLS inspection not available in dev — skip silently
      }
    }

    return {
      statusCode: res.status,
      responseTimeMs,
      error: null,
      success: res.status >= 200 && res.status < 400,
      certExpiry,
    };
  } catch (err: unknown) {
    clearTimeout(timeout);
    const message = err instanceof Error ? err.message : "Unknown error";
    return {
      statusCode: null,
      responseTimeMs: Date.now() - start,
      error: message,
      success: false,
      certExpiry,
    };
  }
}

// ── TCP Check ──────────────────────────────────────────────────────────────
async function runTcpCheck(
  url: string
): Promise<{ statusCode: null; responseTimeMs: number; error: string | null; success: boolean; certExpiry: null }> {
  const start = Date.now();
  const urlObj = new URL(url);
  const host = urlObj.hostname;
  const port = Number(urlObj.port) || (urlObj.protocol === "https:" ? 443 : 80);

  try {
    const socket = await Bun.connect({
      hostname: host,
      port,
      socket: {
        data() {},
        error() {},
        open() {},
        close() {},
      },
    });
    const responseTimeMs = Date.now() - start;
    socket.end();

    return {
      statusCode: null,
      responseTimeMs,
      error: null,
      success: true,
      certExpiry: null,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Connection refused";
    return {
      statusCode: null,
      responseTimeMs: Date.now() - start,
      error: message,
      success: false,
      certExpiry: null,
    };
  }
}

// ── Main Tick ──────────────────────────────────────────────────────────────
async function tick() {
  const now = Date.now();

  try {
    const monitors = await getMonitors();
    const activeMonitors = monitors.filter((m: { active: boolean }) => m.active);
    const activeIds = new Set(activeMonitors.map((m: { id: string }) => m.id));

    // Clean up removed monitors
    for (const id of nextCheckAt.keys()) {
      if (!activeIds.has(id)) {
        nextCheckAt.delete(id);
        monitorState.delete(id);
      }
    }

    // Add new monitors or update intervals
    for (const monitor of activeMonitors) {
      const existing = nextCheckAt.get(monitor.id);
      if (!existing) {
        nextCheckAt.set(monitor.id, { nextAt: now, intervalSeconds: monitor.intervalSeconds });
      } else if (existing.intervalSeconds !== monitor.intervalSeconds) {
        existing.intervalSeconds = monitor.intervalSeconds;
      }
    }

    // Find monitors due for check
    const dueMonitors = activeMonitors.filter((m: { id: string }) => {
      const schedule = nextCheckAt.get(m.id);
      return schedule && now >= schedule.nextAt;
    });

    if (dueMonitors.length === 0) return;

    await Promise.allSettled(
      dueMonitors.map(async (monitor: { id: string; url: string; type?: string; intervalSeconds: number }) => {
        const isTcp = monitor.type === "tcp";
        const result = isTcp ? await runTcpCheck(monitor.url) : await runHttpCheck(monitor.url);

        await insertCheck({
          monitorId: monitor.id,
          statusCode: result.statusCode,
          responseTimeMs: result.responseTimeMs,
          error: result.error,
          success: result.success,
        });

        // Recovery detection
        const state = monitorState.get(monitor.id) ?? { wasDown: false, consecutiveFailures: 0 };
        if (result.success) {
          if (state.wasDown) {
            console.log(`[uptime-worker] RECOVERY: ${monitor.id} is back UP`);
            // TODO: fire recovery notification via alert system
          }
          state.wasDown = false;
          state.consecutiveFailures = 0;
        } else {
          state.consecutiveFailures++;
          if (state.consecutiveFailures >= 3) {
            state.wasDown = true;
          }
        }
        monitorState.set(monitor.id, state);

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
  tick().catch(console.error);
  timer = setInterval(() => { tick().catch(console.error); }, TICK_INTERVAL_MS);
  console.log("[uptime-worker] Started — checking monitors per their intervals");
}

export function stopUptimeWorker() {
  if (timer) { clearInterval(timer); timer = null; }
  nextCheckAt.clear();
  monitorState.clear();
  running = false;
  console.log("[uptime-worker] Stopped");
}
