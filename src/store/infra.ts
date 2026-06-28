/**
 * Infrastructure monitoring data access layer.
 */

import { and, desc, eq, gte, lte, sql as sqlFn } from "drizzle-orm";
import type { ContainerStats } from "../monitoring/docker-collector.js";
import type { GpuStat } from "../monitoring/gpu-collector.js";
import type { HostStats } from "../monitoring/host-collector.js";
import { db } from "./db.js";
import { containerStats, gpuStats, hostInfo, hostStats } from "./schema.js";

export async function insertContainerStats(
  stats: ContainerStats[],
  hostId = "local",
): Promise<void> {
  if (stats.length === 0) return;
  await db.insert(containerStats).values(
    stats.map((s) => ({
      hostId,
      containerId: s.id,
      name: s.name,
      image: s.image,
      cpuPercent: s.cpu_percent,
      memoryUsageMb: s.memory_usage_mb,
      memoryLimitMb: s.memory_limit_mb,
      memoryPercent: s.memory_percent,
      networkRxBytes: s.network_rx_bytes,
      networkTxBytes: s.network_tx_bytes,
      networkRxRate: s.network_rx_rate,
      networkTxRate: s.network_tx_rate,
      blockReadBytes: s.block_read_bytes,
      blockWriteBytes: s.block_write_bytes,
      restartCount: s.restart_count,
      healthStatus: s.health_status,
      status: s.status,
      uptimeSeconds: s.uptime_seconds,
    })),
  );
}

export async function insertHostStats(stats: HostStats, hostId = "local"): Promise<void> {
  await db.insert(hostStats).values({
    hostId,
    cpuPercent: stats.cpu_percent,
    cpuCores: stats.cpu_cores.length > 0 ? stats.cpu_cores : null,
    memoryUsedMb: stats.memory_used_mb,
    memoryTotalMb: stats.memory_total_mb,
    memoryAvailableMb: stats.memory_available_mb,
    swapUsedMb: stats.swap_used_mb,
    swapTotalMb: stats.swap_total_mb,
    diskUsedGb: stats.disk_used_gb,
    diskTotalGb: stats.disk_total_gb,
    disks: stats.disks.length > 0 ? stats.disks : null,
    loadAvg1m: stats.load_avg_1m,
    loadAvg5m: stats.load_avg_5m,
    loadAvg15m: stats.load_avg_15m,
    networkRxBytes: stats.network_rx_bytes,
    networkTxBytes: stats.network_tx_bytes,
    topProcesses: stats.top_processes.length > 0 ? stats.top_processes : [],
  });
}

export async function insertGpuStats(stats: GpuStat[], hostId: string): Promise<void> {
  if (stats.length === 0) return;
  await db.insert(gpuStats).values(
    stats.map((g) => ({
      hostId,
      gpuIndex: g.gpuIndex,
      utilizationPercent: g.utilizationPercent,
      memoryUsedMb: g.memoryUsedMb,
      memoryTotalMb: g.memoryTotalMb,
      temperatureC: g.temperatureC,
    })),
  );
}

export async function upsertHostInfo(data: {
  hostId: string;
  osName?: string;
  kernelVersion?: string;
  cpuModel?: string;
  coreCount?: number;
  architecture?: string;
  uptimeSeconds?: number;
}): Promise<void> {
  await db
    .insert(hostInfo)
    .values({
      hostId: data.hostId,
      osName: data.osName ?? null,
      kernelVersion: data.kernelVersion ?? null,
      cpuModel: data.cpuModel ?? null,
      coreCount: data.coreCount ?? null,
      architecture: data.architecture ?? null,
      uptimeSeconds: data.uptimeSeconds ?? null,
    })
    .onConflictDoUpdate({
      target: hostInfo.hostId,
      set: {
        osName: data.osName ?? null,
        kernelVersion: data.kernelVersion ?? null,
        cpuModel: data.cpuModel ?? null,
        coreCount: data.coreCount ?? null,
        architecture: data.architecture ?? null,
        uptimeSeconds: data.uptimeSeconds ?? null,
        collectedAt: new Date(),
      },
    });
}

export async function getContainerStatsByContainer(
  containerId: string,
  from: Date,
  to: Date,
  hostId?: string,
) {
  const conditions = [
    eq(containerStats.containerId, containerId),
    gte(containerStats.collectedAt, from),
    lte(containerStats.collectedAt, to),
  ];
  if (hostId) conditions.push(eq(containerStats.hostId, hostId));

  return db
    .select()
    .from(containerStats)
    .where(and(...conditions))
    .orderBy(desc(containerStats.collectedAt));
}

export async function getHostStatsHistory(from: Date, to: Date, hostId?: string) {
  const conditions = [gte(hostStats.collectedAt, from), lte(hostStats.collectedAt, to)];
  if (hostId) conditions.push(eq(hostStats.hostId, hostId));

  return db
    .select()
    .from(hostStats)
    .where(and(...conditions))
    .orderBy(desc(hostStats.collectedAt));
}

export async function getLatestContainerStats(hostId?: string) {
  const latest = hostId
    ? await db
        .select()
        .from(containerStats)
        .where(eq(containerStats.hostId, hostId))
        .orderBy(desc(containerStats.collectedAt))
        .limit(1)
    : await db.select().from(containerStats).orderBy(desc(containerStats.collectedAt)).limit(1);

  if (latest.length === 0) return [];

  const latestTime = latest[0]!.collectedAt;
  const conditions = [eq(containerStats.collectedAt, latestTime)];
  if (hostId) conditions.push(eq(containerStats.hostId, hostId));

  return db
    .select()
    .from(containerStats)
    .where(and(...conditions));
}

export async function getLatestHostStats(hostId?: string) {
  const conditions = hostId ? [eq(hostStats.hostId, hostId)] : [];
  const rows = await db
    .select()
    .from(hostStats)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(hostStats.collectedAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function getContainerLogCounts(): Promise<Map<string, number>> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const { logs } = await import("./schema.js");

  const rows = await db
    .select({
      containerId: logs.containerId,
      count: sqlFn<number>`count(*)`.mapWith(Number),
    })
    .from(logs)
    .where(sqlFn`${logs.timestamp} >= ${since}`)
    .groupBy(logs.containerId);

  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.containerId, row.count);
  }
  return map;
}

/** List all known hosts (from host_info table). */
export async function listHosts() {
  return db.select().from(hostInfo).orderBy(hostInfo.hostId);
}

/** Get GPU stats history for a host. */
export async function getGpuStatsHistory(from: Date, to: Date, hostId?: string) {
  const conditions = [gte(gpuStats.collectedAt, from), lte(gpuStats.collectedAt, to)];
  if (hostId) conditions.push(eq(gpuStats.hostId, hostId));

  return db
    .select()
    .from(gpuStats)
    .where(and(...conditions))
    .orderBy(desc(gpuStats.collectedAt));
}

/** Get latest GPU stats per host. */
export async function getLatestGpuStats(hostId?: string) {
  const conditions = hostId ? [eq(gpuStats.hostId, hostId)] : [];
  const latest = await db
    .select()
    .from(gpuStats)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(gpuStats.collectedAt))
    .limit(1);

  if (latest.length === 0) return [];

  // Use >= (not =) on the timestamp: Postgres stores microseconds but the JS
  // Date we read back is truncated to milliseconds, so an equality match would
  // miss the row. >= returns the latest collection batch (all GPUs share it).
  const latestTime = latest[0]!.collectedAt;
  const timeConditions = [gte(gpuStats.collectedAt, latestTime)];
  if (hostId) timeConditions.push(eq(gpuStats.hostId, hostId));

  return db
    .select()
    .from(gpuStats)
    .where(and(...timeConditions));
}
