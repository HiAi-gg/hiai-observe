# HiAi Observe — Architecture

## System Overview

```
                           ┌──────────────────────────────────────┐
                           │        HiAi Observe (single          │
                           │           container)                 │
                           │                                      │
 SDKs / OTLP / Browser     │  ┌─────────────────────────────────┐ │
 ─────────────────────────►│  │         Ingestion Layer          │ │
                           │  │  Sentry Ingest │ OTLP Receiver  │ │
                           │  └────────────┬────────────────────┘ │
                           │               │                      │
                           │  ┌────────────▼────────────────────┐ │
                           │  │        Processing Layer          │ │
                           │  │  Event Parser │ Trace Parser     │ │
                           │  │  Grouper     │ Token Aggregator  │ │
                           │  │  Latency Analyzer │ Rules Engine │ │
                           │  └────────────┬────────────────────┘ │
                           │               │                      │
                           │  ┌────────────▼────────────────────┐ │
                           │  │         Storage Layer            │ │
                           │  │     PostgreSQL  │     Redis      │ │
                           │  │  (persistent)   │  (real-time)   │ │
                           │  └────────────┬────────────────────┘ │
                           │               │                      │
                           │  ┌────────────▼────────────────────┐ │
                           │  │          API Layer               │ │
                           │  │  Elysia REST  │  WebSocket       │ │
                           │  │  35+ endpoints │  /ws/logs        │ │
                           │  └────────────┬────────────────────┘ │
                           │               │                      │
                           │  ┌────────────▼────────────────────┐ │
                           │  │        Frontend (SvelteKit)      │ │
                           │  │  Dashboard │ Issues │ Uptime     │ │
                           │  │  Logs │ Traces │ Infrastructure  │ │
                           │  └─────────────────────────────────┘ │
                           │                                      │
                           │  ┌─────────────────────────────────┐ │
                           │  │      Background Workers          │ │
                           │  │  Uptime Checker │ Alert Evaluator│ │
                           │  │  Log Streamer  │ Stats Collector │ │
                           │  └─────────────────────────────────┘ │
                           └──────────────────────────────────────┘
                                         │
                           ┌─────────────┴──────────────┐
                           │         Notifications       │
                           │  Telegram │ Discord │ Email │
                           └────────────────────────────┘
```

---

## Data Flow

### 1. Ingestion

Data enters HiAi Observe through three paths:

- **Sentry SDK** → `POST /api/:projectId/store` or `/envelope`
  - Sentry-compatible auth (Bearer, Basic, Sentry header)
  - Payload parsed by `sentry-parser.ts`
  - Events grouped by `grouper.ts` (fingerprint-based)

- **OpenTelemetry** → `POST /v1/traces` or `/v1/metrics`
  - OTLP JSON format (protobuf not supported in MVP)
  - Parsed by `otlp-parser.ts`
  - Spans stored directly in `traces` table

- **Mastra** → via OpenTelemetry with Mastra-specific attributes
  - Attributes like `mastra.workflow`, `mastra.tool`, `mastra.agent`
  - Parsed by `trace-parser.ts` into workflow runs, tool calls, agent interactions

### 2. Processing

After ingestion, data goes through processing:

- **Event Parser** (`sentry-parser.ts`) — extracts exception type, message, stack trace, breadcrumbs, user context, tags
- **Grouper** (`grouper.ts`) — fingerprints events by exception type + first in-app frame; creates or updates issues
- **Trace Parser** (`trace-parser.ts`) — identifies Mastra spans, builds span trees, extracts token usage
- **Token Aggregator** (`token-aggregator.ts`) — calculates costs per model (GPT-4, Claude, Gemini, etc.)
- **Latency Analyzer** (`latency-analyzer.ts`) — computes p50/p95/p99 per workflow step
- **Rules Engine** (`rules-engine.ts`) — evaluates alert conditions against current data

### 3. Storage

**PostgreSQL** (primary store):

| Table | Purpose | Retention |
|---|---|---|
| `projects` | API keys, project config | Permanent |
| `events` | Error events with context | Permanent |
| `issues` | Grouped errors with status | Permanent |
| `traces` | OpenTelemetry spans | Configurable |
| `uptime_monitors` | Monitor definitions | Permanent |
| `uptime_checks` | Check results | Configurable |
| `container_stats` | Docker container metrics | Configurable |
| `host_stats` | Server resource metrics | Configurable |
| `alerts` | Alert rule definitions | Permanent |
| `alert_history` | Alert trigger log | Configurable |
| `logs` | Container log entries | Configurable |

**Redis** (real-time layer):

- Pub/sub channels for live log streaming (`logs:{containerId}`)
- Recent log lists (last 10,000 per container)
- Alert cooldown tracking (`alert:cooldown:{alertId}`)
- Alert deduplication

### 4. API

The Elysia API layer exposes 35+ endpoints organized into 12 plugins:

| Plugin | Prefix | Endpoints |
|---|---|---|
| `healthPlugin` | `/` | Health check |
| `sentryIngestPlugin` | `/api` | Sentry SDK ingestion |
| `issuesPlugin` | `/api` | Issue CRUD |
| `eventsPlugin` | `/api` | Event queries |
| `monitorsPlugin` | `/api/monitors` | Uptime monitor CRUD |
| `statusPagePlugin` | `/api/status` | Public status pages |
| `infrastructureRoutes` | `/api/infrastructure` | Docker + host metrics |
| `logsPlugin` | `/api/logs` | Log search |
| `logsWsPlugin` | `/ws/logs` | Real-time log WebSocket |
| `otlpRoutes` | `/v1` | OTLP trace/metrics ingestion |
| `tracesRoutes` | `/api/traces` | Trace queries + stats |
| `alertsRoutes` | `/api/alerts` | Alert rule CRUD + history |

### 5. Frontend

SvelteKit frontend with 9 pages:

| Page | Route | Purpose |
|---|---|---|
| Dashboard | `/` | Overview: key metrics, recent errors, uptime status |
| Issues | `/issues` | Error list with filters and search |
| Issue Detail | `/issues/[id]` | Stack trace, breadcrumbs, resolve/ignore |
| Uptime | `/uptime` | Monitor cards with status and uptime % |
| Infrastructure | `/infrastructure` | Container stats, host CPU/memory/disk |
| Logs | `/logs` | Real-time stream, search, container filter |
| Traces | `/traces` | Workflow list with filters |
| Trace Detail | `/traces/[id]` | Waterfall timeline, token breakdown |
| Settings | `/settings` | API keys, alerts, notification channels |

### 6. Background Workers

| Worker | Interval | Purpose |
|---|---|---|
| Uptime Worker | 30s | HTTP checks on configured monitors |
| Alert Evaluator | 60s | Evaluate alert rules, fire notifications |
| Log Streamer | Continuous | Attach to Docker containers, stream stdout/stderr |
| Stats Collector | 30s | Collect Docker + host resource metrics |

---

## Database Schema

### Entity Relationships

```
projects (1) ──► (N) events
projects (1) ──► (N) issues
projects (1) ──► (N) traces
projects (1) ──► (N) uptime_monitors
projects (1) ──► (N) alerts

issues   (1) ──► (N) events

uptime_monitors (1) ──► (N) uptime_checks
alerts          (1) ──► (N) alert_history
```

### Table Details

**projects**
- `id` UUID PK
- `name` TEXT — display name
- `slug` TEXT UNIQUE — URL-safe identifier for status pages
- `api_key` TEXT UNIQUE — authentication key
- `created_at` TIMESTAMPTZ

**events**
- `id` UUID PK
- `project_id` UUID FK → projects
- `issue_id` UUID FK → issues (nullable)
- `message` TEXT
- `exception_type` TEXT — e.g., "TypeError"
- `stack_trace` TEXT — JSON array of stack frames
- `level` TEXT — "error", "info", "warning"
- `tags` JSONB — key-value pairs
- `context` JSONB — raw Sentry payload + parsed metadata
- `fingerprint` TEXT — event identifier
- `sdk` TEXT — "sentry.node@8.0.0"
- `created_at` TIMESTAMPTZ
- Indexes: project_id, issue_id, created_at

**issues**
- `id` UUID PK
- `project_id` UUID FK → projects
- `title` TEXT — human-readable error description
- `type` TEXT — "error", "message"
- `fingerprint` TEXT — grouping key
- `status` TEXT — "unresolved", "resolved", "ignored"
- `count` INTEGER — occurrence count
- `first_seen` TIMESTAMPTZ
- `last_seen` TIMESTAMPTZ
- `metadata` JSONB
- Indexes: project_id, fingerprint, status

**traces**
- `id` UUID PK
- `project_id` UUID FK → projects
- `trace_id` TEXT — OpenTelemetry trace ID
- `span_id` TEXT — OpenTelemetry span ID
- `parent_span_id` TEXT — parent span (nullable)
- `name` TEXT — span name
- `kind` TEXT — "INTERNAL", "SERVER", "CLIENT", "PRODUCER", "CONSUMER"
- `status` TEXT — "ok", "error", "unset"
- `start_time` TIMESTAMPTZ
- `end_time` TIMESTAMPTZ
- `duration_ms` INTEGER
- `attributes` JSONB — all span attributes
- `token_usage` JSONB — {prompt, completion, total}
- `model` TEXT — LLM model name
- `created_at` TIMESTAMPTZ
- Indexes: project_id, trace_id, start_time

**uptime_monitors**
- `id` UUID PK
- `project_id` UUID FK → projects
- `name` TEXT — display name
- `url` TEXT — HTTP endpoint to check
- `interval_seconds` INTEGER — check frequency (default 60)
- `active` BOOLEAN — whether to run checks
- `created_at` TIMESTAMPTZ
- `updated_at` TIMESTAMPTZ

**uptime_checks**
- `id` UUID PK
- `monitor_id` UUID FK → uptime_monitors
- `status_code` INTEGER — HTTP status (null if connection failed)
- `response_time_ms` INTEGER
- `error` TEXT — error message (null if successful)
- `success` BOOLEAN
- `checked_at` TIMESTAMPTZ
- Indexes: monitor_id, checked_at

**container_stats**
- `id` UUID PK
- `container_id` TEXT — Docker container ID
- `name` TEXT — container name
- `image` TEXT — Docker image
- `cpu_percent` REAL
- `memory_usage_mb` REAL
- `memory_limit_mb` REAL
- `network_rx_bytes` INTEGER
- `network_tx_bytes` INTEGER
- `block_read_bytes` INTEGER
- `block_write_bytes` INTEGER
- `status` TEXT — "running", "exited", etc.
- `uptime_seconds` INTEGER
- `collected_at` TIMESTAMPTZ
- Indexes: container_id, collected_at

**host_stats**
- `id` UUID PK
- `cpu_percent` REAL
- `memory_used_mb` REAL
- `memory_total_mb` REAL
- `memory_available_mb` REAL
- `disk_used_gb` REAL
- `disk_total_gb` REAL
- `load_avg_1m` REAL
- `load_avg_5m` REAL
- `load_avg_15m` REAL
- `collected_at` TIMESTAMPTZ
- Indexes: collected_at

**alerts**
- `id` UUID PK
- `project_id` UUID FK → projects
- `name` TEXT — alert rule name
- `condition` JSONB — {type, operator, threshold, duration}
- `channels` JSONB — [{type, target}]
- `is_active` BOOLEAN
- `cooldown_seconds` INTEGER (default 300)
- `last_triggered` TIMESTAMPTZ
- `created_at` TIMESTAMPTZ

**alert_history**
- `id` UUID PK
- `alert_id` UUID FK → alerts
- `triggered_at` TIMESTAMPTZ
- `resolved_at` TIMESTAMPTZ (nullable)
- `context` JSONB — condition result, current value, threshold
- Indexes: alert_id, triggered_at

**logs**
- `id` UUID PK
- `container_id` VARCHAR(128)
- `container_name` VARCHAR(256)
- `stream` VARCHAR(8) — "stdout" or "stderr"
- `message` TEXT
- `level` VARCHAR(16) — nullable
- `timestamp` TIMESTAMPTZ
- `raw` JSONB — original log entry
- Indexes: container_id, timestamp, (container_id, timestamp)

---

## Tech Stack

| Component | Technology | Version |
|---|---|---|
| Runtime | Bun | 1.3.14+ |
| API Framework | Elysia | 1.4.28+ |
| Database | PostgreSQL | 18+ |
| Cache / Pub-Sub | Redis | 8+ |
| ORM | Drizzle ORM | 0.45+ |
| Frontend | SvelteKit | 2.60+ |
| UI Framework | Svelte | 5.55+ |
| CSS | Tailwind CSS | v4 |
| Container | Docker | 24+ |
| Protocols | OpenTelemetry, Sentry SDK | — |

### Key Design Decisions

1. **Single container** — API, workers, and frontend bundled in one Docker image for simplicity. No orchestration needed for small deployments.

2. **Sentry SDK compatible** — Existing projects can switch by changing DSN only. No code changes required.

3. **OpenTelemetry native** — OTLP HTTP receiver for traces and metrics. Standard protocol, works with any OTel-compatible SDK.

4. **PostgreSQL for everything** — No ClickHouse or TimescaleDB for MVP. Partitioning by time range when needed. Revisit at scale.

5. **Redis for real-time** — Pub/sub for live log streaming. Cooldown tracking for alerts. Recent log cache.

6. **Bun-native** — Uses Bun-specific features (native fetch with unix sockets, Bun.file, Bun.spawn) for Docker and system monitoring. Bun types included in devDependencies.

7. **Mastra first-class** — Native parsing of Mastra workflow/tool/agent attributes. Token cost calculation with per-model pricing. Latency percentiles.

8. **No external dependencies for MVP** — No Grafana, Prometheus, Loki, or Sentry. Everything in one stack. Integration with external tools via OTLP export if needed later.
