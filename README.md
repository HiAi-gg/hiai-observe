# HiAi Observe

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Stars](https://img.shields.io/github/stars/HiAi-gg/hiai-observe)](https://github.com/HiAi-gg/hiai-observe/stargazers)
[![npm](https://img.shields.io/npm/v/@hiai-gg/hiai-observe?logo=npm)](https://www.npmjs.com/package/@hiai-gg/hiai-observe)
[![npm downloads](https://img.shields.io/npm/dm/@hiai-gg/hiai-observe?logo=npm&label=downloads)](https://www.npmjs.com/package/@hiai-gg/hiai-observe)
[![Docker Pulls](https://img.shields.io/docker/pulls/vgalibov/hiai-observe)](https://hub.docker.com/r/vgalibov/hiai-observe)
[![CI](https://github.com/HiAi-gg/hiai-observe/actions/workflows/ci.yml/badge.svg)](https://github.com/HiAi-gg/hiai-observe/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/HiAi-gg/hiai-observe?sort=semver)](https://github.com/HiAi-gg/hiai-observe/releases)
[![Bun](https://img.shields.io/badge/Runtime-Bun_1.3-black?logo=bun&logoColor=white)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![OpenTelemetry](https://img.shields.io/badge/OpenTelemetry-OTLP-425CC7?logo=opentelemetry&logoColor=white)](https://opentelemetry.io)
[![Sentry-compatible](https://img.shields.io/badge/Sentry-SDK_compatible-FB4226?logo=sentry&logoColor=white)](https://docs.sentry.io)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Made with TypeScript](https://img.shields.io/badge/Made_with-TypeScript-blue.svg)](https://www.typescriptlang.org)

**Lightweight, fast, all-in-one observability under MIT license** — Sentry + Uptime Kuma + Beszel + Dozzle + LLM tracing in one container, < 512 MB RAM.

<img width="768" height="512" alt="aa1d3ede-e0c2-4377-b2a5-7707f4f42f61" src="https://github.com/user-attachments/assets/79905d16-ca4a-4cfd-9404-dd3cb1e0a3dc" />

**AI-native out of the box:** a built-in MCP server, CLI, agent skill, and TypeScript SDK ship in the same package, so any AI system (Claude Code, Cursor, Copilot, Mastra) can query, use, and integrate it immediately — no glue code.

Built for indie developers, small teams, and AI agents who want answers to three questions:

1. Is everything working?
2. What broke and why?
3. What are my agents actually doing?

## Why HiAi Observe

- **MIT + fully self-hosted** — your data never leaves your infrastructure, no AGPL / Polyform / SaaS lock-in
- **Replaces 5 popular tools** — error tracking (Sentry), uptime (Uptime Kuma), infrastructure (Beszel), logs (Dozzle), and AI tracing in one container
- **Single binary, single port** — one `docker compose up` gets you a full observability stack with zero external dependencies
- **Sentry SDK drop-in** — existing projects can switch by changing the DSN; no code rewrite
- **Mastra-first AI tracing** — native support for Mastra workflows, tools, agents, and token usage, plus generic OTLP for anything else
- **Built for small VPS** — runs comfortably on < 512 MB RAM, with a dedicated small-VPS env preset in `.env.example`
- **AI-native, batteries included** — built-in MCP server, CLI, agent skill, and TypeScript SDK in one package, so any AI system (Claude Code / Cursor / Copilot / Mastra) can query, use, and integrate it out of the box

## Supported Protocols

| Protocol | Status | Notes |
|---|---|---|
| **OpenTelemetry** (OTLP/HTTP) | ✅ | Traces + metrics over JSON; protobuf in `QW-OTLP-PROTO` |
| **Sentry SDK** | ✅ | Drop-in replacement, full envelope support |
| **OTLP Logs** | 🔜 | Ingestion endpoint planned (`PM-OTLP-LOGS`) |
| **Mastra** | ✅ | First-class, native exporters (`@hiai-gg/hiai-observe/mastra`) |
| **Model Context Protocol (MCP)** | ✅ | 9 read tools for AI agents (`@hiai-gg/hiai-observe`) |
| **OpenAPI** | ✅ | Spec at `GET /api/openapi.json` (no auth) |

<!-- ============================================ -->
<!-- 🖼️  SCREENSHOT #1: Hero / Splash              -->
<!-- File:          docs/screenshots/hero.png       -->
<!-- What to show: Main dashboard (light theme)    -->
<!--              — error rate, uptime, containers  -->
<!--              — AI cost panel, recent issues     -->
<!-- Dimensions:   1200x675 (16:9)                 -->
<!-- alt text:     "HiAi Observe unified dashboard showing error rate, uptime, container stats, and AI cost" -->
<!-- Insert here:  <img src="docs/screenshots/hero.png" width="100%" alt="HiAi Observe unified dashboard" /> -->
<!-- ============================================ -->

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

## Agentic Quickstart (AI-Powered Setup)

Don't want to run commands manually? Copy-paste one of these prompts into your AI assistant and let it do the work.

### OpenCode / Claude Code

```
Install HiAi Observe (https://github.com/HiAi-gg/hiai-observe) for me:
1. Clone the repo, copy .env.example to .env
2. Generate a secure API key with openssl rand -hex 24 and set it as HIAI_OBSERVE_API_KEY
3. Run docker compose up -d and verify health at http://localhost:8001/health
4. If the server has <512MB RAM, add the small VPS preset to .env:
   LOG_MAX_LINES_PER_SEC=100
   LOG_SAMPLE_RATE=0.1
   LOG_MAX_BUFFER_SIZE=1000
   LOG_BATCH_INTERVAL_MS=2000
   LOG_MAX_CONCURRENT_INSERTS=1
5. Integrate it into my existing project using the Mastra exporter, Sentry SDK, or OTLP — pick whichever matches my stack
6. Open http://localhost:8001 in browser and confirm the dashboard loads
```

### Cursor (Agent Mode)

```
Set up HiAi Observe as a self-hosted observability layer:
- Repo: https://github.com/HiAi-gg/hiai-observe
- Steps: clone → cp .env.example .env → generate API key → docker compose up -d
- For limited RAM servers, use the small VPS preset (LOG_MAX_LINES_PER_SEC=100, LOG_SAMPLE_RATE=0.1, etc.)
- Connect my existing TypeScript/Node.js app using either:
  a) @hiai-gg/hiai-observe/mastra for Mastra projects
  b) @sentry/node with DSN http://apikey@localhost:8001/1 for Sentry
  c) OTLPTraceExporter pointing to http://localhost:8001/v1/traces
- Verify: curl http://localhost:8001/health and open UI
```

### GitHub Copilot (Chat)

```
I want to add observability to my project. Install HiAi Observe locally:
1. Clone https://github.com/HiAi-gg/hiai-observe
2. Set up .env with a generated API key
3. Start with docker compose up -d
4. Add the integration to my codebase (choose based on what you see: Mastra, Sentry, or OpenTelemetry)
5. Confirm everything works
```

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

<img width="2539" height="1900" alt="Screenshot 2026-06-07 221755" src="https://github.com/user-attachments/assets/aa4f0596-f210-4688-8a56-0c6506374dfc" />

<img width="2522" height="1919" alt="Screenshot 2026-06-07 221501" src="https://github.com/user-attachments/assets/30c2dd4c-5419-495e-a44e-335038691e56" />

<img width="2530" height="1914" alt="Screenshot 2026-06-07 221528" src="https://github.com/user-attachments/assets/94f5e7df-2976-4637-a216-a31c77b0d51d" />

<img width="2527" height="1916" alt="Screenshot 2026-06-07 221704" src="https://github.com/user-attachments/assets/2eb19a1a-fc14-46a9-ab60-54f4aa46da24" />


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
import { HiaiObserveExporter } from "@hiai-gg/hiai-observe/mastra";

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

### AI Agents (MCP)

Agents query Observe more than humans do. The [`@hiai-gg/hiai-observe`](packages/hiai-observe)
[Model Context Protocol](https://modelcontextprotocol.io) server exposes the
read API as tools (`observe_dashboard`, `observe_ai_cost`, `observe_list_issues`,
`observe_uptime`, …) for Claude Code, Claude Desktop, or any MCP client:

```json
{
  "mcpServers": {
    "hiai-observe": {
      "command": "npx",
      "args": ["-y", "-p", "@hiai-gg/hiai-observe", "hiai-observe-mcp"],
      "env": { "HIAI_OBSERVE_URL": "http://localhost:8001", "HIAI_OBSERVE_API_KEY": "ho_your_key" }
    }
  }
}
```

Shell / Bash-tool agents can use the [`@hiai-gg/hiai-observe`](packages/hiai-observe)
instead — same data, no MCP setup:

```bash
HIAI_OBSERVE_API_KEY=ho_your_key npx @hiai-gg/hiai-observe dashboard
hiai-observe ai-cost --group-by model --json
```

Drop the [`skills/hiai-observe`](skills/hiai-observe) skill into your agent so it
knows *when* to consult Observe (before declaring a deploy healthy, after errors,
to track LLM spend). For code, use the [`@hiai-gg/hiai-observe`](packages/hiai-observe)
SDK or the OpenAPI spec at `GET /api/openapi.json`.

## API Endpoints

| Category | Endpoints | Auth |
|---|---|---|
| Health | GET `/health`, GET `/metrics` | Public |
| Sentry Ingestion | POST `/api/:projectId/store`, `/api/:projectId/envelope` | API Key |
| Agent Ingestion | POST `/api/agent/ingest` | API Key |
| OTLP | POST `/v1/traces`, POST `/v1/metrics` | API Key |
| Issues | GET `/api/issues`, GET `/api/issues/:id`, PATCH `/api/issues/:id`, POST `/api/issues/:id/merge`, DELETE `/api/issues/:id` | API Key |
| Events | GET `/api/events`, GET `/api/events/:id` | API Key |
| Comments | GET `/api/issues/:id/comments`, POST `/api/issues/:id/comments`, DELETE `/api/comments/:id` | API Key |
| Monitors | CRUD `/api/monitors`, GET `/api/monitors/groups`, GET `/api/monitors/:id/checks` | API Key |
| Status Page | GET `/api/status/:slug` (JSON), GET `/status/:slug` (HTML), GET `/api/status/:slug/history` | Public |
| Badges | GET `/api/badges/uptime/:slug/:id`, GET `/api/badges/incidents/:slug/:id` | Public |
| Infrastructure | GET `/api/infrastructure/containers`, `/api/infrastructure/hosts`, `/api/infrastructure/gpu`, `/api/infrastructure/containers/:id` | API Key |
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
├── packages/hiai-observe/         # @hiai-gg/hiai-observe (SDK + CLI + MCP + agent + Mastra)
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
| `bun run seed` | Seed demo data (destructive — wipes & recreates) |
| `bun run seed:extras [slug]` | Non-destructively add incidents/releases/team/etc. to one project (default `demo`) |
| `bun run reset` | Reset all data |
| `bun run gen-key` | Generate API key for a project |
| `bun run docker:prod` | Start production Docker stack |

## Known Limitations

- **Single process** — no clustering or worker threads. One Bun event loop handles everything. Sufficient for <50 req/sec.
- **No user accounts / SSO** — authentication is per-project API keys (Bearer token), not user logins or sessions. Keys are bcrypt-hashed at rest and carry RBAC roles (`admin` / `member` / `readonly`).
- **PostgreSQL only** — no ClickHouse or TimescaleDB. Partitioning is available for large datasets.
- **Docker socket required** — container monitoring and log streaming need `/var/run/docker.sock` (or a socket proxy) mounted.
- **No SMTP relay** — email notifications require an external SMTP server.
- **AI cost estimates are approximate** — built-in per-model prices are public list prices and drift over time; override them with `MODEL_PRICING` for accuracy.

## Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md) for the full, prioritized list of planned
work. Highlights:

- User accounts, SSO, and team permissions on top of the existing RBAC roles
- More uptime monitor types and notification channels (toward Uptime Kuma parity)
- A first-class multi-host agent with temperature/GPU metrics (toward Beszel parity)
- Deeper AI analytics: cost optimization, model comparison, eval/score ingestion
- Custom dashboard widgets and cross-project analytics

## Ecosystem

HiAi Observe is the official observability layer for:
- **HiAi-Kit** — default observability in new projects
- **HiAi-Dashboard** — built-in monitoring module
- Works standalone in any Bun/Elysia/Mastra/TypeScript project

## Production Deployment

For production setup with TLS, security hardening, and operational best practices, see [docs/production.md](docs/production.md).

## Changelog

Current: **v0.1.9** — first public release on all three channels:
[`@hiai-gg/hiai-observe`](https://www.npmjs.com/package/@hiai-gg/hiai-observe) on
npm (SDK + `hiai-observe` CLI + `hiai-observe-mcp` MCP server + `hiai-observe-agent`),
multi-arch Docker images at [`vgalibov/hiai-observe`](https://hub.docker.com/r/vgalibov/hiai-observe),
and tagged GitHub releases.

See [CHANGELOG.md](CHANGELOG.md) for the full history.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, code guidelines, and pull request process.

## Star History

If HiAi Observe saves you from a 3am pager, a ⭐ goes a long way.

[![Star History Chart](https://api.star-history.com/svg?repos=HiAi-gg/hiai-observe&type=Date)](https://star-history.com/#HiAi-gg/hiai-observe&Date)

## License

MIT — all code written from scratch with permissive licensing. No AGPL, Polyform, or restrictive dependencies. See [LICENSE](LICENSE).
