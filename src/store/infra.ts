/**
 * Infrastructure monitoring data access layer.
 */

import { db } from "./db.js";
import { containerStats, hostStats } from "./schema.js";
import { desc, and, gte, lte, eq } from "drizzle-orm";
import type { ContainerStats } from "../monitoring/docker-collector.js";
import type { HostStats } from "../monitoring/host-collector.js";

export async function insertContainerStats(stats: ContainerStats[]): Promise<void> {
  if (stats.length === 0) return;
  await db.insert(containerStats).values(
    stats.map((s) => ({
      containerId: s.id,
      name: s.name,
      image: s.image,
      cpuPercent: s.cpu_percent,
      memoryUsageMb: s.memory_usage_mb,
      memoryLimitMb: s.memory_limit_mb,
      networkRxBytes: s.network_rx_bytes,
      networkTxBytes: s.network_tx_bytes,
      blockReadBytes: s.block_read_bytes,
      blockWriteBytes: s.block_write_bytes,
      status: s.status,
      uptimeSeconds: s.uptime_seconds,
    }))
  );
}

export async function insertHostStats(stats: HostStats): Promise<void> {
  await db.insert(hostStats).values({
    cpuPercent: stats.cpu_percent,
    memoryUsedMb: stats.memory_used_mb,
    memoryTotalMb: stats.memory_total_mb,
    memoryAvailableMb: stats.memory_available_mb,
    diskUsedGb: stats.disk_used_gb,
    diskTotalGb: stats.disk_total_gb,
    loadAvg1m: stats.load_avg_1m,
    loadAvg5m: stats.load_avg_5m,
    loadAvg15m: stats.load_avg_15m,
  });
}

export async function getContainerStatsByContainer(
  containerId: string,
  from: Date,
  to: Date
) {
  return db
    .select()
    .from(containerStats)
    .where(
      and(
        eq(containerStats.containerId, containerId),
        gte(containerStats.collectedAt, from),
        lte(containerStats.collectedAt, to)
      )
    )
    .orderBy(desc(containerStats.collectedAt));
}

export async function getHostStatsHistory(from: Date, to: Date) {
  return db
    .select()
    .from(hostStats)
    .where(
      and(
        gte(hostStats.collectedAt, from),
        lte(hostStats.collectedAt, to)
      )
    )
    .orderBy(desc(hostStats.collectedAt));
}

export async function getLatestContainerStats() {
  const latest = await db
    .select()
    .from(containerStats)
    .orderBy(desc(containerStats.collectedAt))
    .limit(1);

  if (latest.length === 0) return [];

  const latestTime = latest[0]!.collectedAt;
  return db
    .select()
    .from(containerStats)
    .where(eq(containerStats.collectedAt, latestTime));
}

export async function getLatestHostStats() {
  const rows = await db
    .select()
    .from(hostStats)
    .orderBy(desc(hostStats.collectedAt))
    .limit(1);
  return rows[0] ?? null;
}
