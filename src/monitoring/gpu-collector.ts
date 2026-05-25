/**
 * GPU stats collector.
 * Uses nvidia-smi to query GPU utilization, memory, and temperature.
 * Returns empty array if nvidia-smi is not available.
 */

export interface GpuStat {
  gpuIndex: number;
  utilizationPercent: number;
  memoryUsedMb: number;
  memoryTotalMb: number;
  temperatureC: number | null;
}

/**
 * Collect GPU stats via nvidia-smi.
 * Gracefully returns [] if nvidia-smi is not installed or no GPUs present.
 */
export async function collectGpuStats(): Promise<GpuStat[]> {
  try {
    const proc = Bun.spawnSync(
      [
        "nvidia-smi",
        "--query-gpu=index,utilization.gpu,memory.used,memory.total,temperature.gpu",
        "--format=csv,noheader,nounits",
      ],
      { stdout: "pipe", stderr: "pipe" },
    );

    if (proc.exitCode !== 0) return [];

    const output = proc.stdout.toString().trim();
    if (!output) return [];

    const gpus: GpuStat[] = [];
    for (const line of output.split("\n")) {
      const parts = line.split(",").map((p) => p.trim());
      if (parts.length < 5) continue;

      const gpuIndex = parseInt(parts[0] ?? "0", 10);
      const utilizationPercent = parseFloat(parts[1] ?? "0");
      const memoryUsedMb = parseFloat(parts[2] ?? "0");
      const memoryTotalMb = parseFloat(parts[3] ?? "0");
      const temperatureRaw = parts[4];
      const temperatureC =
        temperatureRaw && temperatureRaw !== "N/A" && temperatureRaw !== "[N/A]"
          ? parseFloat(temperatureRaw)
          : null;

      gpus.push({ gpuIndex, utilizationPercent, memoryUsedMb, memoryTotalMb, temperatureC });
    }

    return gpus;
  } catch {
    // nvidia-smi not found or other error
    return [];
  }
}
