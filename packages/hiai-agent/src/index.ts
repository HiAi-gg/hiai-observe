/**
 * @hiai-observe/agent — lightweight host metrics collector for HiAi Observe.
 *
 * Reads CPU/memory/uptime from the local host via Bun.memoryUsage(),
 * process.uptime(), and /proc on Linux, then POSTs a snapshot to
 * `${OBSERVE_URL}/api/agent/ingest` every `INTERVAL` seconds.
 *
 * Configuration (env):
 *   OBSERVE_URL — base URL of the HiAi Observe server (default: http://localhost:8001)
 *   HOST_ID     — stable identifier for this host (default: os.hostname())
 *   INTERVAL    — seconds between reports (default: 30)
 *   API_KEY     — optional X-API-Key header value (otherwise auth is omitted)
 */

import os from "node:os";

// ── Config ──────────────────────────────────────────────────────────────────

const OBSERVE_URL = (process.env.OBSERVE_URL ?? "http://localhost:8001").replace(/\/+$/, "");
const HOST_ID = process.env.HOST_ID ?? os.hostname();
const INTERVAL = Math.max(1, Number.parseInt(process.env.INTERVAL ?? "30", 10) || 30);
const API_KEY = process.env.API_KEY ?? process.env.HIAI_OBSERVE_API_KEY ?? "";
const ENDPOINT = `${OBSERVE_URL}/api/agent/ingest`;

// ── Stat collection ─────────────────────────────────────────────────────────

interface ProcStat {
  idle: number;
  total: number;
}

const prevCpu: ProcStat = { idle: 0, total: 0 };

async function readCpuPercent(): Promise<number> {
  try {
    const content = await Bun.file("/proc/stat").text();
    const line = content.split("\n")[0] ?? "";
    const parts = line.split(/\s+/).slice(1).map(Number);
    const idle = (parts[3] ?? 0) + (parts[4] ?? 0);
    const total = parts.reduce((a, b) => a + b, 0);
    const diffIdle = idle - prevCpu.idle;
    const diffTotal = total - prevCpu.total;
    prevCpu.idle = idle;
    prevCpu.total = total;
    if (diffTotal <= 0) return 0;
    return Math.round((1 - diffIdle / diffTotal) * 10000) / 100;
  } catch {
    return 0;
  }
}

async function readLoadAvg(): Promise<[number, number, number]> {
  try {
    const content = await Bun.file("/proc/loadavg").text();
    const parts = content.trim().split(/\s+/);
    return [
      parseFloat(parts[0] ?? "0"),
      parseFloat(parts[1] ?? "0"),
      parseFloat(parts[2] ?? "0"),
    ];
  } catch {
    return [0, 0, 0];
  }
}

async function readDiskUsageGb(): Promise<number> {
  try {
    const proc = Bun.spawnSync(["df", "-B1", "/"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const lines = proc.stdout.toString().split("\n").slice(1);
    const firstLine = lines[0] ?? "";
    const parts = firstLine.trim().split(/\s+/);
    const usedBytes = parseInt(parts[2] ?? "0", 10);
    return Math.round((usedBytes / 1024 / 1024 / 1024) * 100) / 100;
  } catch {
    return 0;
  }
}

async function readNetworkBytes(): Promise<{ rx: number; tx: number }> {
  try {
    const content = await Bun.file("/proc/net/dev").text();
    let rx = 0;
    let tx = 0;
    for (const line of content.split("\n").slice(2)) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 10) continue;
      const iface = (parts[0] ?? "").replace(":", "");
      if (iface === "lo") continue;
      rx += parseInt(parts[1] ?? "0", 10);
      tx += parseInt(parts[9] ?? "0", 10);
    }
    return { rx, tx };
  } catch {
    return { rx: 0, tx: 0 };
  }
}

function memoryUsageMb(): number {
  const proc = process.memoryUsage();
  return Math.round((proc.rss / 1024 / 1024) * 100) / 100;
}

async function readKernelRelease(): Promise<string> {
  try {
    return (await Bun.file("/proc/sys/kernel/osrelease").text()).trim();
  } catch {
    return os.release();
  }
}

async function collectSnapshot(): Promise<Record<string, unknown>> {
  const [cpu, load, disk, net, kernel] = await Promise.all([
    readCpuPercent(),
    readLoadAvg(),
    readDiskUsageGb(),
    readNetworkBytes(),
    readKernelRelease(),
  ]);

  return {
    hostId: HOST_ID,
    hostStats: {
      cpu,
      memory: memoryUsageMb(),
      disk,
      load,
      network: net,
    },
    containers: [],
    hostInfo: {
      os: `${os.type()} ${os.release()}`,
      kernel,
      cpuModel: os.cpus()[0]?.model ?? "unknown",
      cores: os.cpus().length,
      arch: os.arch(),
      uptime: Math.round(process.uptime()),
    },
  };
}

// ── HTTP report loop ────────────────────────────────────────────────────────

interface ReportResult {
  ok: boolean;
  status: number;
  error?: string;
}

async function reportOnce(): Promise<ReportResult> {
  const body = await collectSnapshot();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (API_KEY) {
    headers["X-API-Key"] = API_KEY;
  }

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return { ok: false, status: response.status, error: text || response.statusText };
    }
    return { ok: true, status: response.status };
  } catch (err) {
    return { ok: false, status: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

function log(level: "info" | "warn" | "error", msg: string, extra?: Record<string, unknown>): void {
  const ts = new Date().toISOString();
  const tail = extra ? ` ${JSON.stringify(extra)}` : "";
  const line = `[${ts}] [${level.toUpperCase()}] [hiai-agent] ${msg}${tail}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

// ── Entry ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  log("info", "starting hiai-agent", {
    hostId: HOST_ID,
    endpoint: ENDPOINT,
    intervalSeconds: INTERVAL,
    pid: process.pid,
    bun: typeof Bun !== "undefined" ? Bun.version : "node",
  });

  let stopping = false;
  const shutdown = (signal: string) => {
    if (stopping) return;
    stopping = true;
    log("info", "received signal, shutting down", { signal });
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // Initial report immediately, then on interval.
  const tick = async () => {
    const result = await reportOnce();
    if (result.ok) {
      log("info", "reported host stats", { hostId: HOST_ID, status: result.status });
    } else {
      log("warn", "report failed", { hostId: HOST_ID, status: result.status, error: result.error });
    }
  };

  await tick();
  const handle = setInterval(() => {
    void tick();
  }, INTERVAL * 1000);
  // Don't keep the event loop alive on its own — only the interval timer.
  if (typeof handle.unref === "function") handle.unref();
}

if (import.meta.main) {
  main().catch((err) => {
    log("error", "fatal", { error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  });
}
