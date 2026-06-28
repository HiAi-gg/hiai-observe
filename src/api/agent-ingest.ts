/**
 * Agent ingest API — accepts stats from remote lightweight monitoring agents.
 * POST /api/agent/ingest
 * Auth: X-API-Key header (same as other endpoints).
 */

import { Elysia, t } from "elysia";
import { internal } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import {
  insertContainerStats,
  insertGpuStats,
  insertHostStats,
  upsertHostInfo,
} from "../store/infra.js";
import { redis } from "../store/redis.js";

const hostStatsSchema = t.Object({
  cpu: t.Number(),
  memory: t.Number(),
  disk: t.Number(),
  load: t.Array(t.Number()),
  network: t.Object({ rx: t.Number(), tx: t.Number() }),
  // Per-core CPU usage (percent per logical core). Optional — older agents
  // may not report it.
  cores: t.Optional(t.Array(t.Number())),
});

const containerSchema = t.Object({
  id: t.String(),
  name: t.String(),
  cpu: t.Number(),
  memory: t.Number(),
  memoryLimit: t.Optional(t.Number()),
  memoryPercent: t.Optional(t.Number()),
  networkRx: t.Optional(t.Number()),
  networkTx: t.Optional(t.Number()),
  networkRxRate: t.Optional(t.Number()),
  networkTxRate: t.Optional(t.Number()),
  blockRead: t.Optional(t.Number()),
  blockWrite: t.Optional(t.Number()),
  status: t.Optional(t.String()),
  uptimeSeconds: t.Optional(t.Number()),
  restartCount: t.Optional(t.Number()),
  healthStatus: t.Optional(t.String()),
  image: t.Optional(t.String()),
});

const gpuSchema = t.Object({
  gpuIndex: t.Number(),
  utilizationPercent: t.Number(),
  memoryUsedMb: t.Number(),
  memoryTotalMb: t.Number(),
  temperatureC: t.Optional(t.Union([t.Number(), t.Null()])),
});

const hostInfoSchema = t.Object({
  os: t.Optional(t.String()),
  kernel: t.Optional(t.String()),
  cpuModel: t.Optional(t.String()),
  cores: t.Optional(t.Number()),
  arch: t.Optional(t.String()),
  uptime: t.Optional(t.Number()),
});

const ingestBodySchema = t.Object({
  hostId: t.String(),
  hostStats: hostStatsSchema,
  containers: t.Array(containerSchema),
  gpu: t.Optional(t.Array(gpuSchema)),
  hostInfo: t.Optional(hostInfoSchema),
});

// ── Per-host rate limit (60 req/min per hostId) ─────────────────────────
// Prevents a single misbehaving (or malicious) agent from saturating the
// ingest path. Backs onto Redis when available; falls back to a per-process
// sliding-window map if Redis is offline so we still have a hard ceiling.

const HOST_LIMIT_MAX = 60;
const HOST_LIMIT_WINDOW_MS = 60_000;
const HOST_LIMIT_KEY_PREFIX = "rl:agent:host:";
const HOST_LIMIT_FAIL_OPEN = true;

interface HostLimitResult {
  allowed: boolean;
  remaining: number;
  source: "redis" | "memory" | "fail-open";
}

interface MemoryBucket {
  /** Timestamps (ms) of recent requests, oldest first. */
  hits: number[];
}

const memoryBuckets = new Map<string, MemoryBucket>();

/** Evict entries that haven't been used in 2 windows — keeps the map bounded. */
function pruneMemoryBuckets(now: number): void {
  const cutoff = now - 2 * HOST_LIMIT_WINDOW_MS;
  for (const [key, bucket] of memoryBuckets) {
    const last = bucket.hits.at(-1);
    if (last === undefined || last < cutoff) {
      memoryBuckets.delete(key);
    }
  }
}

function checkHostLimitMemory(hostId: string, now: number): HostLimitResult {
  pruneMemoryBuckets(now);
  const windowStart = now - HOST_LIMIT_WINDOW_MS;
  let bucket = memoryBuckets.get(hostId);
  if (!bucket) {
    bucket = { hits: [] };
    memoryBuckets.set(hostId, bucket);
  }
  // Drop hits outside the window
  while (bucket.hits.length > 0) {
    const first = bucket.hits[0];
    if (first === undefined || first >= windowStart) break;
    bucket.hits.shift();
  }
  if (bucket.hits.length >= HOST_LIMIT_MAX) {
    return { allowed: false, remaining: 0, source: "memory" };
  }
  bucket.hits.push(now);
  return { allowed: true, remaining: HOST_LIMIT_MAX - bucket.hits.length, source: "memory" };
}

async function checkHostLimitRedis(hostId: string): Promise<HostLimitResult> {
  const key = `${HOST_LIMIT_KEY_PREFIX}${hostId}`;
  // INCR returns the post-increment value; set EXPIRE only on first hit
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.pexpire(key, HOST_LIMIT_WINDOW_MS);
  }
  if (count > HOST_LIMIT_MAX) {
    return { allowed: false, remaining: 0, source: "redis" };
  }
  return { allowed: true, remaining: Math.max(0, HOST_LIMIT_MAX - count), source: "redis" };
}

async function checkHostLimit(hostId: string): Promise<HostLimitResult> {
  try {
    return await checkHostLimitRedis(hostId);
  } catch (err) {
    // Redis unavailable — fall back to in-memory limiter so we still cap
    // the request rate. This is per-process; in a multi-instance deploy the
    // cap is the soft union, which is still strictly better than no cap.
    logger.debug("Agent ingest Redis limiter unavailable, using memory fallback", {
      hostId,
      error: String(err),
    });
    if (HOST_LIMIT_FAIL_OPEN) {
      return { ...checkHostLimitMemory(hostId, Date.now()), source: "fail-open" };
    }
    return checkHostLimitMemory(hostId, Date.now());
  }
}

export const agentIngestPlugin = new Elysia({ prefix: "/api/agent" }).post(
  "/ingest",
  async ({ body, set }) => {
    try {
      const { hostId, hostStats: hs, containers, gpu, hostInfo: info } = body;

      // Per-host rate limit (60 req/min) — see checkHostLimit above.
      const limit = await checkHostLimit(hostId);
      if (!limit.allowed) {
        set.status = 429;
        set.headers["Retry-After"] = String(Math.ceil(HOST_LIMIT_WINDOW_MS / 1000));
        set.headers["X-RateLimit-Limit"] = String(HOST_LIMIT_MAX);
        set.headers["X-RateLimit-Remaining"] = "0";
        return {
          error: "Too many requests for this host",
          retryAfter: Math.ceil(HOST_LIMIT_WINDOW_MS / 1000),
        };
      }
      set.headers["X-RateLimit-Limit"] = String(HOST_LIMIT_MAX);
      set.headers["X-RateLimit-Remaining"] = String(limit.remaining);

      // Store host stats
      await insertHostStats(
        {
          cpu_percent: hs.cpu,
          cpu_cores: hs.cores?.map((percent, core) => ({ core, percent })) ?? [],
          memory_used_mb: hs.memory,
          memory_total_mb: 0,
          memory_available_mb: 0,
          swap_used_mb: 0,
          swap_total_mb: 0,
          disk_used_gb: hs.disk,
          disk_total_gb: 0,
          disks: [],
          load_avg_1m: hs.load[0] ?? 0,
          load_avg_5m: hs.load[1] ?? 0,
          load_avg_15m: hs.load[2] ?? 0,
          network_rx_bytes: hs.network.rx,
          network_tx_bytes: hs.network.tx,
          top_processes: [],
        },
        hostId,
      );

      // Store container stats
      if (containers.length > 0) {
        await insertContainerStats(
          containers.map((c) => ({
            id: c.id,
            name: c.name,
            image: c.image ?? "unknown",
            cpu_percent: c.cpu,
            memory_usage_mb: c.memory,
            memory_limit_mb: c.memoryLimit ?? 0,
            memory_percent: c.memoryPercent ?? 0,
            network_rx_bytes: c.networkRx ?? 0,
            network_tx_bytes: c.networkTx ?? 0,
            network_rx_rate: c.networkRxRate ?? 0,
            network_tx_rate: c.networkTxRate ?? 0,
            block_read_bytes: c.blockRead ?? 0,
            block_write_bytes: c.blockWrite ?? 0,
            status: c.status ?? "running",
            uptime_seconds: c.uptimeSeconds ?? 0,
            restart_count: c.restartCount ?? 0,
            health_status: c.healthStatus ?? null,
          })),
          hostId,
        );
      }

      // Store GPU stats
      if (gpu && gpu.length > 0) {
        await insertGpuStats(
          gpu.map((g) => ({
            gpuIndex: g.gpuIndex,
            utilizationPercent: g.utilizationPercent,
            memoryUsedMb: g.memoryUsedMb,
            memoryTotalMb: g.memoryTotalMb,
            temperatureC: g.temperatureC ?? null,
          })),
          hostId,
        );
      }

      // Upsert host info
      if (info) {
        await upsertHostInfo({
          hostId,
          osName: info.os,
          kernelVersion: info.kernel,
          cpuModel: info.cpuModel,
          coreCount: info.cores,
          architecture: info.arch,
          uptimeSeconds: info.uptime,
        });
      }

      return { ok: true, hostId };
    } catch (err) {
      logger.error("Agent ingest failed", { error: String(err) });
      set.status = 500;
      return internal("Ingest failed");
    }
  },
  {
    body: ingestBodySchema,
  },
);
