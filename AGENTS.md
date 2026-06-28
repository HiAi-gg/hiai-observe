# hiai-observe — AGENTS.md

> **Роль:** модуль телеметрии (OTLP + Sentry), встраивается в `hiai-admin`, `hiai-dashboard`, `hiai-kit`, сайты (`webs` и др.). Unified self-hosted observability для AI-агентов и TypeScript backend-ов (replaces Bugsink + Uptime Kuma + Beszel + Dozzle + LLM tracing).
> **Статус:** готов (Wave 5 Platform Maturation — 11/14 items done)
> **Точка входа экосистемы:** [`projects/HIAI_INDEX.md`](../../projects/HIAI_INDEX.md)
> **Канонические правила:** [`docs/hiai-ecosystem/CONVENTIONS.md`](../../docs/hiai-ecosystem/CONVENTIONS.md)

## Cheat-sheet конвенций

- **Runtime:** Bun 1.3.14+ (no Node, no npm, no yarn)
- **Backend:** Elysia 1.4.28+ (ESM-only, single-container: API + workers + frontend)
- **Frontend:** Svelte 5.55+ + SvelteKit 2.60+ (`/frontend`, dark mode, WebSocket live updates)
- **UI:** `@hiai/ui` + shadcn-svelte (тема `.theme-observe`, OBS1)
- **ORM:** Drizzle ORM 0.45.2+ (23 tables, compound indexes)
- **Validation:** Zod 3.25+
- **Auth:** Better Auth + API key (Bearer) на всех чувствительных маршрутах; public для health/metrics/status
- **DB:** PostgreSQL 18+ (events, issues, traces, uptime history)
- **Cache:** Redis 8+ (pub/sub live log streaming, alert dedup, **3-bucket rate limiting** IP+API-key+Project)
- **Telemetry:** Sentry SDK (drop-in) + OTLP HTTP/JSON+protobuf (traces, metrics, **logs**)
- **Mastra native:** `HiaiObserveExporter` (`@hiai-observe/mastra-exporter`) — gen_ai.* dual naming, per-model pricing
- **Lint:** Biome 2.5+
- **Tests:** Vitest (500 passed / 35 skipped, coverage 27.25% threshold 25%)
- **Структура:** `src/api/` (32 Elysia route plugins) + `src/ingestion/` (Sentry/OTLP parsers) + `src/mastra/` + `src/middleware/` + `src/monitoring/` + `src/workers/` + `src/lib/` + `src/store/` + `src/alerts/` + `frontend/` + `drizzle/` (versioned SQL migrations) + `scripts/` + `tests/` + `docs/`
- **env только через** `src/lib/config.ts` (Zod-validated, emits `summarizeConfig()` banner at boot). `process.env` ЗАПРЕЩЁН где-либо ещё в `src/` — проверяется `grep -r 'process.env' src/ --include='*.ts' | grep -v config.ts`
- **Импорт токенов:** `@hiai/ui/styles/tokens.css` (OBS1: theme→`tokens.css`)
- **Порты:** API `8001` · frontend dev `5174` (Vite/SvelteKit) · example integration `8000`
- **Health check (canonical):** `GET /api/health` (DB+Redis+deps+workers); legacy `GET /health` сохранён для совместимости
- **Frontend dev auth:** Vite `define` + custom transform plugin инжектит `HIAI_OBSERVE_API_KEY` at build time — НИКОГДА `localStorage.getItem("hiai-observe-api-key")` напрямую (причина 401)
- **Log streaming 5-layer defense:** container filtering → sampling → token bucket rate limiting → backpressure → concurrent insert semaphore. Small-VPS preset (`LOG_MAX_LINES_PER_SEC=100`, `LOG_SAMPLE_RATE=0.1`, `LOG_MAX_BUFFER_SIZE=1000`, `LOG_BATCH_INTERVAL_MS=2000`, `LOG_MAX_CONCURRENT_INSERTS=1`) держит RAM ≤ ~50MB
- **Elysia middleware** для cross-route поведения требует `as: "global"` (иначе local-scoped и silent no-op)
- **No ClickHouse/TimescaleDB** — MVP на PG partitioning; ревизия в Wave 6 SI-CLICKHOUSE
- **MIT only:** весь код написан с нуля, без AGPL/Polyform зависимостей
- **English-only в коде/комментариях/README/AGENTS.md** (zero Russian)

## Индекс проектных документов

### Core
- `README.md` — обзор, quick start, интеграция (Mastra / Sentry / OTLP)
- `AGENTS.md` — этот файл: правила + указатель на канонические документы + индекс документов
- `todo.md` — живой статус задач (Wave 5/6 backlog)
- `CHANGELOG.md` — история релизов (v0.1.9 active)
- `RELEASE_PROCESS.md` — процесс релиза
- `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md` — стандартные OSS

### Канонические ссылки (читать первыми)
- [`projects/HIAI_INDEX.md`](../../projects/HIAI_INDEX.md) — единая точка входа в стратегию и правила экосистемы
- [`docs/hiai-ecosystem/CONVENTIONS.md`](../../docs/hiai-ecosystem/CONVENTIONS.md) — **правила и топология** (§1 стек, §2 структура, §3 порты, §4 дизайн-токены, §5 auth/RBAC, **§6 plugin/embed-контракт** — observe как embeddable)
- [`docs/hiai-ecosystem/ARCHITECTURE.md`](../../docs/hiai-ecosystem/ARCHITECTURE.md) — архитектура (роли host/module, карта подключений observe)
- [`docs/hiai-ecosystem/PORTS.md`](../../docs/hiai-ecosystem/PORTS.md) — реестр портов (observe = 8001)
- [`docs/hiai-ecosystem/DESIGN_SYSTEM.md`](../../docs/hiai-ecosystem/DESIGN_SYSTEM.md) — дизайн-токены и `@hiai/ui` контракт (`@hiai/ui` тема `.theme-observe`)
- [`docs/hiai-ecosystem/PLUGIN_CONTRACT.md`](../../docs/hiai-ecosystem/PLUGIN_CONTRACT.md) — контракт plugin/embed-контракта

### Project-specific (root + docs/)
- `plugin.json` — манифест плагина (OBS2: подключение в host-ы)
- `AUDIT_2026-06-20.md` — последний аудит (historical)
- `PLAN_UNIFIED_2026-06-20.md`, `UPDATES_SUMMARY.md`, `CHANGES_VERIFIED.md` — планы и верификация (reference/historical)
- [`docs/EMBED.md`](docs/EMBED.md) — **embed-контракт**: как host-ы встраивают observe (per-tenant/per-site scope, admin-bridge, tenant-health)
- [`docs/api.md`](docs/api.md) — REST API reference (32 endpoints)
- [`docs/architecture.md`](docs/architecture.md) — внутренняя архитектура (ingestion, store, alerts)
- [`docs/integration.md`](docs/integration.md) — гайд интеграции (Mastra/Sentry/OTLP)
- [`docs/configuration.md`](docs/configuration.md) — конфигурация (env vars, small-VPS preset)
- [`docs/production.md`](docs/production.md) — production deployment
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — Wave 0–6
- [`docs/AUTH_BRIDGE.md`](docs/AUTH_BRIDGE.md), [`docs/agent-protocol.md`](docs/agent-protocol.md), [`docs/backup.md`](docs/backup.md) — справочные

### Унаследованные ссылки (root-level, legacy pointer)
- [`../HIAI_CONVENTIONS.md`](../HIAI_CONVENTIONS.md) — правила, plugin contract §6
- [`../../docs/archive/HIAI_ECOSYSTEM_UNIFICATION_PLAN.md`](../../docs/archive/HIAI_ECOSYSTEM_UNIFICATION_PLAN.md) — U3 (observe as embeddable)
- [`../../docs/archive/HIAI_PROJECTS_ROADMAP.md`](../../docs/archive/HIAI_PROJECTS_ROADMAP.md) — **проектный план, секция "hiai-observe", фазы OBS1–OBS2**
- [`../../docs/archive/HIAI_UI_PACKAGE_PLAN.md`](../../docs/archive/HIAI_UI_PACKAGE_PLAN.md) — `@hiai/ui`: контракт потребления + тема `.theme-observe`
- [`../../packages/hiai-ui/README.md`](../../packages/hiai-ui/README.md) — `@hiai/ui`: контракт потребления

> **Примечание:** Этот файл (`AGENTS.md`) и `todo.md` добавлены в `.gitignore` и не коммитятся.
> Они содержат оперативные инструкции для агентов и могут меняться без review.

---

# HiAi Observe — Agent Operating Instructions

## Source of Truth (read first)

HiAi Observe — part of the HiAi ecosystem. Role: **shared telemetry module** (OTLP + Sentry), connects to sites, admin, dashboard, kit. Considered ready — for the ecosystem, only unification and integration (embed contract) matter.

**Shared truth lives in the `projects/` root:**
- [`../HIAI_CONVENTIONS.md`](../HIAI_CONVENTIONS.md) — rules, topology, plugin contract §6.
- [`../../docs/archive/HIAI_ECOSYSTEM_UNIFICATION_PLAN.md`](../../docs/archive/HIAI_ECOSYSTEM_UNIFICATION_PLAN.md) — U3 (observe as embeddable module).
- [`../../packages/hiai-ui/README.md`](../../packages/hiai-ui/README.md) — **@hiai/ui**: consumption contract + observe theme `.theme-observe`; plan — [`../../docs/archive/HIAI_UI_PACKAGE_PLAN.md`](../../docs/archive/HIAI_UI_PACKAGE_PLAN.md).
- [`../../docs/archive/HIAI_PROJECTS_ROADMAP.md`](../../docs/archive/HIAI_PROJECTS_ROADMAP.md) — **project plan (section "hiai-observe", phases OBS1–OBS2)**.

**What's next (only unification/integration):** OBS1 — theme→`tokens.css`, consuming `@hiai/ui` →
OBS2 — `docs/EMBED.md`, plugin manifest, per-tenant/per-site scope, embed in admin/dashboard.

### Project Documents (index; everything except core is reference/historical)
| Document | Purpose | Status |
|---|---|---|
| `README.md` · `AGENTS.md` (this) · `todo.md` | overview · rules · live status | core |
| `PLAN_TO_10.md`, `PARITY_REPORT.md` | plans/parity (donor for todo) | reference |
| `AUDIT_2026-05-25.md`, `A11Y_AUDIT.md`, `PERF_AUDIT.md` | audits | historical |
| `RELEASE_PROCESS.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md` | process/standard | core/reference |

## Identity & Purpose

Unified, self-hosted observability platform for AI Agents and TypeScript backends. Replaces Bugsink + Uptime Kuma + Beszel + Dozzle + basic LLM tracing with one lightweight container.

**What agents should know before working here:**
- Production status: **v0.1.9 — in active Wave 5 Platform Maturation (11/14 items done)**
- Sentry SDK compatibility is a hard requirement for error tracking (drop-in replacement)
- Mastra native integration is the differentiator — traces, workflows, tools, token usage, latency
- Must run comfortably on small VPS (<512MB RAM target)
- MIT license — all code written from scratch, no AGPL/Polyform dependencies
- Auth middleware protects all sensitive routes (Bearer token); per-project rate limits layered with IP and API-key buckets
- Rate limiting via Redis sliding window (IP + API-key + Project, defense-in-depth)
- **Log streaming uses 5-layer defense:** container filtering → sampling → token bucket rate limiting → backpressure → concurrent insert semaphore
- **Configuration:** all env access centralized in `src/lib/config.ts` (Zod-validated, 0 `process.env` elsewhere in `src/`)
- **Frontend dev auth:** Vite `define` + custom transform plugin injects `HIAI_OBSERVE_API_KEY` at build time — never use `localStorage.getItem(...)` directly in frontend code

## Runtime Contract

- **Stack:** Bun 1.3.14+, Elysia 1.4.28+, PostgreSQL 18+, Redis 8+, Svelte 5.55+
- **Key ports:** 8001 (API), 5174 (frontend dev via Vite/SvelteKit), 8000 (example app integration)
- **Health check:** canonical path is `GET /api/health` (HiAi ecosystem contract — DB+Redis+deps+workers). `GET /health` is a legacy alias kept for backwards compatibility with existing monitors, Sentry DSN healthchecks, and Docker healthchecks. `curl -fsS http://localhost:8001/api/health`
- **Database:** `psql -h localhost -p 5433 -U observe -d hiai_observe`
- **Frontend dev:** `http://localhost:5174` (when running `bun run dev`)
- **Metrics:** `curl http://localhost:8001/metrics` (Prometheus format)

## Execution Status (2026-06-20)

| Wave | Scope | Status |
|---|---|---|
| Wave 0 | P0 fixes (Drizzle regen, pre-commit, version bump) | ✅ Complete |
| Wave 1 | Docs sync + 16 endpoints + QW-OTLP-PROTO | ✅ Complete |
| Wave 2 | OBS0 — Zod 3.25+, `src/lib/config.ts`, `/api/health` alias | ✅ Complete |
| Wave 3 | OBS1 — `@hiai/ui` theme/component unification | ✅ Complete |
| Wave 4 | OBS2 — `EMBED.md`, plugin manifest, tenant filter, tenant-health | ✅ Complete |
| Wave 5 | Platform Maturation (14 items) | 🟡 **11/14** (remaining: CI-E2E, PM-INF-1, PM-RBAC) |
| Wave 6 | Strategic Initiatives | ⏸ Not started |

**Quality gates:** `tsc --noEmit` 0 errors · `bunx vitest run` **500 passed / 35 skipped** (535 total) · coverage **27.25% lines** (threshold 25%) · `bun build` 2.15 MB / 630 modules.

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
| `src/api/` | 32 Elysia route plugins (incl. embed, admin-bridge, tenant-health, search, badges, fingerprint-rules) |
| `src/ingestion/` | Sentry-compatible parser, OTLP parser, issue grouper |
| `src/mastra/` | Trace parser, token aggregator, latency analyzer (gen_ai.* dual naming, per-model pricing) |
| `src/middleware/` | Auth, Prometheus metrics, Redis rate limiter (IP+API-key+Project), request-id, tenant-scope |
| `src/monitoring/` | Docker/host/GPU collectors, uptime worker, log streamer |
| `src/monitoring/checks/` | Per-protocol check modules: http, tcp, dns, ping, grpc, cert |
| `src/workers/` | Retention cleanup, maintenance scheduler, alert worker, health |
| `src/lib/` | Auth helpers, RBAC, logger, **config.ts (Zod-validated, 0 process.env elsewhere)**, errors |
| `src/store/` | PostgreSQL + Redis data layer (Drizzle ORM, 23 tables, compound indexes) |
| `src/alerts/` | Alert rules engine (5 condition types + recovery), dedup, dispatcher, 10 notifiers |
| `frontend/` | Svelte 5 + SvelteKit 2.60+ (port 5174), 10 pages, dark mode, WebSocket live updates |
| `drizzle/` | Versioned SQL migrations (`0000_initial.sql`, `0001_per_project_rate_limit.sql`) |
| `scripts/` | Seed demo data, reset, generate API keys, backup, partition tables |
| `tests/` | 41 test files (500 passed / 35 skipped) |
| `docs/` | API reference, integration guide, architecture overview, configuration, EMBED, production, ROADMAP |
| `.github/workflows/` | CI pipeline (lint, typecheck, test, build, Docker) |

## Architecture Decisions

- **Single container** — API + workers + frontend in one Docker image for simplicity
- **Sentry SDK compatible** — existing projects can switch by changing DSN only
- **OpenTelemetry native** — OTLP HTTP receiver for traces, metrics, **and logs** (JSON + protobuf)
- **PostgreSQL for persistence** — events, issues, traces, uptime history, 23 tables with compound indexes
- **Redis for real-time** — pub/sub for live log streaming, alert dedup, rate limiting (3-bucket), caching
- **No ClickHouse/TimescaleDB** — MVP uses PG with partitioning; revisit at scale (planned in Wave 6 SI-CLICKHOUSE)
- **Auth via API key** — Bearer token on all sensitive routes; public endpoints for health/metrics/status
- **Config via Zod** — single `src/lib/config.ts` source of truth, validated at module load; emits structured `summarizeConfig()` banner at boot
- **N+1 prevention** — batch queries (getUptimePercentages), parallel Promise.all for infra collection
- **3-bucket rate limiting** — IP + API-key + Project apply simultaneously; effective limit is the tightest; fail-open on DB errors

## How AI Agents Should Install This

If you (an AI agent) are setting up HiAi Observe for a user, follow these steps exactly:

### Step 1: Clone and Configure

```bash
git clone https://github.com/HiAi-gg/hiai-observe.git
cd hiai-observe
cp .env.example .env
```

Generate an API key for the default admin project:
```bash
openssl rand -hex 24
```

Paste it into `.env` as `HIAI_OBSERVE_API_KEY=ho_...`. This becomes the Bearer token AND the Sentry DSN password.

### Step 2: Start with Docker

```bash
docker compose up -d
```

Verify: `curl -fsS http://localhost:8001/api/health` should return `{ "status": "ok" }` (or use legacy `curl -fsS http://localhost:8001/health` — both return identical JSON).

### Step 3: Integrate into the User's Project

Choose one integration path:

**Mastra (recommended for AI agents):**
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

**Sentry SDK (existing projects):**
```ts
import * as Sentry from "@sentry/node";
Sentry.init({ dsn: "http://apikey@localhost:8001/1" });
```

**OpenTelemetry (generic):**
```ts
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
const exporter = new OTLPTraceExporter({ url: "http://localhost:8001/v1/traces" });
```

### Step 4: Verify End-to-End

1. Open `http://localhost:8001` — UI loads with dark mode
2. Trigger an error in the user's app — appears in Issues within 5 seconds
3. Check `/api/dashboard` — metrics populate

### Small VPS Preset (<512MB RAM)

If the user's server has limited memory, add these to `.env`:

```bash
LOG_MAX_LINES_PER_SEC=100
LOG_SAMPLE_RATE=0.1
LOG_MAX_BUFFER_SIZE=1000
LOG_BATCH_INTERVAL_MS=2000
LOG_MAX_CONCURRENT_INSERTS=1
```

This caps log worker memory to ~50MB while preserving all error tracking and uptime monitoring.

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

## Database Schema (23 Tables)

| Table | Purpose |
|---|---|
| `projects` | API keys, project metadata |
| `issues` | Grouped errors with fingerprint, status, count |
| `events` | Individual error events with stack traces |
| `traces` | OTLP spans (workflows, tools, agents) |
| `uptime_monitors` | HTTP/TCP/DNS/Ping/gRPC check configurations |
| `uptime_checks` | Check results with response times |
| `container_stats` | Docker container metrics |
| `host_stats` | Server CPU/memory/disk metrics |
| `alerts` | Alert rules with conditions and channels |
| `alert_history` | Alert trigger history |
| `logs` | Container + OTLP log entries (stream='stdout'/'stderr'/'otel') |
| `team_members` | Team member management |
| `releases` | Release tracking with deployment health |
| `issue_comments` | Issue comments and collaboration |
| `fingerprint_rules` | Custom fingerprinting rules |
| `saved_searches` | Saved search queries |
| `status_subscribers` | Status page subscribers |
| `gpu_stats` | GPU utilization, VRAM, temperature |
| `host_info` | Host information and metadata |
| `notification_config` | Per-project notification channel config |
| `retention_config` | Per-table retention policy overrides |
| `maintenance_windows` | Scheduled downtime windows |
| `incidents` | Incident lifecycle tracking |

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
| `ADMIN_API_KEY` | No | — | Admin-only endpoints (retention, cleanup) |
| `ENCRYPTION_KEY` | No | — | Encrypt sensitive data at rest |
| `RETENTION_DAYS` | No | 30 | How long to keep logs, events, traces |
| `LOG_MAX_LINES_PER_SEC` | No | 1000 | Per-container token bucket rate limit |
| `LOG_MAX_BUFFER_SIZE` | No | 10000 | Max buffered log entries before backpressure |
| `LOG_BATCH_INTERVAL_MS` | No | 500 | Flush interval for log batch inserts |
| `LOG_SAMPLE_RATE` | No | 1.0 | Fraction of logs to keep (1.0 = 100%) |
| `LOG_MAX_CONCURRENT_INSERTS` | No | 3 | Max parallel DB insert operations |
| `LOG_INCLUDE_CONTAINERS` | No | — | Comma-separated allowlist (takes priority over exclude) |
| `LOG_EXCLUDE_CONTAINERS` | No | — | Comma-separated denylist |

## Critic Guidelines

When reviewing this project:
- Do NOT suggest removing features or reducing scope
- Do NOT suggest switching from Bun/Elysia to Node/Express
- Do NOT suggest replacing PostgreSQL with SQLite
- Suggest improvements WITHIN the existing architecture
- Focus on: security hardening, performance optimization, test coverage, UX polish
- **CRITICAL:** Verify frontend auth uses `apiKey` store (from `stores.svelte.ts`) — NEVER raw `localStorage.getItem("hiai-observe-api-key")` (causes 401 due to JSON encoding). For dev mode, the Vite `define` + transform plugin in `frontend/vite.config.ts` injects `HIAI_OBSERVE_API_KEY` at build time — do not break this contract.
- **CRITICAL:** For production deployments, check that log worker 5-layer defense is configured: `LOG_MAX_LINES_PER_SEC`, `LOG_SAMPLE_RATE`, `LOG_MAX_BUFFER_SIZE`, `LOG_BATCH_INTERVAL_MS`, `LOG_MAX_CONCURRENT_INSERTS`
- **CRITICAL:** New env vars MUST go through `src/lib/config.ts` (Zod) — `process.env` is forbidden anywhere else in `src/` (verified by `grep -r 'process.env' src/ --include='*.ts' | grep -v config.ts`).
- **CRITICAL:** Elysia middleware hooks that must fire across all routes require `as: "global"` (otherwise they're local-scoped and silently no-op on parent routes).
- Check that new env vars added in code are also documented in `docs/configuration.md` and `.env.example`
- Check that new tables/columns are accompanied by a new drizzle migration under `drizzle/`

## Wave 5 Platform Maturation (active)

11/14 items done. Remaining work targets the critical path:
- **CI-E2E** — dedicated end-to-end CI job with PostgreSQL + Redis service containers, full ingest → query → alert path
- **PM-INF-1** (3d) — mature multi-host agent with GPU metrics, signed enrollment, health-ping loop
- **PM-RBAC** (1–2 wks, critical path) — multi-tenant role-based access control: `super_admin` / `tenant_admin` / `staff` / `readonly` roles, scoped to per-tenant queries

Completed Wave 5 items: QW-DRIZZLE-REGEN, QW-ZOD (config validation), QW-LOG-DOWNLOAD, QW-MODEL-PRICING, coverage threshold 25%, OTLP logs endpoint, per-project rate limits (3-bucket layering), 99 API route tests, AI enrichment (gen_ai.* dual naming), TCP port monitoring, startup config banner.
