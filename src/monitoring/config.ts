/**
 * Monitoring configuration for HiAi Observe.
 */

export interface MonitoringConfig {
  dockerSocket: string;
  collectionIntervalMs: number;
  containerFilter: {
    include: string[];
    exclude: string[];
  };
}

const DEFAULT_CONFIG: MonitoringConfig = {
  dockerSocket: process.env.DOCKER_SOCKET || "/var/run/docker.sock",
  collectionIntervalMs: Number(process.env.COLLECTION_INTERVAL_MS) || 30_000,
  containerFilter: {
    include: (process.env.CONTAINER_INCLUDE || "").split(",").filter(Boolean),
    exclude: (process.env.CONTAINER_EXCLUDE || "").split(",").filter(Boolean),
  },
};

let cached: MonitoringConfig | null = null;

export function getConfig(): MonitoringConfig {
  if (!cached) {
    cached = { ...DEFAULT_CONFIG };
  }
  return cached;
}

export function resetConfig(): void {
  cached = null;
}
