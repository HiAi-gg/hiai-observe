import { getMonitoringConfig } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import { publishLog } from "../store/log-pubsub.js";
import { insertLogs } from "../store/logs.js";
import { recordWorkerRun } from "../workers/health.js";
import type { LogEntry } from "./log-streamer.js";
import { listContainers, startLogStreamer } from "./log-streamer.js";

let cleanup: (() => void) | null = null;

function filterContainers(
  containers: Array<{ id: string; name: string }>,
  filter: { include: string[]; exclude: string[] },
): Array<{ id: string; name: string }> {
  let result = containers;

  if (filter.include.length > 0) {
    result = result.filter((c) => filter.include.some((name) => c.name.includes(name)));
  }

  if (filter.exclude.length > 0) {
    result = result.filter((c) => !filter.exclude.some((name) => c.name.includes(name)));
  }

  return result;
}

const LEVEL_PATTERNS: Array<{ pattern: RegExp; level: string }> = [
  { pattern: /\bFATAL\b/i, level: "error" },
  { pattern: /\b(?:ERROR|ERR)\b/i, level: "error" },
  { pattern: /\[error\]/i, level: "error" },
  { pattern: /Error:/i, level: "error" },
  { pattern: /\bWARN(?:ING)?\b/i, level: "warn" },
  { pattern: /\[warn\]/i, level: "warn" },
  { pattern: /\bINFO\b/i, level: "info" },
  { pattern: /\[info\]/i, level: "info" },
  { pattern: /\bDEBUG\b/i, level: "debug" },
  { pattern: /\[debug\]/i, level: "debug" },
  { pattern: /\bTRACE\b/i, level: "debug" },
];

function detectLevel(message: string, stream: string): string {
  for (const { pattern, level } of LEVEL_PATTERNS) {
    if (pattern.test(message)) return level;
  }
  return stream === "stderr" ? "error" : "info";
}

let inFlightInserts = 0;

async function insertWithSemaphore(
  entries: Array<{
    containerId: string;
    containerName: string;
    stream: string;
    message: string;
    timestamp: Date;
    level: string;
  }>,
): Promise<void> {
  const config = getMonitoringConfig();
  const max = config.logMaxConcurrentInserts;

  if (max > 0) {
    while (inFlightInserts >= max) {
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  inFlightInserts++;
  try {
    await insertLogs(entries);
  } catch (err) {
    logger.error("[log-worker] DB insert error", { err: String(err) });
    await new Promise((r) => setTimeout(r, 100));
    try {
      await insertLogs(entries);
    } catch (err2) {
      logger.error("[log-worker] DB insert retry failed", { err: String(err2) });
    }
  } finally {
    inFlightInserts--;
  }
}

function onBatch(entries: LogEntry[]): void {
  if (entries.length === 0) return;

  insertWithSemaphore(
    entries.map((e) => ({
      containerId: e.container_id,
      containerName: e.container_name,
      stream: e.stream,
      message: e.message,
      timestamp: new Date(e.timestamp),
      level: detectLevel(e.message, e.stream),
    })),
  );

  for (const entry of entries) {
    publishLog(entry).catch(() => {});
  }

  recordWorkerRun("log");
}

export async function startLogWorker(): Promise<void> {
  if (cleanup) return;
  logger.info("[log-worker] Starting — discovering containers...");

  try {
    const containers = await listContainers();
    const config = getMonitoringConfig();
    const filtered = filterContainers(containers, config.logContainerFilter);
    const ids = filtered.map((c) => c.id);
    const nameMap = new Map(filtered.map((c) => [c.id, c.name]));
    if (filtered.length < containers.length) {
      logger.info("[log-worker] Filtered containers", {
        total: containers.length,
        streaming: filtered.length,
        excluded: containers.filter((c) => !filtered.some((f) => f.id === c.id)).map((c) => c.name),
      });
    }
    logger.info("[log-worker] Streaming from containers", {
      count: ids.length,
      names: filtered.map((c) => c.name).join(", "),
    });
    cleanup = startLogStreamer(ids, onBatch, undefined, nameMap);
    recordWorkerRun("log");
  } catch (err) {
    logger.error("[log-worker] Failed to start", { err: String(err) });
  }
}

export function stopLogWorker(): void {
  if (cleanup) {
    cleanup();
    cleanup = null;
    logger.info("[log-worker] Stopped");
  }
}
