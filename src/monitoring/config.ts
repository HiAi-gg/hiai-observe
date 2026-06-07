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
  /**
   * Docker API version path segment, e.g. "/v1.44" — prepended to API paths.
   * Empty string (default) uses the versionless path, which the daemon serves
   * with its current API. Pin via DOCKER_API_VERSION (e.g. "1.44") when needed.
   * Modern daemons reject versions below their MinAPIVersion (Docker 29 = 1.44).
   */
  dockerApiPrefix: string;
  collectionIntervalMs: number;
  containerFilter: {
    include: string[];
    exclude: string[];
  };
}

const DEFAULT_CONFIG: MonitoringConfig = {
  dockerSocket: process.env.DOCKER_SOCKET || "/var/run/docker.sock",
  dockerHost: process.env.DOCKER_HOST || null,
  dockerApiPrefix: process.env.DOCKER_API_VERSION
    ? `/v${process.env.DOCKER_API_VERSION.replace(/^v/, "")}`
    : "",
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
