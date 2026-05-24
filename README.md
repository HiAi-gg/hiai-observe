# HiAi Observe

**The simplest, lightest, and most developer-friendly unified observability platform for AI Agents and TypeScript backends.**

## What Is This?

HiAi Observe is a single, self-hosted observability tool that replaces 5 separate services (Bugsink, Uptime Kuma, Beszel, Dozzle, LLM tracing) with one lightweight container.

Built for indie developers and small teams building AI Agents who want answers to three questions:
1. Is everything working?
2. What broke and why?
3. What are my agents actually doing?

## Vision

To become the default observability solution for indie developers and small teams building AI Agents — "the Bugsink you actually enjoy using."

We believe observability should not overwhelm you with dashboards and metrics. It should be fast, minimal, and actually useful.

## Philosophy

- Extreme simplicity and clarity
- Minimal resource usage (one lightweight container, <512MB RAM)
- Beautiful but not bloated UI
- First-class support for Mastra and AI workflows
- No unnecessary complexity or "enterprise" noise
- Fully open source with MIT license
- No Polyform, AGPL, or restrictive licenses

## Core Features

### Error Tracking
Full Sentry SDK compatibility — switch by changing your DSN only. Automatic issue grouping by exception type, message, and stack frame. Breadcrumbs, user context, tags preserved.

### Uptime Monitoring
HTTP health checks with configurable intervals. Public status pages. Response time tracking. 30-day uptime history. Alert on downtime.

### Infrastructure Monitoring
Docker container stats (CPU, memory, network, block I/O). Host resource monitoring (CPU, memory, disk, load average). Auto-refreshing dashboard.

### Log Viewer
Real-time log streaming via WebSocket. Full-text search across container logs. Filter by container, log level, time range. Pause/resume streaming.

### LLM & Agent Observability (Mastra Native)
OpenTelemetry-compatible trace ingestion. Workflow run visualization with step-by-step timeline. Tool call tracking with input/output. Token usage aggregation by model, agent, and workflow. Latency percentiles (p50/p95/p99). Cost estimation per model.

### Unified Dashboard
Single-page overview with error count, uptime %, active containers, trace count. Recent issues, monitor statuses, alert counts. Auto-refresh every 30 seconds.

### Alert Rules Engine
5 condition types: error rate, uptime down, resource threshold, trace error, token usage. Notification channels: Telegram, Discord, Email (SMTP). Redis-based deduplication to prevent alert spam. Configurable cooldown periods.

### API Key Auth & Rate Limiting
Bearer token authentication on all sensitive endpoints. Public endpoints for health, metrics, and status pages. Redis sliding-window rate limiting (100 req/min API, 1000 req/min ingestion). Prometheus-compatible metrics endpoint.

## Tech Stack

| Component | Technology | Version |
|---|---|---|
| Runtime | Bun | 1.3.14+ |
| API Framework | Elysia | 1.4.28+ |
| Database | PostgreSQL | 18+ |
| Cache / Pub-Sub | Redis | 8+ |
| Frontend | Svelte / SvelteKit | 5.55+ / 2.60+ |
| ORM | Drizzle ORM | 0.45+ |
| CSS | Tailwind CSS | v4 |
| Protocols | OpenTelemetry, Sentry SDK | — |
| Auth | API Key (Bearer token) | — |
| Notifications | Grammy (Telegram), Discord Webhook, Nodemailer | — |

## Quick Start

### Local Development

```bash
# Clone and install
cd projects/hiai-observe
bun install

# Configure
cp .env.example .env

# Run
bun run dev
```

Open `http://localhost:8001` — that's it.

### Docker (Recommended for Production)

```bash
# Start all services
docker compose -f docker-compose.prod.yml up -d

# Check health
curl http://localhost:8001/health
```

### Seed Demo Data

```bash
bun run seed
```

Creates a demo project with sample issues, monitors, alerts, traces, and logs.

## Integration

### Mastra (First-Class)

```ts
import { HiaiObserveExporter } from "@hiai-observe/mastra-exporter";

const mastra = new Mastra({
  observability: {
    exporters: [new HiaiObserveExporter({
      endpoint: "http://localhost:8001",
      apiKey: process.env.HIAI_OBSERVE_API_KEY,
    })],
  },
});
```

### Sentry SDK (Drop-in Replacement)

```ts
import * as Sentry from "@sentry/node";
Sentry.init({ dsn: "http://apikey@localhost:8001/1" });
```

### OpenTelemetry (Generic)

```ts
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";

const exporter = new OTLPTraceExporter({
  url: "http://localhost:8001/v1/traces",
});
```

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                   HiAi Observe                       │
│                 (single container)                    │
│                                                      │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │  Ingestion  │  │   Workers    │  │  Frontend  │  │
│  │  Sentry/OTLP│  │  Uptime/Alert│  │  SvelteKit │  │
│  └──────┬──────┘  └──────┬───────┘  └──────┬─────┘  │
│         │                │                  │        │
│  ┌──────┴────────────────┴──────────────────┴─────┐  │
│  │              Elysia API (15 plugins)            │  │
│  │  health│sentry│issues│events│monitors│status    │  │
│  │  infra│logs│ws│otlp│traces│alerts│dashboard     │  │
│  │  + auth middleware + rate limiter + metrics      │  │
│  └──────────────────┬─────────────────────────────┘  │
│                     │                                │
│  ┌──────────────────┴─────────────────────────────┐  │
│  │           PostgreSQL 18 + Redis 8              │  │
│  │  11 tables │ compound indexes │ FK relations   │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
           ▲                ▲
           │                │
      Sentry SDK       OpenTelemetry
      compatible          native
```

## API Endpoints (~40 routes)

| Category | Endpoints | Auth |
|---|---|---|
| Health | GET /health, GET /metrics | Public |
| Sentry Ingestion | POST /api/:projectId/store, /envelope | API Key |
| Issues | GET/POST/PATCH/DELETE /api/issues | API Key |
| Events | GET /api/events | API Key |
| Monitors | CRUD /api/monitors, /:id/checks | API Key |
| Status Page | GET /api/status/:slug | Public |
| Infrastructure | GET /api/infrastructure/* | API Key |
| Logs | GET /api/logs, WS /ws/logs | API Key |
| OTLP | POST /v1/traces, /v1/metrics | API Key |
| Traces | GET /api/traces, /stats, /workflows | API Key |
| Alerts | CRUD /api/alerts, /test, /test-all | API Key |
| Dashboard | GET /api/dashboard | API Key |

## Project Structure

```
hiai-observe/
├── src/
│   ├── index.ts                    # Elysia app entry (15 plugins + 3 middleware)
│   ├── api/ (12 files)             # Route handlers
│   ├── alerts/ (5 files)           # Rules engine, dedup, 3 notifiers
│   ├── ingestion/ (3 files)        # Sentry parser, OTLP parser, grouper
│   ├── mastra/ (3 files)           # Trace parser, token aggregator, latency analyzer
│   ├── middleware/ (3 files)        # Auth, metrics, rate limiter
│   ├── monitoring/ (5 files)       # Docker/host collectors, uptime worker, log streamer
│   └── store/ (8 files)            # Drizzle ORM schema, DB connection, data access
├── frontend/
│   └── src/
│       ├── lib/ (4 files)          # API client, stores, utils, WebSocket manager
│       ├── routes/ (12 pages)      # Dashboard, issues, uptime, infra, logs, traces, settings
│       └── components/ (4 files)   # StatusBadge, MetricCard, DataTable, LiveIndicator
├── tests/ (16 files, 101 tests)    # Unit + integration tests
├── scripts/ (3 files)              # Seed, reset, API key generator
├── packages/mastra-exporter/       # @hiai-observe/mastra-exporter npm package
├── docs/ (3 files)                 # API reference, integration guide, architecture
├── Dockerfile                      # Multi-stage production build
├── docker-compose.yml              # Development compose
├── docker-compose.prod.yml         # Production compose (with Caddy)
└── .github/workflows/ci.yml       # CI pipeline
```

## Scripts

| Command | Description |
|---|---|
| `bun run dev` | Development mode with hot reload |
| `bun run build` | Production build (516 modules, 1.34 MB) |
| `bun run start` | Start production server |
| `bun run test` | Run tests (vitest) |
| `bun run typecheck` | TypeScript type check |
| `bun run seed` | Seed demo data |
| `bun run reset` | Reset all data |
| `bun run gen-key` | Generate API key for a project |
| `bun run docker:prod` | Start production Docker stack |

## Ecosystem

HiAi Observe is the official observability layer for:
- **HiAiKit** — default observability in new projects
- **HiAi OS** — built-in monitoring module
- Works standalone in any Bun/Elysia/Mastra/TypeScript project

## Roadmap

**Phase 1 (MVP) — DONE**
- Error tracking + Sentry SDK compatibility
- Uptime monitoring + status pages
- Docker + host infrastructure monitoring
- Real-time log viewer
- Mastra native traces + token usage
- Unified dashboard
- Alert rules engine + notifications
- Auth + rate limiting + metrics

**Phase 2 (Next)**
- Multi-project support with team collaboration
- Advanced AI agent analytics (cost optimization, model comparison)
- Log aggregation from external sources (syslog, filebeat)
- Custom dashboard widgets
- Webhook integrations

**Phase 3 (Future)**
- Export and retention policies
- Advanced anomaly detection
- Cloud-hosted version (optional)
- Mobile app for alerts

## Known Limitations

- **Single process** — no clustering or worker threads. One Bun event loop handles everything. Sufficient for <50 req/sec.
- **PostgreSQL only** — no ClickHouse or TimescaleDB. Partitioning available via `bun run scripts/partition-tables.ts` for large datasets.
- **No source map upload** — JavaScript/TypeScript stack traces show bundle paths, not original source.
- **Docker socket required** — container monitoring and log streaming need `/var/run/docker.sock` mounted.
- **No SMTP relay** — email notifications require an external SMTP server.
- **ILIKE search fallback** — full-text search uses pg_trgm when available, falls back to ILIKE otherwise.

## Production Checklist

Before deploying to production:

- [ ] Set `ADMIN_API_KEY` in `.env` (required for admin endpoints)
- [ ] Set `CORS_ORIGIN` to your frontend domain
- [ ] Set `NODE_ENV=production` (hides error details from API responses)
- [ ] Configure `RETENTION_DAYS` (default: 30)
- [ ] Enable pg_trgm extension: `CREATE EXTENSION IF NOT EXISTS pg_trgm;`
- [ ] Run `bun run scripts/add-search-indexes.ts` for full-text search indexes
- [ ] Configure at least one notification channel (Telegram, Discord, or SMTP)
- [ ] Mount Docker socket in `docker-compose.yml` for container monitoring
- [ ] Set up HTTPS via Caddy or reverse proxy
- [ ] Set `DATABASE_URL` (required in production, no fallback)
- [ ] Run `bun run scripts/partition-tables.ts` if expecting high data volume

## License

MIT — all code written from scratch with permissive licensing. No AGPL, Polyform, or restrictive dependencies.
