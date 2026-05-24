import { collectDockerStats } from "./docker-collector.js";
import { collectHostStats } from "./host-collector.js";
import { db } from "../store/db.js";
import { containerStats, hostStats } from "../store/schema.js";
import { getConfig } from "./config.js";

let intervalId: ReturnType<typeof setInterval> | null = null;

async function collectAndStore() {
  try {
    const [containers, host] = await Promise.allSettled([
      collectDockerStats(),
      collectHostStats(),
    ]);

    if (containers.status === "fulfilled" && containers.value.length > 0) {
      await db.insert(containerStats).values(
        containers.value.map((c) => ({
          containerId: c.id,
          name: c.name,
          image: c.image,
          cpuPercent: c.cpu_percent,
          memoryUsageMb: c.memory_usage_mb,
          memoryLimitMb: c.memory_limit_mb,
          memoryPercent: c.memory_percent,
          networkRxBytes: c.network_rx_bytes,
          networkTxBytes: c.network_tx_bytes,
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
      });
    }
  } catch (err) {
    console.error("[infra-worker] Collection error:", err);
  }
}

export function startInfraWorker(): void {
  if (intervalId) return;
  const config = getConfig();
  console.log(`[infra-worker] Started — collecting every ${config.collectionIntervalMs / 1000}s`);
  collectAndStore();
  intervalId = setInterval(collectAndStore, config.collectionIntervalMs);
}

export function stopInfraWorker(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log("[infra-worker] Stopped");
  }
}
