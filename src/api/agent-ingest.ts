/**
 * Agent ingest API — accepts stats from remote lightweight monitoring agents.
 * POST /api/agent/ingest
 * Auth: X-API-Key header (same as other endpoints).
 */

import { Elysia, t } from "elysia";
import { insertContainerStats, insertHostStats, insertGpuStats, upsertHostInfo } from "../store/infra.js";
import { logger } from "../lib/logger.js";
import { internal } from "../lib/errors.js";

const hostStatsSchema = t.Object({
  cpu: t.Number(),
  memory: t.Number(),
  disk: t.Number(),
  load: t.Array(t.Number()),
  network: t.Object({ rx: t.Number(), tx: t.Number() }),
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

export const agentIngestPlugin = new Elysia({ prefix: "/api/agent" })

  .post(
    "/ingest",
    async ({ body, set }) => {
      try {
        const { hostId, hostStats: hs, containers, gpu, hostInfo: info } = body;

        // Store host stats
        await insertHostStats(
          {
            cpu_percent: hs.cpu,
            cpu_cores: [],
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
    }
  );
