# HiAi Observe

[![CI](https://github.com/HiAi-gg/hiai-observe/actions/workflows/ci.yml/badge.svg)](https://github.com/HiAi-gg/hiai-observe/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.2.0-green.svg)](CHANGELOG.md)

**The simplest, lightest, and most developer-friendly unified observability platform for AI Agents and TypeScript backends.**

Replaces 5 separate services with one lightweight container. Built for indie developers and small teams who want answers to three questions:

1. Is everything working?
2. What broke and why?
3. What are my agents actually doing?

## Quick Start

```bash
# Clone and start
git clone https://github.com/HiAi-gg/hiai-observe.git
cd hiai-observe
cp .env.example .env
docker compose up -d

# Check health
curl http://localhost:8001/health
```

Open `http://localhost:8001` — that's it.

### Your API key

Set `HIAI_OBSERVE_API_KEY` in `.env` before first start — the server provisions a
`Default` admin project from it automatically, so the key works immediately as a
Bearer token or Sentry DSN. Generate one with `openssl rand -hex 24`.

Need more projects (or didn't set the env key)? Create them in the UI, or:

```bash
bun run gen-key "My Project"   # prints a one-time API key
```

For local development without Docker:

```bash
bun install
bun run dev
```

## What's Included

HiAi Observe bundles 5 observability modules into a single container:

| Module | What It Does | Replaces |
|---|---|---|
| **Error Tracking** | Sentry-compatible error ingestion, automatic issue grouping, stack traces, source maps | Bugsink, Sentry |
| **Uptime Monitoring** | HTTP health checks, public status pages, response time history, SSL tracking | Uptime Kuma |
| **Infrastructure** | Docker container stats, host CPU/memory/disk monitoring, auto-refresh dashboard | Beszel |
| **Log Viewer** | Real-time WebSocket log streaming, full-text search, container filtering | Dozzle |
| **AI Agent Observability** | Mastra-native traces, workflow visualization, token usage, latency percentiles, cost estimation | Custom LLM tracing |

Plus: unified dashboard, alert rules engine, maintenance windows, incident management, and API key auth.

## Comparison

| Feature | HiAi Observe | Bugsink | Uptime Kuma | Beszel | Dozzle |
|---|---|---|---|---|---|
| Error tracking (Sentry SDK) | Yes | Yes | — | — | — |
| Uptime monitoring | Yes | — | Yes | — | — |
| Status pages | Yes | — | Yes | — | — |
| Docker container stats | Yes | — | — | Yes | — |
| Host resource monitoring | Yes | — | — | Yes | — |
| Real-time log streaming | Yes | — | — | — | Yes |
| Log search | Yes | — | — | — | Yes |
| AI/LLM trace ingestion | Yes | — | — | — | — |
| Mastra native integration | Yes | — | — | — | — |
| Token usage tracking | Yes | — | — | — | — |
| Alert rules engine | Yes | — | Yes | — | — |
| Multi-channel notifications | Yes | — | Yes | — | — |
| Incident management | Yes | — | — | — | — |
| Maintenance windows | Yes | — | — | — | — |
| Single container | Yes | Yes | Yes | Yes | Yes |
| Resource usage | <512MB | ~200MB | ~100MB | ~100MB | ~50MB |
| **Services replaced** | **5** | 1 | 1 | 1 | 1 |

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

## API Endpoints

| Category | Endpoints | Auth |
|---|---|---|
| Health | GET `/health`, GET `/metrics` | Public |
| Sentry Ingestion | POST `/api/:projectId/store`, `/api/:projectId/envelope` | API Key |
| Agent Ingestion | POST `/api/agent/:projectId/ingest` | API Key |
| OTLP | POST `/v1/traces`, POST `/v1/metrics` | API Key |
| Issues | GET `/api/issues`, GET `/api/issues/:id`, PATCH `/api/issues/:id`, POST `/api/issues/:id/merge`, DELETE `/api/issues/:id` | API Key |
| Events | GET `/api/events`, GET `/api/events/:id` | API Key |
| Comments | GET `/api/issues/:id/comments`, POST `/api/issues/:id/comments`, DELETE `/api/comments/:id` | API Key |
| Monitors | CRUD `/api/monitors`, GET `/api/monitors/groups`, GET `/api/monitors/:id/checks` | API Key |
| Status Page | GET `/api/status/:slug` (JSON), GET `/status/:slug` (HTML), GET `/api/status/:slug/history` | Public |
| Badges | GET `/api/badges/uptime/:slug/:id`, GET `/api/badges/incidents/:slug/:id` | Public |
| Infrastructure | GET `/api/infrastructure/containers`, `/api/infrastructure/hosts`, `/api/infrastructure/containers/:id` | API Key |
| Logs | GET `/api/logs`, GET `/api/logs/stats`, GET `/api/logs/containers`, DELETE `/api/logs`, WS `/ws/logs` | API Key |
| Traces | GET `/api/traces`, GET `/api/traces/stats`, GET `/api/traces/workflows`, GET `/api/traces/workflows/:id`, GET `/api/traces/:id` | API Key |
| Alerts | CRUD `/api/alerts`, POST `/api/alerts/:id/test`, POST `/api/alerts/test-all`, GET `/api/alerts/history`, GET `/api/alerts/channels` | API Key |
| Dashboard | GET `/api/dashboard` | API Key |
| Projects | GET/POST `/api/projects`, POST `/api/projects/:id/rotate-key`, DELETE `/api/projects/:id` | API Key |
| Notifications | CRUD `/api/notifications/:channel`, POST `/api/notifications/:channel/test` | API Key |
| Source Maps | POST/GET/DELETE `/api/sourcemaps/:projectId` | API Key |
| Maintenance | CRUD `/api/maintenance`, GET `/api/maintenance/active/now` | API Key |
| Incidents | CRUD `/api/incidents`, GET `/api/incidents/active` | API Key |
| Releases | CRUD `/api/releases`, GET `/api/releases/:id/health` | API Key |
| Team | CRUD `/api/team` | API Key |
| Search | GET `/api/search` | API Key |
| Saved Searches | GET/POST/DELETE `/api/saved-searches` | API Key |
| Export | GET `/api/export/issues`, `/api/export/traces`, `/api/export/logs` | API Key |
| Admin | GET/PUT `/api/admin/retention`, POST `/api/admin/cleanup` | Admin Key |

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
│  │              Elysia API (27 plugins)            │  │
│  │  health│sentry│issues│events│monitors│status    │  │
│  │  infra│logs│ws│otlp│traces│alerts│dashboard     │  │
│  │  + auth + rate limiter + metrics + request-id   │  │
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

## Project Structure

```
hiai-observe/
├── src/
│   ├── index.ts                    # Elysia app entry (27 plugins + 4 middleware)
│   ├── api/ (27 files)             # Route handlers
│   ├── alerts/ (5 files)           # Rules engine, dedup, 3 notifiers
│   ├── ingestion/ (3 files)        # Sentry parser, OTLP parser, grouper
│   ├── mastra/ (3 files)           # Trace parser, token aggregator, latency analyzer
│   ├── middleware/ (4 files)        # Auth, metrics, rate limiter, request-id
│   ├── monitoring/ (5 files)       # Docker/host collectors, uptime worker, log streamer
│   ├── workers/ (2 files)          # Retention cleanup, maintenance scheduler
│   └── store/ (8 files)            # Drizzle ORM schema, DB connection, data access
├── frontend/
│   └── src/
│       ├── lib/ (4 files)          # API client, stores, utils, WebSocket manager
│       ├── routes/ (12 pages)      # Dashboard, issues, uptime, infra, logs, traces, settings
│       └── components/ (4 files)   # StatusBadge, MetricCard, DataTable, LiveIndicator
├── tests/ (23 files, 216 tests)    # Unit + integration tests
├── scripts/ (3 files)              # Seed, reset, API key generator
├── packages/mastra-exporter/       # @hiai-observe/mastra-exporter npm package
├── docs/ (3 files)                 # API reference, integration guide, architecture
├── Dockerfile                      # Multi-stage production build
├── docker-compose.yml              # Development compose
├── docker-compose.prod.yml         # Production compose (with Caddy)
├── CHANGELOG.md                    # Version history
└── .github/workflows/ci.yml       # CI pipeline
```

## Scripts

| Command | Description |
|---|---|
| `bun run dev` | Development mode with hot reload |
| `bun run build` | Production build |
| `bun run start` | Start production server |
| `bun run test` | Run tests (vitest) |
| `bun run typecheck` | TypeScript type check |
| `bun run seed` | Seed demo data |
| `bun run reset` | Reset all data |
| `bun run gen-key` | Generate API key for a project |
| `bun run docker:prod` | Start production Docker stack |

## Known Limitations

- **Single process** — no clustering or worker threads. One Bun event loop handles everything. Sufficient for <50 req/sec.
- **No user authentication** — API key (Bearer token) only. No user accounts, roles, or sessions.
- **API keys in plaintext** — keys stored as-is in PostgreSQL. Encrypted storage planned for v0.2.0.
- **PostgreSQL only** — no ClickHouse or TimescaleDB. Partitioning available for large datasets.
- **Docker socket required** — container monitoring and log streaming need `/var/run/docker.sock` mounted.
- **No SMTP relay** — email notifications require an external SMTP server.

## Roadmap

### v0.2.0 (Planned)

- User authentication with roles and team permissions
- Encrypted API key storage
- Multi-project dashboard with cross-project analytics
- Advanced AI agent analytics (cost optimization, model comparison)
- Log aggregation from external sources (syslog, filebeat)
- Custom dashboard widgets
- Webhook integrations
- Alert grouping and escalation policies

### v0.3.0 (Future)

- Export and retention policies with UI configuration
- Advanced anomaly detection for error patterns and latency spikes
- Mobile-friendly responsive improvements
- API rate limiting per project (configurable)

## Ecosystem

HiAi Observe is the official observability layer for:
- **HiAiKit** — default observability in new projects
- **HiAi OS** — built-in monitoring module
- Works standalone in any Bun/Elysia/Mastra/TypeScript project

## Production Deployment

For production setup with TLS, security hardening, and operational best practices, see [docs/production.md](docs/production.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, code guidelines, and pull request process.

## License

MIT — all code written from scratch with permissive licensing. No AGPL, Polyform, or restrictive dependencies. See [LICENSE](LICENSE).
