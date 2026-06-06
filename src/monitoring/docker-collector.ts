/**
 * Docker container stats collector.
 * Connects to Docker Engine API via unix socket.
 */

import { getConfig } from "./config.js";

export interface ContainerStats {
  id: string;
  name: string;
  image: string;
  cpu_percent: number;
  memory_usage_mb: number;
  memory_limit_mb: number;
  memory_percent: number;
  network_rx_bytes: number;
  network_tx_bytes: number;
  network_rx_rate: number; // bytes/sec
  network_tx_rate: number; // bytes/sec
  block_read_bytes: number;
  block_write_bytes: number;
  status: string;
  uptime_seconds: number;
  restart_count: number;
  health_status: string | null;
}

// Track previous network stats for rate calculation
const prevNetStats = new Map<string, { rx: number; tx: number; time: number }>();

interface DockerContainer {
  Id: string;
  Names: string[];
  Image: string;
  State: string;
  Status: string;
  StartedAt: string;
  RestartCount?: number;
}

interface DockerStats {
  cpu_stats: {
    cpu_usage: { total_usage: number };
    system_cpu_usage: number;
    online_cpus: number;
  };
  precpu_stats: {
    cpu_usage: { total_usage: number };
    system_cpu_usage: number;
  };
  memory_stats: {
    usage: number;
    limit: number;
  };
  networks?: Record<string, { rx_bytes: number; tx_bytes: number }>;
  blkio_stats?: {
    io_service_bytes_recursive?: Array<{ op: string; value: number }>;
  };
}

function dockerFetch(path: string): Promise<Response> {
  const cfg = getConfig();
  // TCP mode: connect via Docker socket proxy
  if (cfg.dockerHost) {
    return fetch(`${cfg.dockerHost}${path}`);
  }
  // Unix socket mode: direct socket connection
  return fetch(`http://localhost${path}`, {
    unix: cfg.dockerSocket,
  });
}

function calculateCpuPercent(stats: DockerStats): number {
  const cpuDelta =
    stats.cpu_stats.cpu_usage.total_usage -
    stats.precpu_stats.cpu_usage.total_usage;
  const systemDelta =
    stats.cpu_stats.system_cpu_usage -
    stats.precpu_stats.system_cpu_usage;
  const cpuCount = stats.cpu_stats.online_cpus || 1;
  if (systemDelta === 0) return 0;
  return Math.round((cpuDelta / systemDelta) * cpuCount * 10000) / 100;
}

function calculateNetworkIo(stats: DockerStats): { rx: number; tx: number } {
  let rx = 0;
  let tx = 0;
  if (stats.networks) {
    for (const iface of Object.values(stats.networks)) {
      rx += iface.rx_bytes;
      tx += iface.tx_bytes;
    }
  }
  return { rx, tx };
}

function calculateBlockIo(stats: DockerStats): { read: number; write: number } {
  let read = 0;
  let write = 0;
  const entries = stats.blkio_stats?.io_service_bytes_recursive;
  if (entries) {
    for (const entry of entries) {
      if (entry.op === "read") read += entry.value;
      if (entry.op === "write") write += entry.value;
    }
  }
  return { read, write };
}

function parseUptime(startedAt: string): number {
  try {
    const start = new Date(startedAt).getTime();
    if (Number.isNaN(start)) return 0;
    return Math.floor((Date.now() - start) / 1000);
  } catch {
    return 0;
  }
}

function matchesFilter(name: string): boolean {
  const cfg = getConfig();
  const { include, exclude } = cfg.containerFilter;
  if (exclude.length > 0 && exclude.some((p) => name.includes(p))) return false;
  if (include.length > 0 && !include.some((p) => name.includes(p))) return false;
  return true;
}

export async function collectDockerStats(): Promise<ContainerStats[]> {
  const containersRes = await dockerFetch("/v1.41/containers/json");
  if (!containersRes.ok) {
    throw new Error(`Docker API error: ${containersRes.status}`);
  }
  const containers = (await containersRes.json()) as DockerContainer[];

  const filtered = containers.filter((c) => {
    const name = (c.Names[0] || "").replace(/^\//, "");
    return matchesFilter(name);
  });

  const results = await Promise.all(
    filtered.map(async (container): Promise<ContainerStats | null> => {
      const name = (container.Names[0] || "").replace(/^\//, "");
      try {
        const statsRes = await dockerFetch(
          `/v1.41/containers/${container.Id}/stats?stream=false`
        );
        if (!statsRes.ok) return null;
        const stats = (await statsRes.json()) as DockerStats;

        const net = calculateNetworkIo(stats);
        const blk = calculateBlockIo(stats);

        const memUsageMb = Math.round(((stats.memory_stats.usage || 0) / 1024 / 1024) * 100) / 100;
        const memLimitMb = Math.round(((stats.memory_stats.limit || 0) / 1024 / 1024) * 100) / 100;
        const memPct = memLimitMb > 0 ? Math.round((memUsageMb / memLimitMb) * 10000) / 100 : 0;

        // Calculate network rates
        const containerId = container.Id.slice(0, 12);
        const now = Date.now();
        const prev = prevNetStats.get(containerId);
        let rxRate = 0;
        let txRate = 0;
        if (prev) {
          const timeDelta = (now - prev.time) / 1000; // seconds
          if (timeDelta > 0) {
            rxRate = Math.round(Math.max(0, (net.rx - prev.rx)) / timeDelta);
            txRate = Math.round(Math.max(0, (net.tx - prev.tx)) / timeDelta);
          }
        }
        prevNetStats.set(containerId, { rx: net.rx, tx: net.tx, time: now });

        return {
          id: containerId,
          name,
          image: container.Image,
          cpu_percent: calculateCpuPercent(stats),
          memory_usage_mb: memUsageMb,
          memory_limit_mb: memLimitMb,
          memory_percent: memPct,
          network_rx_bytes: net.rx,
          network_tx_bytes: net.tx,
          network_rx_rate: rxRate,
          network_tx_rate: txRate,
          block_read_bytes: blk.read,
          block_write_bytes: blk.write,
          status: container.State,
          uptime_seconds: parseUptime(container.StartedAt),
          restart_count: container.RestartCount ?? 0,
          health_status: null,
        };
      } catch {
        return null;
      }
    })
  );

  return results.filter((r): r is ContainerStats => r !== null);
}
