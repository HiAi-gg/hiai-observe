/**
 * Host resource stats collector.
 * Reads from /proc on Linux, falls back to system commands.
 */

export interface CpuCoreStats {
  core: number;
  percent: number;
}

export interface DiskPartitionStats {
  mount: string;
  usedGb: number;
  totalGb: number;
}

export interface HostStats {
  cpu_percent: number;
  cpu_cores: CpuCoreStats[];
  memory_used_mb: number;
  memory_total_mb: number;
  memory_available_mb: number;
  swap_used_mb: number;
  swap_total_mb: number;
  disk_used_gb: number;
  disk_total_gb: number;
  disks: DiskPartitionStats[];
  load_avg_1m: number;
  load_avg_5m: number;
  load_avg_15m: number;
  network_rx_bytes: number;
  network_tx_bytes: number;
}

// Track per-core CPU deltas
const prevCpuIdle: Record<string, number> = {};
const prevCpuTotal: Record<string, number> = {};

async function readCpuPercent(): Promise<{ total: number; cores: CpuCoreStats[] }> {
  try {
    const content = await Bun.file("/proc/stat").text();
    const lines = content.split("\n");
    const cores: CpuCoreStats[] = [];
    let totalPercent = 0;

    for (const line of lines) {
      const match = line.match(/^(cpu\d*)\s+(.+)/);
      if (!match) continue;

      const cpuId = match[1]!;
      const parts = match[2]!.split(/\s+/).map(Number);
      const idle = (parts[3] ?? 0) + (parts[4] ?? 0);
      const total = parts.reduce((a, b) => a + b, 0);

      const prevIdle = prevCpuIdle[cpuId] ?? 0;
      const prevTotal = prevCpuTotal[cpuId] ?? 0;
      const diffIdle = idle - prevIdle;
      const diffTotal = total - prevTotal;

      prevCpuIdle[cpuId] = idle;
      prevCpuTotal[cpuId] = total;

      if (diffTotal === 0) continue;
      const percent = Math.round((1 - diffIdle / diffTotal) * 10000) / 100;

      if (cpuId === "cpu") {
        totalPercent = percent;
      } else {
        const coreNum = parseInt(cpuId.replace("cpu", ""), 10);
        cores.push({ core: coreNum, percent });
      }
    }

    return { total: totalPercent, cores };
  } catch {
    return { total: 0, cores: [] };
  }
}

async function readMemory(): Promise<{
  used: number;
  total: number;
  available: number;
  swapUsed: number;
  swapTotal: number;
}> {
  try {
    const content = await Bun.file("/proc/meminfo").text();
    const values: Record<string, number> = {};
    for (const line of content.split("\n")) {
      const match = line.match(/^(\w+):\s+(\d+)/);
      if (match) {
        values[match[1]!] = parseInt(match[2]!, 10); // in kB
      }
    }
    const total = (values.MemTotal || 0) / 1024;
    const available = (values.MemAvailable || values.MemFree || 0) / 1024;
    const used = total - available;
    const swapTotal = (values.SwapTotal || 0) / 1024;
    const swapFree = (values.SwapFree || 0) / 1024;
    const swapUsed = swapTotal - swapFree;
    return { used, total, available, swapUsed, swapTotal };
  } catch {
    return { used: 0, total: 0, available: 0, swapUsed: 0, swapTotal: 0 };
  }
}

async function readDisk(): Promise<{ used: number; total: number; partitions: DiskPartitionStats[] }> {
  try {
    const proc = Bun.spawnSync(["df", "-B1"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const lines = proc.stdout.toString().split("\n").slice(1); // skip header
    let rootUsed = 0;
    let rootTotal = 0;
    const partitions: DiskPartitionStats[] = [];

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 6) continue;
      const filesystem = parts[0] ?? "";
      const mount = parts[5] ?? "";

      // Skip pseudo-filesystems
      if (filesystem.startsWith("tmpfs") || filesystem.startsWith("devtmpfs") ||
          filesystem.startsWith("shm") || filesystem === "none") continue;

      const totalBytes = parseInt(parts[1] ?? "0", 10);
      const usedBytes = parseInt(parts[2] ?? "0", 10);
      const totalGb = Math.round((totalBytes / 1024 / 1024 / 1024) * 100) / 100;
      const usedGb = Math.round((usedBytes / 1024 / 1024 / 1024) * 100) / 100;

      if (mount === "/") {
        rootUsed = usedGb;
        rootTotal = totalGb;
      }

      // Only include real partitions (not overlay, proc, sys, etc.)
      if (mount.startsWith("/") && totalGb > 0) {
        partitions.push({ mount, usedGb, totalGb });
      }
    }

    return { used: rootUsed, total: rootTotal, partitions };
  } catch {
    return { used: 0, total: 0, partitions: [] };
  }
}

async function readLoadAvg(): Promise<[number, number, number]> {
  try {
    const content = await Bun.file("/proc/loadavg").text();
    const parts = content.split(/\s+/);
    return [parseFloat(parts[0] ?? "0"), parseFloat(parts[1] ?? "0"), parseFloat(parts[2] ?? "0")];
  } catch {
    return [0, 0, 0];
  }
}

async function readNetwork(): Promise<{ rx: number; tx: number }> {
  try {
    const content = await Bun.file("/proc/net/dev").text();
    let rx = 0;
    let tx = 0;
    for (const line of content.split("\n").slice(2)) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 10) continue;
      const iface = (parts[0] ?? "").replace(":", "");
      if (iface === "lo") continue; // skip loopback
      rx += parseInt(parts[1] ?? "0", 10);
      tx += parseInt(parts[9] ?? "0", 10);
    }
    return { rx, tx };
  } catch {
    return { rx: 0, tx: 0 };
  }
}

export async function collectHostStats(): Promise<HostStats> {
  const [cpu, mem, disk, load, net] = await Promise.all([
    readCpuPercent(),
    readMemory(),
    readDisk(),
    readLoadAvg(),
    readNetwork(),
  ]);

  return {
    cpu_percent: cpu.total,
    cpu_cores: cpu.cores,
    memory_used_mb: Math.round(mem.used * 100) / 100,
    memory_total_mb: Math.round(mem.total * 100) / 100,
    memory_available_mb: Math.round(mem.available * 100) / 100,
    swap_used_mb: Math.round(mem.swapUsed * 100) / 100,
    swap_total_mb: Math.round(mem.swapTotal * 100) / 100,
    disk_used_gb: disk.used,
    disk_total_gb: disk.total,
    disks: disk.partitions,
    load_avg_1m: load[0],
    load_avg_5m: load[1],
    load_avg_15m: load[2],
    network_rx_bytes: net.rx,
    network_tx_bytes: net.tx,
  };
}
