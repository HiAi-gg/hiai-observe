/**
 * Monitoring configuration for HiAi Observe.
 *
 * Docker connection supports two modes:
 *   1. Unix socket (default): DOCKER_SOCKET=/var/run/docker.sock
 *   2. TCP via socket proxy:  DOCKER_HOST=http://docker-socket-proxy:2375
 *
 * When DOCKER_HOST is set, TCP mode is used (no unix socket required).
 */

export interface MonitoringConfig {
  /** Unix socket path — used when DOCKER_HOST is not set */
  dockerSocket: string;
  /** TCP URL for Docker socket proxy — when set, overrides dockerSocket */
  dockerHost: string | null;
  collectionIntervalMs: number;
  containerFilter: {
    include: string[];
    exclude: string[];
  };
}

const DEFAULT_CONFIG: MonitoringConfig = {
  dockerSocket: process.env.DOCKER_SOCKET || "/var/run/docker.sock",
  dockerHost: process.env.DOCKER_HOST || null,
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
