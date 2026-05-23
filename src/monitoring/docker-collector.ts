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
  network_rx_bytes: number;
  network_tx_bytes: number;
  block_read_bytes: number;
  block_write_bytes: number;
  status: string;
  uptime_seconds: number;
}

interface DockerContainer {
  Id: string;
  Names: string[];
  Image: string;
  State: string;
  Status: string;
  StartedAt: string;
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
  const socketPath = cfg.dockerSocket;
  return fetch(`http://localhost${path}`, {
    unix: socketPath,
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
    if (isNaN(start)) return 0;
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

        return {
          id: container.Id.slice(0, 12),
          name,
          image: container.Image,
          cpu_percent: calculateCpuPercent(stats),
          memory_usage_mb:
            Math.round(((stats.memory_stats.usage || 0) / 1024 / 1024) * 100) / 100,
          memory_limit_mb:
            Math.round(((stats.memory_stats.limit || 0) / 1024 / 1024) * 100) / 100,
          network_rx_bytes: net.rx,
          network_tx_bytes: net.tx,
          block_read_bytes: blk.read,
          block_write_bytes: blk.write,
          status: container.State,
          uptime_seconds: parseUptime(container.StartedAt),
        };
      } catch {
        return null;
      }
    })
  );

  return results.filter((r): r is ContainerStats => r !== null);
}
