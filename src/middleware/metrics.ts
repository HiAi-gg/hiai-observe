import { Elysia } from "elysia";

interface MetricsData {
  requestCount: number;
  errorCount: number;
  latencyBuckets: number[];
  latencySum: number;
  startTime: number;
  rateLimiterFallOpenCount: number;
}

const metrics: MetricsData = {
  requestCount: 0,
  errorCount: 0,
  latencyBuckets: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // 1ms,5ms,10ms,25ms,50ms,100ms,250ms,500ms,1s,2.5s,5s,+Inf
  latencySum: 0,
  startTime: Date.now(),
  rateLimiterFallOpenCount: 0,
};

/** Increment the rate-limiter fall-open counter. Called when Redis is unavailable
 *  and the rate limiter intentionally allows the request through (fail-open). */
export function recordRateLimiterFallOpen(): void {
  metrics.rateLimiterFallOpenCount++;
}

const otlpAccepted: Record<"logs" | "traces" | "metrics", number> = {
  logs: 0,
  traces: 0,
  metrics: 0,
};
let retentionDeletedTotal = 0;

export function recordOtlpAccepted(signal: "logs" | "traces" | "metrics", n = 1): void {
  otlpAccepted[signal] += n;
}

export function recordRetentionDeleted(n: number): void {
  retentionDeletedTotal += n;
}

/** Test-only: reset operational counters so /metrics assertions are deterministic. */
export function resetOperationalCountersForTests(): void {
  otlpAccepted.logs = 0;
  otlpAccepted.traces = 0;
  otlpAccepted.metrics = 0;
  retentionDeletedTotal = 0;
}

/** DB pool stats — updated externally via `setDbPoolStats`. */
let dbPoolStats = { active: 0, idle: 0, waiting: 0 };

export function setDbPoolStats(stats: { active: number; idle: number; waiting: number }) {
  dbPoolStats = stats;
}

const BUCKET_BOUNDARIES = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];

function recordLatency(ms: number) {
  for (let i = 0; i < BUCKET_BOUNDARIES.length; i++) {
    if (ms <= (BUCKET_BOUNDARIES[i] ?? Infinity)) {
      metrics.latencyBuckets[i] = (metrics.latencyBuckets[i] ?? 0) + 1;
      return;
    }
  }
  const lastIdx = BUCKET_BOUNDARIES.length;
  metrics.latencyBuckets[lastIdx] = (metrics.latencyBuckets[lastIdx] ?? 0) + 1; // +Inf bucket
}

export const metricsMiddleware = new Elysia()
  .onBeforeHandle({ as: "global" }, ({ request }) => {
    (request as unknown as { _startTime: number })._startTime = performance.now();
  })
  .onAfterHandle({ as: "global" }, ({ request, set }) => {
    const start = (request as unknown as { _startTime: number })._startTime;
    if (start) {
      const latency = performance.now() - start;
      recordLatency(latency);
      metrics.latencySum += latency;
    }
    metrics.requestCount++;
    const status = typeof set.status === "number" ? set.status : 200;
    if (status >= 500) metrics.errorCount++;
  });

export const metricsPlugin = new Elysia().use(metricsMiddleware).get("/metrics", () => {
  const uptimeSeconds = (Date.now() - metrics.startTime) / 1000;
  const lines: string[] = [];

  lines.push("# HELP hiai_observe_requests_total Total number of requests");
  lines.push("# TYPE hiai_observe_requests_total counter");
  lines.push(`hiai_observe_requests_total ${metrics.requestCount}`);

  lines.push("# HELP hiai_observe_errors_total Total number of 5xx errors");
  lines.push("# TYPE hiai_observe_errors_total counter");
  lines.push(`hiai_observe_errors_total ${metrics.errorCount}`);

  lines.push("# HELP hiai_observe_request_duration_seconds Request latency histogram");
  lines.push("# TYPE hiai_observe_request_duration_seconds histogram");

  let cumulative = 0;
  for (let i = 0; i < BUCKET_BOUNDARIES.length; i++) {
    cumulative += metrics.latencyBuckets[i] ?? 0;
    lines.push(
      `hiai_observe_request_duration_seconds_bucket{le="${(BUCKET_BOUNDARIES[i] ?? 0) / 1000}"} ${cumulative}`,
    );
  }
  cumulative += metrics.latencyBuckets[BUCKET_BOUNDARIES.length] ?? 0;
  lines.push(`hiai_observe_request_duration_seconds_bucket{le="+Inf"} ${cumulative}`);
  lines.push(`hiai_observe_request_duration_seconds_sum ${metrics.latencySum / 1000}`);
  lines.push(`hiai_observe_request_duration_seconds_count ${metrics.requestCount}`);

  lines.push("# HELP hiai_observe_uptime_seconds Process uptime in seconds");
  lines.push("# TYPE hiai_observe_uptime_seconds gauge");
  lines.push(`hiai_observe_uptime_seconds ${uptimeSeconds}`);

  lines.push("# HELP hiai_observe_db_pool_active Active DB connections");
  lines.push("# TYPE hiai_observe_db_pool_active gauge");
  lines.push(`hiai_observe_db_pool_active ${dbPoolStats.active}`);

  lines.push("# HELP hiai_observe_db_pool_idle Idle DB connections");
  lines.push("# TYPE hiai_observe_db_pool_idle gauge");
  lines.push(`hiai_observe_db_pool_idle ${dbPoolStats.idle}`);

  lines.push("# HELP hiai_observe_db_pool_waiting Requests waiting for a connection");
  lines.push("# TYPE hiai_observe_db_pool_waiting gauge");
  lines.push(`hiai_observe_db_pool_waiting ${dbPoolStats.waiting}`);

  lines.push(
    "# HELP hiai_observe_rate_limiter_fall_open_total Times the rate limiter fell open due to Redis being unavailable",
  );
  lines.push("# TYPE hiai_observe_rate_limiter_fall_open_total counter");
  lines.push(`hiai_observe_rate_limiter_fall_open_total ${metrics.rateLimiterFallOpenCount}`);

  lines.push("# HELP hiai_observe_otlp_accepted_total OTLP records accepted by signal");
  lines.push("# TYPE hiai_observe_otlp_accepted_total counter");
  for (const signal of ["logs", "traces", "metrics"] as const) {
    lines.push(`hiai_observe_otlp_accepted_total{signal="${signal}"} ${otlpAccepted[signal]}`);
  }

  lines.push("# HELP hiai_observe_retention_deleted_total Rows deleted by the retention worker");
  lines.push("# TYPE hiai_observe_retention_deleted_total counter");
  lines.push(`hiai_observe_retention_deleted_total ${retentionDeletedTotal}`);

  return `${lines.join("\n")}\n`;
});
