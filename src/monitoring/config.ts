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
  /** Log stream container filter — separate from metric collection filter */
  logContainerFilter: {
    include: string[];
    exclude: string[];
  };
  /** Max log lines per second per container (0 = unlimited) */
  logMaxLinesPerSec: number;
  /** Max entries in memory before backpressure (0 = unlimited) */
  logMaxBufferSize: number;
  /** Batch flush interval in milliseconds */
  logBatchIntervalMs: number;
  /** Fraction of logs to keep (0.0-1.0) */
  logSampleRate: number;
  /** Max concurrent DB insert promises (0 = unlimited) */
  logMaxConcurrentInserts: number;
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
  logContainerFilter: {
    include: (process.env.LOG_INCLUDE_CONTAINERS || "").split(",").filter(Boolean),
    exclude: (process.env.LOG_EXCLUDE_CONTAINERS || "").split(",").filter(Boolean),
  },
  logMaxLinesPerSec: Number(process.env.LOG_MAX_LINES_PER_SEC) || 1000,
  logMaxBufferSize: Number(process.env.LOG_MAX_BUFFER_SIZE) || 10_000,
  logBatchIntervalMs: Number(process.env.LOG_BATCH_INTERVAL_MS) || 500,
  logSampleRate: Number(process.env.LOG_SAMPLE_RATE) || 1.0,
  logMaxConcurrentInserts: Number(process.env.LOG_MAX_CONCURRENT_INSERTS) || 3,
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
