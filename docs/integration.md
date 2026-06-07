# HiAi Observe — Integration Guide

## Quick Start

### 1. Install and configure

```bash
cd projects/hiai-observe
bun install
cp .env.example .env
# Edit .env with your values
```

### 2. Start services

```bash
# Start database and Redis
docker compose up -d postgres redis

# Run migrations (if using Drizzle Kit)
bunx drizzle-kit push

# Start HiAi Observe
bun run dev
```

### 3. Create a project

Insert a project row to get an API key:

```bash
psql -h localhost -p 5432 -U observe -d hiai_observe -c "
INSERT INTO projects (name, slug, api_key)
VALUES ('My App', 'my-app', 'hiai_sk_your_secret_key_here');
"
```

### 4. Send your first event

```bash
curl -X POST http://localhost:8001/api/PROJECT_UUID/store \
  -H "Authorization: Bearer hiai_sk_your_secret_key_here" \
  -H "Content-Type: application/json" \
  -d '{"message":"Hello from my app!"}'
```

---

## Mastra Integration (First-Class)

HiAi Observe has native support for Mastra AI workflows, tools, and agents.

### Setup

```ts
import { Mastra } from "@mastra/core";

const mastra = new Mastra({
  // ... your config

  // Option 1: Direct OTLP export
  telemetry: {
    serviceName: "my-mastra-app",
    export: {
      type: "otlp",
      endpoint: "http://localhost:8001/v1/traces",
      headers: {
        Authorization: "Bearer hiai_sk_your_secret_key_here",
      },
    },
  },
});
```

### What gets captured

- **Workflow runs** — full step-by-step breakdown with timing
- **Tool calls** — input, output, duration, success/failure
- **Agent interactions** — prompt, response, model used
- **Token usage** — prompt, completion, total tokens per step
- **Latency** — p50/p95/p99 per workflow and per step

### Viewing traces

1. Open `http://localhost:8001` in your browser
2. Navigate to **Traces** in the sidebar
3. Filter by workflow name, agent, or time range
4. Click a trace to see the waterfall timeline

---

## Sentry SDK Integration (Drop-in Replacement)

HiAi Observe is compatible with the Sentry SDK protocol. Switch existing projects by changing the DSN only.

### Node.js / Bun

```ts
import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: "http://hiai_sk_your_secret_key_here@localhost:8001/PROJECT_UUID",
  environment: "production",
  release: "1.0.0",
});
```

### Python

```python
import sentry_sdk

sentry_sdk.init(
    dsn="http://hiai_sk_your_secret_key_here@localhost:8001/PROJECT_UUID",
    environment="production",
    release="1.0.0",
)
```

### JavaScript (Browser)

```ts
import * as Sentry from "@sentry/browser";

Sentry.init({
  dsn: "http://hiai_sk_your_secret_key_here@localhost:8001/PROJECT_UUID",
});
```

### What gets captured

- Exceptions with full stack traces
- Breadcrumbs (navigation, console, HTTP)
- User context
- Tags and custom data
- SDK info and release version

### Issue grouping

Events are automatically grouped into issues by:
1. Exception type (e.g., `TypeError`)
2. First in-app stack frame function name
3. First in-app stack frame filename

### Switching from Sentry

1. Create a project in HiAi Observe (see Quick Start above)
2. Replace the DSN in your Sentry SDK config
3. That's it — no code changes needed

---

## OpenTelemetry Integration (Generic)

For any application that supports OpenTelemetry traces.

### Node.js (OTLP HTTP)

```ts
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: "http://localhost:8001/v1/traces",
    headers: {
      Authorization: "Bearer hiai_sk_your_secret_key_here",
    },
  }),
});

sdk.start();
```

### Python (OTLP HTTP)

```python
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

exporter = OTLPSpanExporter(
    endpoint="http://localhost:8001/v1/traces",
    headers={"Authorization": "Bearer hiai_sk_your_secret_key_here"},
)

provider = TracerProvider()
provider.add_span_processor(BatchSpanProcessor(exporter))
trace.set_tracer_provider(provider)
```

### Go (OTLP HTTP)

```go
import (
    "go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
    "go.opentelemetry.io/otel/sdk/trace"
)

exporter, _ := otlptracehttp.New(ctx,
    otlptracehttp.WithEndpoint("localhost:8001"),
    otlptracehttp.WithHeaders(map[string]string{
        "Authorization": "Bearer hiai_sk_your_secret_key_here",
    }),
    otlptracehttp.WithInsecure(),
)

tp := trace.NewTracerProvider(trace.WithBatcher(exporter))
```

### Metrics

Metrics are also accepted via `/v1/metrics`:

```ts
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";

const metricExporter = new OTLPMetricExporter({
  url: "http://localhost:8001/v1/metrics",
  headers: {
    Authorization: "Bearer hiai_sk_your_secret_key_here",
  },
});
```

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | `postgresql://observe:observe@localhost:5432/hiai_observe` | PostgreSQL connection string |
| `REDIS_URL` | Yes | `redis://localhost:6379` | Redis connection string |
| `HIAI_OBSERVE_API_KEY` | No | — | Default API key for first project |
| `PORT` | No | `8001` | HTTP server port |
| `NODE_ENV` | No | `development` | `development` or `production` |
| `DOCKER_SOCKET` | No | `/var/run/docker.sock` | Docker socket path for container monitoring |
| `LOG_LEVEL` | No | `info` | Log verbosity: `debug`, `info`, `warn`, `error` |
| `TELEGRAM_BOT_TOKEN` | No | — | Telegram bot token for alert notifications |
| `DISCORD_WEBHOOK_URL` | No | — | Discord webhook URL for alert notifications |
| `SMTP_HOST` | No | — | SMTP server for email alerts |
| `SMTP_PORT` | No | `587` | SMTP port |
| `SMTP_USER` | No | — | SMTP username |
| `SMTP_PASS` | No | — | SMTP password |
| `SMTP_FROM` | No | — | Sender email address |

---

## Troubleshooting

### Production Deployment

For production deployment with TLS, security hardening, and operational best practices, see [production.md](production.md).

### "Invalid API key" (401/403)

1. Verify the API key exists in the `projects` table:
   ```bash
   psql -h localhost -p 5432 -U observe -d hiai_observe -c "SELECT id, name, api_key FROM projects;"
   ```
2. Verify the DSN format: `http://API_KEY@localhost:8001/PROJECT_UUID`
3. For Sentry SDK, ensure the project UUID in the DSN path matches the `projects.id` column

### "Docker unavailable" (503)

1. Check Docker socket exists: `ls -la /var/run/docker.sock`
2. Verify Docker is running: `docker ps`
3. If running in a container, mount the socket: `-v /var/run/docker.sock:/var/run/docker.sock`
4. Set `DOCKER_SOCKET` env var if using a non-standard path

### No traces appearing

1. Check the OTLP endpoint URL: must be `http://localhost:8001/v1/traces` (not `/v1/trace`)
2. Verify the API key is valid: `curl -H "Authorization: Bearer YOUR_KEY" http://localhost:8001/health`
3. Check server logs for ingestion errors
4. Ensure the OTLP exporter is using JSON format (not protobuf for MVP)

### WebSocket connection drops

1. Ensure your reverse proxy (Caddy/nginx) supports WebSocket upgrade
2. Add proxy headers: `Upgrade`, `Connection`
3. Increase proxy timeout for long-lived connections

### High memory usage

1. Check container count: `/api/infrastructure/overview`
2. Reduce collection intervals in `src/monitoring/config.ts`
3. Clear old logs: `DELETE /api/logs?before=...`
4. Set up log rotation with the `DELETE /api/logs` endpoint on a cron

### Database connection errors

1. Verify PostgreSQL is running: `docker compose ps`
2. Check connection string in `.env`
3. Ensure the database exists: `psql -h localhost -U observe -c "SELECT 1 FROM pg_database WHERE datname='hiai_observe';"`
4. Run init script: `docker/init.sql`
