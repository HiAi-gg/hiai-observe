import { getMonitors, insertCheck } from "../store/uptime.js";

const CHECK_TIMEOUT_MS = 10_000;
const POLL_INTERVAL_MS = 30_000;

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
  } catch (err: any) {
    clearTimeout(timeout);
    return {
      statusCode: null,
      responseTimeMs: Date.now() - start,
      error: err?.message ?? "Unknown error",
      success: false,
    };
  }
}

async function pollMonitors() {
  const monitors = await getMonitors();
  const activeMonitors = monitors.filter((m: any) => m.active);

  await Promise.allSettled(
    activeMonitors.map(async (monitor: any) => {
      const result = await runCheck(monitor.url);
      await insertCheck({
        monitorId: monitor.id,
        ...result,
      });
    })
  );
}

let running = false;
let timer: ReturnType<typeof setInterval> | null = null;

export function startUptimeWorker() {
  if (running) return;
  running = true;

  // Run immediately on start
  pollMonitors().catch(console.error);

  timer = setInterval(() => {
    pollMonitors().catch(console.error);
  }, POLL_INTERVAL_MS);

  console.log("[uptime-worker] Started — polling every 30s");
}

export function stopUptimeWorker() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  running = false;
  console.log("[uptime-worker] Stopped");
}
