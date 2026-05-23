/**
 * Host resource stats collector.
 * Reads from /proc on Linux, falls back to system commands.
 */

export interface HostStats {
  cpu_percent: number;
  memory_used_mb: number;
  memory_total_mb: number;
  memory_available_mb: number;
  disk_used_gb: number;
  disk_total_gb: number;
  load_avg_1m: number;
  load_avg_5m: number;
  load_avg_15m: number;
}

let prevCpuIdle = 0;
let prevCpuTotal = 0;

async function readCpuPercent(): Promise<number> {
  try {
    const content = await Bun.file("/proc/stat").text();
    const line = content.split("\n")[0] ?? "";
    const parts = line.split(/\s+/).slice(1).map(Number);
    const idle = (parts[3] ?? 0) + (parts[4] ?? 0); // idle + iowait
    const total = parts.reduce((a, b) => a + b, 0);

    const diffIdle = idle - prevCpuIdle;
    const diffTotal = total - prevCpuTotal;
    prevCpuIdle = idle;
    prevCpuTotal = total;

    if (diffTotal === 0) return 0;
    return Math.round((1 - diffIdle / diffTotal) * 10000) / 100;
  } catch {
    return 0;
  }
}

async function readMemory(): Promise<{
  used: number;
  total: number;
  available: number;
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
    return { used, total, available };
  } catch {
    return { used: 0, total: 0, available: 0 };
  }
}

async function readDisk(): Promise<{ used: number; total: number }> {
  try {
    const proc = Bun.spawnSync(["df", "-B1", "/"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const lines = proc.stdout.toString().split("\n");
    if (lines.length < 2) return { used: 0, total: 0 };
    const parts = (lines[1] ?? "").split(/\s+/);
    const total = parseInt(parts[1] ?? "0", 10) / 1024 / 1024 / 1024;
    const used = parseInt(parts[2] ?? "0", 10) / 1024 / 1024 / 1024;
    return {
      used: Math.round(used * 100) / 100,
      total: Math.round(total * 100) / 100,
    };
  } catch {
    return { used: 0, total: 0 };
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

export async function collectHostStats(): Promise<HostStats> {
  const [cpuPercent, mem, disk, load] = await Promise.all([
    readCpuPercent(),
    readMemory(),
    readDisk(),
    readLoadAvg(),
  ]);

  return {
    cpu_percent: cpuPercent,
    memory_used_mb: Math.round(mem.used * 100) / 100,
    memory_total_mb: Math.round(mem.total * 100) / 100,
    memory_available_mb: Math.round(mem.available * 100) / 100,
    disk_used_gb: disk.used,
    disk_total_gb: disk.total,
    load_avg_1m: load[0],
    load_avg_5m: load[1],
    load_avg_15m: load[2],
  };
}
