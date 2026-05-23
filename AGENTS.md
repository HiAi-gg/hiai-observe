# HiAi Observe — Agent Operating Instructions

## Identity & Purpose

Unified, self-hosted observability platform for AI Agents and TypeScript backends. Replaces Bugsink + Uptime Kuma + Beszel + Dozzle + basic LLM tracing with one lightweight container.

**What agents should know before working here:**
- Production status: MVP complete (Phases 0-7 done, Phase 8 polish in progress)
- Sentry SDK compatibility is a hard requirement for error tracking (drop-in replacement)
- Mastra native integration is the differentiator — traces, workflows, tools, token usage, latency
- Must run comfortably on small VPS (<512MB RAM target)
- MIT license — all code written from scratch, no AGPL/Polyform dependencies
- Auth middleware protects all sensitive routes (Bearer token)
- Rate limiting via Redis sliding window

## Runtime Contract

- **Stack:** Bun 1.3.14+, Elysia 1.4.28+, PostgreSQL 18+, Redis 8+, Svelte 5.55+
- **Key ports:** 8001 (UI + API), 8000 (example app integration)
- **Health check:** `curl -fsS http://localhost:8001/health`
- **Database:** `psql -h localhost -p 5432 -U observe -d hiai_observe`
- **Metrics:** `curl http://localhost:8001/metrics` (Prometheus format)

## Canonical Commands

```bash
cd projects/hiai-observe
bun install
cp .env.example .env
bun run dev              # dev mode with hot reload

# typecheck
bun run typecheck

# test
bun run test

# production
bun run build
bun run start

# docker
docker compose up -d
docker compose -f docker-compose.prod.yml up -d

# demo data
bun run seed
bun run reset
bun run gen-key
```

## Repo Map

| Path | Role |
|---|---|
| `src/api/` | 12 Elysia route plugins (health, sentry-ingest, issues, events, monitors, status-page, infrastructure, logs, logs-ws, otlp, traces, alerts, dashboard) |
| `src/ingestion/` | Sentry-compatible parser, OTLP parser, issue grouper |
| `src/mastra/` | Mastra trace parser, workflow/tool/token extraction, latency analyzer |
| `src/middleware/` | Auth middleware, Prometheus metrics, Redis rate limiter |
| `src/monitoring/` | Docker stats collector, host resource collector, uptime worker, log streamer |
| `src/store/` | PostgreSQL + Redis data layer (Drizzle ORM, 11 tables, compound indexes) |
| `src/alerts/` | Alert rules engine (5 condition types), dedup, dispatcher, 3 notifiers |
| `frontend/` | Svelte 5 + SvelteKit 12 pages, dark mode, responsive, WebSocket live updates |
| `packages/mastra-exporter/` | @hiai-observe/mastra-exporter npm package |
| `scripts/` | Seed demo data, reset, generate API keys |
| `tests/` | 16 test files (101 unit + 13 integration) |
| `docs/` | API reference, integration guide, architecture overview |
| `.github/workflows/` | CI pipeline (typecheck, test, build, Docker) |

## Architecture Decisions

- **Single container** — API + workers + frontend in one Docker image for simplicity
- **Sentry SDK compatible** — existing projects can switch by changing DSN only
- **OpenTelemetry native** — OTLP HTTP receiver for traces and metrics
- **PostgreSQL for persistence** — events, issues, traces, uptime history, 11 tables with compound indexes
- **Redis for real-time** — pub/sub for live log streaming, alert dedup, rate limiting, caching
- **No ClickHouse/TimescaleDB** — MVP uses PG with partitioning; revisit at scale
- **Auth via API key** — Bearer token on all sensitive routes; public endpoints for health/metrics/status
- **N+1 prevention** — batch queries (getUptimePercentages), parallel Promise.all for infra collection

## Integration Patterns

### Mastra (first-class)

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

### Sentry SDK (drop-in replacement)

```ts
import * as Sentry from "@sentry/node";
Sentry.init({ dsn: "http://apikey@localhost:8001/1" });
```

### OpenTelemetry (generic)

```ts
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";

const exporter = new OTLPTraceExporter({
  url: "http://localhost:8001/v1/traces",
});
```

## Database Schema (11 Tables)

| Table | Purpose |
|---|---|
| `projects` | API keys, project metadata |
| `issues` | Grouped errors with fingerprint, status, count |
| `events` | Individual error events with stack traces |
| `traces` | OTLP spans (workflows, tools, agents) |
| `uptime_monitors` | HTTP check configurations |
| `uptime_checks` | Check results with response times |
| `container_stats` | Docker container metrics |
| `host_stats` | Server CPU/memory/disk metrics |
| `alerts` | Alert rules with conditions and channels |
| `alert_history` | Alert trigger history |
| `logs` | Container log entries |

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `REDIS_URL` | No | redis://localhost:6379 | Redis connection string |
| `PORT` | No | 8001 | API server port |
| `HIAI_OBSERVE_API_KEY` | No | — | Default API key for testing |
| `CORS_ORIGIN` | No | false | Allowed CORS origin |
| `TELEGRAM_BOT_TOKEN` | No | — | Telegram notifications |
| `TELEGRAM_CHAT_ID` | No | — | Telegram chat for alerts |
| `DISCORD_WEBHOOK_URL` | No | — | Discord notifications |
| `SMTP_HOST` | No | — | Email notifications |
| `SMTP_PORT` | No | 587 | SMTP port |
| `SMTP_USER` | No | — | SMTP auth |
| `SMTP_PASS` | No | — | SMTP auth |
| `SMTP_FROM` | No | — | Sender address |

## Critic Guidelines

When reviewing this project:
- Do NOT suggest removing features or reducing scope
- Do NOT suggest switching from Bun/Elysia to Node/Express
- Do NOT suggest replacing PostgreSQL with SQLite
- Suggest improvements WITHIN the existing architecture
- Focus on: security hardening, performance optimization, test coverage, UX polish
