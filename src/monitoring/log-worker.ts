import { startLogStreamer, listContainers } from "./log-streamer.js";
import type { LogEntry } from "./log-streamer.js";
import { insertLogs } from "../store/logs.js";
import { publishLog } from "../store/log-pubsub.js";

let cleanup: (() => void) | null = null;

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

function onBatch(entries: LogEntry[]): void {
  if (entries.length === 0) return;

  // Insert to DB (fire-and-forget)
  insertLogs(
    entries.map((e) => ({
      containerId: e.container_id,
      containerName: e.container_name,
      stream: e.stream,
      message: e.message,
      timestamp: new Date(e.timestamp),
      level: detectLevel(e.message, e.stream),
    }))
  ).catch((err) => {
    console.error("[log-worker] DB insert error:", err);
  });

  // Publish to Redis for real-time WebSocket delivery (fire-and-forget)
  for (const entry of entries) {
    publishLog(entry).catch(() => {});
  }
}

export async function startLogWorker(): Promise<void> {
  if (cleanup) return;
  console.log("[log-worker] Starting — discovering containers...");

  try {
    const containers = await listContainers();
    const ids = containers.map((c) => c.id);
    const nameMap = new Map(containers.map((c) => [c.id, c.name]));
    console.log(`[log-worker] Streaming logs from ${ids.length} containers: ${containers.map((c) => c.name).join(", ")}`);
    cleanup = startLogStreamer(ids, onBatch, undefined, nameMap);
  } catch (err) {
    console.error("[log-worker] Failed to start:", err);
  }
}

export function stopLogWorker(): void {
  if (cleanup) {
    cleanup();
    cleanup = null;
    console.log("[log-worker] Stopped");
  }
}
