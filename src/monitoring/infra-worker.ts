import { collectDockerStats } from "./docker-collector.js";
import { collectHostStats } from "./host-collector.js";
import { collectGpuStats } from "./gpu-collector.js";
import { db } from "../store/db.js";
import { containerStats, hostStats, gpuStats, hostInfo } from "../store/schema.js";
import { getConfig } from "./config.js";
import { recordWorkerRun } from "../workers/health.js";
import { logger } from "../lib/logger.js";

let intervalId: ReturnType<typeof setInterval> | null = null;

/** Collect local host info from /proc and os module. */
async function collectLocalHostInfo(): Promise<{
  hostId: string;
  osName: string;
  kernelVersion: string;
  cpuModel: string;
  coreCount: number;
  architecture: string;
  uptimeSeconds: number;
}> {
  const os = await import("node:os");
  let cpuModel = "unknown";
  try {
    const content = await Bun.file("/proc/cpuinfo").text();
    const match = content.match(/model name\s*:\s*(.+)/);
    if (match) cpuModel = match[1]!.trim();
  } catch {
    // fallback
    const cpus = os.cpus();
    if (cpus.length > 0) cpuModel = cpus[0]!.model;
  }

  return {
    hostId: "local",
    osName: `${os.type()} ${os.release()}`,
    kernelVersion: os.release(),
    cpuModel,
    coreCount: os.cpus().length,
    architecture: os.arch(),
    uptimeSeconds: Math.floor(os.uptime()),
  };
}

async function collectAndStore() {
  try {
    const [containers, host, gpu, localInfo] = await Promise.allSettled([
      collectDockerStats(),
      collectHostStats(),
      collectGpuStats(),
      collectLocalHostInfo(),
    ]);

    if (containers.status === "fulfilled" && containers.value.length > 0) {
      await db.insert(containerStats).values(
        containers.value.map((c) => ({
          hostId: "local",
          containerId: c.id,
          name: c.name,
          image: c.image,
          cpuPercent: c.cpu_percent,
          memoryUsageMb: c.memory_usage_mb,
          memoryLimitMb: c.memory_limit_mb,
          memoryPercent: c.memory_percent,
          networkRxBytes: c.network_rx_bytes,
          networkTxBytes: c.network_tx_bytes,
          networkRxRate: c.network_rx_rate,
          networkTxRate: c.network_tx_rate,
          blockReadBytes: c.block_read_bytes,
          blockWriteBytes: c.block_write_bytes,
          restartCount: c.restart_count,
          healthStatus: c.health_status,
          status: c.status,
          uptimeSeconds: c.uptime_seconds,
        })),
      );
    }

    if (host.status === "fulfilled") {
      await db.insert(hostStats).values({
        hostId: "local",
        cpuPercent: host.value.cpu_percent,
        memoryUsedMb: host.value.memory_used_mb,
        memoryTotalMb: host.value.memory_total_mb,
        memoryAvailableMb: host.value.memory_available_mb,
        diskUsedGb: host.value.disk_used_gb,
        diskTotalGb: host.value.disk_total_gb,
        loadAvg1m: host.value.load_avg_1m,
        loadAvg5m: host.value.load_avg_5m,
        loadAvg15m: host.value.load_avg_15m,
        networkRxBytes: host.value.network_rx_bytes,
        networkTxBytes: host.value.network_tx_bytes,
        topProcesses: host.value.top_processes.length > 0 ? host.value.top_processes : [],
      });
    }

    if (gpu.status === "fulfilled" && gpu.value.length > 0) {
      await db.insert(gpuStats).values(
        gpu.value.map((g) => ({
          hostId: "local",
          gpuIndex: g.gpuIndex,
          utilizationPercent: g.utilizationPercent,
          memoryUsedMb: g.memoryUsedMb,
          memoryTotalMb: g.memoryTotalMb,
          temperatureC: g.temperatureC,
        })),
      );
    }

    if (localInfo.status === "fulfilled") {
      const info = localInfo.value;
      await db
        .insert(hostInfo)
        .values({
          hostId: info.hostId,
          osName: info.osName,
          kernelVersion: info.kernelVersion,
          cpuModel: info.cpuModel,
          coreCount: info.coreCount,
          architecture: info.architecture,
          uptimeSeconds: info.uptimeSeconds,
        })
        .onConflictDoUpdate({
          target: hostInfo.hostId,
          set: {
            osName: info.osName,
            kernelVersion: info.kernelVersion,
            cpuModel: info.cpuModel,
            coreCount: info.coreCount,
            architecture: info.architecture,
            uptimeSeconds: info.uptimeSeconds,
            collectedAt: new Date(),
          },
        });
    }

    recordWorkerRun("infra");
  } catch (err) {
    logger.error("[infra-worker] Collection error", { err: String(err) });
  }
}

export function startInfraWorker(): void {
  if (intervalId) return;
  const config = getConfig();
  logger.info("[infra-worker] Started", { intervalSec: config.collectionIntervalMs / 1000 });
  collectAndStore();
  intervalId = setInterval(collectAndStore, config.collectionIntervalMs);
}

export function stopInfraWorker(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info("[infra-worker] Stopped");
  }
}
