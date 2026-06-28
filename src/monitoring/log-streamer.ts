import { randomUUID } from "node:crypto";
import { config, getMonitoringConfig } from "../lib/config.js";
import { logger } from "../lib/logger.js";

export interface LogEntry {
  id: string;
  container_id: string;
  container_name: string;
  stream: "stdout" | "stderr";
  message: string;
  timestamp: string;
}

type LogBatchCallback = (entries: LogEntry[]) => void;

const BATCH_INTERVAL_MS = 100;
const BATCH_MAX_SIZE = 50;

export class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private dropCount: number;
  private lastDropLog: number;

  constructor(
    private capacity: number,
    private refillRate: number,
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
    this.dropCount = 0;
    this.lastDropLog = 0;
  }

  consume(): boolean {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }

    this.dropCount++;
    if (now - this.lastDropLog >= 60_000) {
      logger.warn("[log-streamer] Rate limit exceeded, dropping logs", { dropped: this.dropCount });
      this.dropCount = 0;
      this.lastDropLog = now;
    }
    return false;
  }

  reset(): void {
    this.tokens = this.capacity;
    this.lastRefill = Date.now();
    this.dropCount = 0;
  }
}

/**
 * Parse a Docker multiplexed stream frame.
 * Format: [stream_type(1)] [0 0 0] [size(4 big-endian)] [payload]
 * Returns parsed stream type and payload string.
 */
export function parseDockerLogFrame(
  buffer: Buffer,
): { stream: "stdout" | "stderr"; payload: string } | null {
  if (buffer.length < 8) return null;

  const streamType = buffer[0];
  const size = buffer.readUInt32BE(4);

  if (buffer.length < 8 + size) return null;

  const payload = buffer.subarray(8, 8 + size).toString("utf-8");
  const stream = streamType === 1 ? "stdout" : "stderr";

  return { stream, payload };
}

/**
 * Parse raw Docker log lines (non-multiplexed mode, e.g. with timestamps).
 * Lines look like: 2026-05-22T10:00:00.123456789Z message here
 */
export function parseRawLogLine(line: string): {
  timestamp: string;
  message: string;
} {
  const timestampMatch = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)\s+(.*)$/);
  if (timestampMatch) {
    return { timestamp: timestampMatch[1]!, message: timestampMatch[2]! };
  }
  return { timestamp: new Date().toISOString(), message: line };
}

/**
 * Build fetch options for Docker API calls.
 * Supports both TCP (socket proxy) and unix socket modes.
 * The `unix` property is a Bun extension not in standard TS types.
 */
function dockerFetchOpts(
  dockerSocket: string,
  signal?: AbortSignal,
): { url: string; opts: RequestInit } {
  const cfg = getMonitoringConfig();
  if (cfg.dockerHost) {
    return {
      url: cfg.dockerHost,
      opts: signal ? { signal } : {},
    };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const unixOpts: any = { unix: dockerSocket };
  if (signal) unixOpts.signal = signal;
  return { url: "http://localhost", opts: unixOpts };
}

/**
 * Attach to a container's log stream via Docker Engine API.
 * Returns an abort controller to stop streaming.
 */
async function attachToContainerLogs(
  containerId: string,
  dockerSocket: string,
  onFrame: (entry: LogEntry) => void,
  containerNames?: Map<string, string>,
  canAccept?: () => boolean,
): Promise<AbortController> {
  const controller = new AbortController();

  const { url: baseUrl, opts } = dockerFetchOpts(dockerSocket, controller.signal);
  const url = `${baseUrl}${getMonitoringConfig().dockerApiPrefix}/containers/${containerId}/logs?follow=1&stdout=1&stderr=1&timestamps=1`;

  try {
    const response = await fetch(url, opts);

    if (!response.ok || !response.body) {
      logger.error(`[log-streamer] Failed to attach to ${containerId}: ${response.status}`);
      return controller;
    }

    const reader = response.body.getReader();
    const _decoder = new TextDecoder();
    let buffer = Buffer.alloc(0);

    const containerName = containerNames?.get(containerId) ?? containerId.substring(0, 12);

    const processBuffer = () => {
      while (buffer.length >= 8) {
        const frameSize = buffer.readUInt32BE(4);
        const totalSize = 8 + frameSize;
        if (buffer.length < totalSize) break;

        const frame = buffer.subarray(0, totalSize);
        buffer = buffer.subarray(totalSize);

        const parsed = parseDockerLogFrame(frame);
        if (parsed) {
          const { timestamp, message } = parseRawLogLine(parsed.payload);
          onFrame({
            id: randomUUID(),
            container_id: containerId,
            container_name: containerName,
            stream: parsed.stream,
            message,
            timestamp,
          });
        }
      }
    };

    const pump = async () => {
      try {
        while (true) {
          if (canAccept && !canAccept()) {
            await new Promise((r) => setTimeout(r, 50));
            continue;
          }
          const { done, value } = await reader.read();
          if (done) break;
          buffer = Buffer.concat([buffer, value]);
          processBuffer();
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name !== "AbortError") {
          logger.error(`[log-streamer] Stream error for ${containerId}: ${err.message}`);
        }
      }
    };

    pump();
  } catch (err: unknown) {
    if (err instanceof Error && err.name !== "AbortError") {
      logger.error(`[log-streamer] Connection error for ${containerId}: ${err.message}`);
    }
  }

  return controller;
}

/**
 * Start streaming logs from multiple containers.
 * Collects entries in a batch and flushes every BATCH_INTERVAL_MS or BATCH_MAX_SIZE.
 * Returns a cleanup function to stop all streams.
 */
export function startLogStreamer(
  containerIds: string[],
  onBatch: LogBatchCallback,
  dockerSocket = config.DOCKER_SOCKET,
  containerNames?: Map<string, string>,
): () => void {
  const monitoringCfg = getMonitoringConfig();
  const controllers: AbortController[] = [];
  const batch: LogEntry[] = [];
  const buckets = new Map<string, TokenBucket>();

  const maxLinesPerSec = monitoringCfg.logMaxLinesPerSec;

  const flush = () => {
    if (batch.length > 0) {
      const entries = batch.splice(0, batch.length);
      onBatch(entries);
    }
  };

  const interval = setInterval(flush, monitoringCfg.logBatchIntervalMs || BATCH_INTERVAL_MS);

  for (const containerId of containerIds) {
    const bucket = maxLinesPerSec > 0 ? new TokenBucket(maxLinesPerSec, maxLinesPerSec) : null;
    if (bucket) buckets.set(containerId, bucket);

    const canAccept = () => {
      return monitoringCfg.logMaxBufferSize <= 0 || batch.length < monitoringCfg.logMaxBufferSize;
    };

    attachToContainerLogs(
      containerId,
      dockerSocket,
      (entry) => {
        if (monitoringCfg.logSampleRate < 1.0 && Math.random() >= monitoringCfg.logSampleRate) {
          return;
        }
        if (bucket && !bucket.consume()) return;
        batch.push(entry);
        if (batch.length >= BATCH_MAX_SIZE) {
          flush();
        }
      },
      containerNames,
      canAccept,
    ).then((controller) => {
      controllers.push(controller);
    });
  }

  return () => {
    clearInterval(interval);
    flush();
    for (const controller of controllers) {
      controller.abort();
    }
  };
}

/**
 * List running containers via Docker Engine API.
 */
export async function listContainers(
  dockerSocket = config.DOCKER_SOCKET,
): Promise<Array<{ id: string; name: string }>> {
  try {
    const { url: baseUrl, opts } = dockerFetchOpts(dockerSocket);
    const response = await fetch(
      `${baseUrl}${getMonitoringConfig().dockerApiPrefix}/containers/json`,
      opts,
    );

    if (!response.ok) return [];

    const containers = (await response.json()) as Array<{
      Id: string;
      Names: string[];
    }>;

    return containers.map((c) => ({
      id: c.Id,
      name: c.Names?.[0]?.replace(/^\//, "") ?? c.Id.substring(0, 12),
    }));
  } catch {
    return [];
  }
}
