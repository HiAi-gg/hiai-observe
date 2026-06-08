# HiAi Observe — Configuration Reference

## Environment Variables

All configuration is done through environment variables. Copy `.env.example` to `.env` and set the values for your deployment.

### Core Server

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string (`postgresql://user:password@host:port/database`) |
| `REDIS_URL` | No | `redis://localhost:6379` | Redis connection string |
| `PORT` | No | `8001` | HTTP server port |
| `NODE_ENV` | No | `development` | `development`, `production`, or `test` |
| `LOG_LEVEL` | No | `info` | `debug`, `info`, `warn`, `error` |
| `HIAI_OBSERVE_API_KEY` | No | — | Bootstrap API key for the default admin project. Generate with `openssl rand -hex 24` |
| `CORS_ORIGIN` | No | `false` | Allowed CORS origin URL, or `false` to disable |

### Docker Monitoring

| Variable | Required | Default | Description |
|---|---|---|---|
| `DOCKER_SOCKET` | No | `/var/run/docker.sock` | Path to Docker daemon socket |
| `DOCKER_API_VERSION` | No | — | Docker Engine API version to pin. Leave blank for auto-negotiation |
| `COLLECTION_INTERVAL_MS` | No | `30000` | Container/host stats collection interval (milliseconds) |
| `CONTAINER_INCLUDE` | No | — | Comma-separated container name **patterns** to include in stats collection |
| `CONTAINER_EXCLUDE` | No | — | Comma-separated container name **patterns** to exclude from stats collection |

> **Pattern matching**: Include and exclude lists use substring matching (`containerName.includes(pattern)`). Exclude takes precedence over include. If `CONTAINER_INCLUDE` is set, only matching containers are processed. If `CONTAINER_EXCLUDE` is set, matching containers are skipped.

### Log Streaming

| Variable | Required | Default | Description |
|---|---|---|---|
| `LOG_MAX_LINES_PER_SEC` | No | `1000` | Per-container log rate limit (lines/second, 0 = unlimited) |
| `LOG_MAX_BUFFER_SIZE` | No | `10000` | Max log entries buffered in memory before backpressure (0 = unlimited) |
| `LOG_BATCH_INTERVAL_MS` | No | `500` | Batch flush interval in milliseconds |
| `LOG_SAMPLE_RATE` | No | `1.0` | Fraction of logs to keep, `0.0`–`1.0` (1.0 = keep all) |
| `LOG_MAX_CONCURRENT_INSERTS` | No | `3` | Max concurrent DB insert promises (0 = unlimited) |
| `LOG_INCLUDE_CONTAINERS` | No | — | Comma-separated container name patterns to stream logs from |
| `LOG_EXCLUDE_CONTAINERS` | No | — | Comma-separated container name patterns to skip from log streaming |

> **Rate limiting**: Each container has an independent token bucket. When the limit is exceeded, log lines are dropped with a once-per-minute warning log. The bucket refills at `LOG_MAX_LINES_PER_SEC` tokens per second.

> **Backpressure**: When the in-memory buffer exceeds `LOG_MAX_BUFFER_SIZE`, reading from the Docker log stream is paused. Once the buffer is flushed to the database, streaming resumes automatically.

> **Sampling**: Applied before rate limiting. If `LOG_SAMPLE_RATE=0.1`, approximately 10% of log lines are kept. Useful for high-volume containers where you don't need every line.

### Notifications

| Variable | Required | Default | Description |
|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | No | — | Telegram bot token (from @BotFather) |
| `TELEGRAM_CHAT_ID` | No | — | Telegram chat/channel ID for alerts |
| `DISCORD_WEBHOOK_URL` | No | — | Discord webhook URL for alerts |
| `SMTP_HOST` | No | — | SMTP server hostname |
| `SMTP_PORT` | No | `587` | SMTP port |
| `SMTP_USER` | No | — | SMTP username |
| `SMTP_PASS` | No | — | SMTP password |
| `SMTP_FROM` | No | — | From address for alert emails |

### Data Retention

| Variable | Required | Default | Description |
|---|---|---|---|
| `RETENTION_DAYS` | No | `30` | Days to keep old data. Runs daily cleanup at 3 AM UTC |

### Security

| Variable | Required | Default | Description |
|---|---|---|---|
| `ADMIN_API_KEY` | No | — | Separate API key for admin endpoints (user/project management) |
| `ENCRYPTION_KEY` | No | — | AES-256-GCM key for encrypting notification tokens at rest. Generate with `openssl rand -hex 32` |

### External Integrations

| Variable | Required | Default | Description |
|---|---|---|---|
| `HEALTH_PING_URL` | No | — | URL to ping every 60s with health status (Uptime Kuma, Healthchecks.io, etc.) |
| `MODEL_PRICING` | No | — | JSON map of model pricing for AI cost estimation. Example: `{"claude-sonnet-4":{"prompt":3,"completion":15}}` |

## Container Filtering Examples

### Only monitor specific containers

```bash
CONTAINER_INCLUDE=app,worker,api
# Only containers whose names contain "app", "worker", or "api" are monitored
```

### Exclude sidecar containers

```bash
CONTAINER_EXCLUDE=postgres,redis,nginx
# Containers with "postgres", "redis", or "nginx" in their name are skipped
```

### Combined: include app containers but exclude test runners

```bash
CONTAINER_INCLUDE=myproject
CONTAINER_EXCLUDE=test,ci-runner
```

## Log Streaming Tuning Examples

### Development (verbose, no limits)

```bash
LOG_MAX_LINES_PER_SEC=0
LOG_MAX_BUFFER_SIZE=0
LOG_SAMPLE_RATE=1.0
LOG_MAX_CONCURRENT_INSERTS=0
```

### Production (high-volume containers)

```bash
# 500 lines/sec per container
LOG_MAX_LINES_PER_SEC=500
# 5K buffer, 1s flush
LOG_MAX_BUFFER_SIZE=5000
LOG_BATCH_INTERVAL_MS=1000
# Keep 10% of logs for high-volume services
LOG_SAMPLE_RATE=0.1
# 2 concurrent inserts to reduce DB pressure
LOG_MAX_CONCURRENT_INSERTS=2
```

### Small VPS (<512MB RAM)

```bash
# Aggressive rate limiting and small buffer
LOG_MAX_LINES_PER_SEC=100
LOG_MAX_BUFFER_SIZE=1000
LOG_BATCH_INTERVAL_MS=2000
LOG_SAMPLE_RATE=0.1
LOG_MAX_CONCURRENT_INSERTS=1
# Exclude noisy infrastructure containers
LOG_EXCLUDE_CONTAINERS=postgres,redis,mongo,outline
```

## Configuration Validation

On startup, the server validates all numeric configuration values and logs warnings for invalid or out-of-range values, falling back to defaults. Check the startup logs for any configuration issues.

```bash
bun run start
# Look for: "[Config] LOG_MAX_LINES_PER_SEC=1000 (default)"
```
