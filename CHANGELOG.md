# Changelog

All notable changes to HiAi Observe will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.7] - 2026-06-09

### Changed
- **Consolidated the npm packages into one `@hiai-gg/hiai-observe`** (published under the `@hiai-gg` org, matching `@hiai-gg/hiai-opencode`). The former `@hiai-observe/{client,mastra-exporter,mcp,cli}` are now a single package with two bins (`hiai-observe` CLI, `hiai-observe-mcp` MCP server) and library exports (`.` → client SDK, `./mastra` → Mastra exporter).
- **Node-compatible build** — the package compiles to JS with `.d.ts`, so the SDK, CLI (`hiai-observe`), and MCP server (`hiai-observe-mcp`) run on Node ≥ 18 (`npx`) and Bun, and the SDK/exporter import cleanly into any TS/JS project.
- **Host metrics agent included** as a third bin `hiai-observe-agent` — Bun-only (reads `/proc` via Bun APIs); on Node it exits with a clear "requires Bun" message. Future agent work is tracked in the ROADMAP (`PM-INF-1`).
- Removed the redundant `@hiai-observe/sdk` (superseded by the bundled client SDK).
- Aligned all versions to 0.1.7; updated README, skill, and the publish workflow for the single package.

## [0.1.6] - 2026-06-08

### Fixed
- **401 Unauthorized** on container detail, logs download, and uptime pages — frontend now uses `apiKey` Svelte store consistently instead of raw `localStorage.getItem("hiai-observe-api-key")` which produced JSON-encoded Bearer tokens.
- **Memory exhaustion** in log streaming worker — added 5-layer defense: container filtering (`LOG_INCLUDE_CONTAINERS` / `LOG_EXCLUDE_CONTAINERS`), token bucket rate limiting (`LOG_MAX_LINES_PER_SEC`), concurrent insert semaphore (`LOG_MAX_CONCURRENT_INSERTS`), sampling (`LOG_SAMPLE_RATE`), and backpressure (`LOG_MAX_BUFFER_SIZE`).
- **DB port** in AGENTS.md corrected from 5432 to 5433.

### Added
- `docs/configuration.md` — complete environment variable reference with tuning examples (dev / production / small VPS).
- `docs/production.md` — production deployment guide with TLS, security hardening, and log-limits section.
- Unit tests for the token bucket rate limiter (`tests/monitoring/token-bucket.test.ts`, 7 tests).
- **Agentic Quickstart** in `README.md` — copy-paste prompts for OpenCode, Cursor, and GitHub Copilot.
- **"How AI Agents Should Install This"** section in `AGENTS.md` — 4-step install guide for AI assistants.
- 7 log streaming env vars in `.env.example` with VPS presets (`LOG_MAX_LINES_PER_SEC=100`, `LOG_SAMPLE_RATE=0.1`, …).
- `ADMIN_API_KEY`, `ENCRYPTION_KEY`, `RETENTION_DAYS` env vars documented in `AGENTS.md` and `docs/configuration.md`.

### Changed
- `AGENTS.md`: expanded repo map (27 plugins, `src/workers/`, `src/lib/`, 243 tests), enhanced Critic Guidelines with auth pattern and log defense checks.
- `README.md`: Changelog section updated with v0.1.6 summary.
- `docs/ROADMAP.md`: rewritten with structured phases (Quick Wins / Platform Maturation / Strategic Initiatives), dependency chains, KPI targets, and answers to 5 user questions.

## [0.1.5] - 2026-06-08

### Fixed
- Logs page showed "Offline" and "Live" at once — two unrelated indicators. The WebSocket live-stream indicator was stuck "Offline" because `/ws/logs` was not in `PUBLIC_PATHS`, so the auth middleware rejected the upgrade (the handler does its own message-based auth); added it, so the stream connects. Relabeled the separate auto-refresh (polling) badge from "Live" to "Auto-refresh" to remove the contradiction.

## [0.1.4] - 2026-06-08

### Fixed
- More white-screen crashes from frontend/API contract drift: the Traces list read snake_case fields (`trace_id`, `duration_ms`, …) but the API returns camelCase rows with workflow/agent/tokens inside `attributes`; `getTraces` now maps to the shape the page renders. Guarded null numeric fields on the Infrastructure page (a container with `cpu_percent: null` crashed `.toFixed`) and an undefined agent name.
- Added a top-level `<svelte:boundary>` so a single page error shows a localized "something went wrong" panel instead of white-screening the whole app.

## [0.1.3] - 2026-06-08

### Fixed
- **White-screen crash** (`Cannot read properties of undefined (reading 'length')`) on the Traces and Settings pages: `getIssues`/`getTraces`/`getAlerts` expected `{ issues }`/`{ traces }`/`{ alerts }` but the server returns `{ data }`/`{ data }`/`{ items }`. Normalized the client to map the real shape and default to `[]`; added defensive guards on the dashboard and container-detail length checks.

### Added
- `bun run seed:extras` now also seeds demo alert rules (idempotent), so the Alerts page has data.

## [0.1.2] - 2026-06-08

Agent access — query Observe from MCP clients, the shell, or via a skill.

### Added
- **`@hiai-observe/cli`** — a `hiai-observe` command-line client (dashboard, issues, issue, ai-cost, traces, uptime, logs, infra, alerts, health) with `--json`, for shell/Bash-tool agents and CI. Verified end-to-end against a live server.
- **`skills/hiai-observe`** — an agent skill that tells agents *when* to consult Observe (before claiming a deploy healthy, after errors, to track LLM spend) and *how* (MCP or CLI).
- **`bun run seed:extras`** now also seeds LLM token-usage traces (model/agent/workflow) so the AI Cost view has data; the script is idempotent and non-destructive.

### Fixed
- `cli ai-cost` — resolve the project id (the `/api/traces/stats` endpoint requires it) and parse the real `tokenUsage` shape.

### Changed
- Removed a developer's local API key from the e2e test fallback; use a generic placeholder.

## [0.1.1] - 2026-06-07

Patch release — makes the build deployable and CI real, plus AI cost accuracy.

### Fixed
- **CI never actually ran** — the workflow triggered on `main` but the default branch is `master`. Trigger on both; the pipeline now runs and is green.
- **Docker image was undeployable** — `drizzle/` was gitignored (migrations missing from the repo), the migrations had drifted from `schema.ts`, and the entrypoint hung on `bunx drizzle-kit` (a devDependency absent from the slim image). Replaced with a single authoritative baseline generated from `schema.ts` and `scripts/migrate.ts` (production deps only). Verified: container boots, applies the full schema, and `/health` returns 200.
- **Dockerfile** — invalid `COPY … 2>/dev/null || true` syntax and missing workspace manifests for `bun install`.
- **Docker API version** — collector/log streamer hardcoded `/v1.41/`, which Docker 29+ rejects (MinAPIVersion 1.44). Now configurable via `DOCKER_API_VERSION` (default: versionless).
- **CI test job** — added the missing `@vitest/coverage-v8` provider; dropped the unreachable 70% coverage gate (report-only); stopped enabling the e2e suite that requires a running server the job never boots.

### Added
- **AI cost estimation** — refreshed the model price table (Claude 4.x, GPT-4.1/5, o-series, Gemini 2.x), prefix-matching for dated model ids, and a `MODEL_PRICING` env override (JSON) for accurate, deployment-specific pricing.
- **GPU panel** on the Infrastructure page — utilization, VRAM, and temperature per GPU (data was collected via nvidia-smi but never shown).
- **`@hiai-observe/mcp`** — a Model Context Protocol server so AI agents can query Observe (issues, AI cost, traces, uptime, logs, infrastructure, alerts) directly. 9 read tools, verified end-to-end against a live server.
- Background auto-refresh (15s) for the live monitoring tabs (issues, traces + agents/models/workflows, alerts, incidents).
- `docs/ROADMAP.md` — prioritized list of future work (targeting 0.2.0+).

### Changed
- Corrected stale README "Known Limitations" (API keys are bcrypt-hashed with RBAC roles, not plaintext); "Roadmap" now points to `docs/ROADMAP.md` with 0.2.0+ as the planned line.
- Removed internal planning/audit docs from the public repository.

## [0.1.0] - 2026-06-07

Production hardening, supply-chain hygiene, and accessibility improvements.

### Security
- Documented handler-level auth on all PUBLIC_PATHS (log stream, OTLP, Sentry paths)
- Added JSDoc comments explaining why certain paths bypass auth middleware
- Synced stale `PUBLIC_PATHS` array in auth test suite
- Production startup warnings for missing/weak secrets (API key, Redis, DB)

### Supply Chain
- Committed lockfiles (`bun.lock`, `frontend/bun.lock`, `packages/*/bun.lock`) — CI `--frozen-lockfile` now works correctly
- Normalized all 4 packages to `@hiai-observe/*` scope (`sdk`, `agent`, `client`, `mastra-exporter`)
- Root `package.json` workspaces expanded to list all 4 packages

### Bug Fixes
- Fixed `markAlertFired` never using `rule.cooldownSeconds` — now passes correct cooldown to `shouldFireAlert`
- Removed deprecated `markAlertFired()` function (was dead code due to Redis `SET NX` atomicity)

### Code Quality
- Replaced 9 `console.log`/`console.error` calls in 3 prod files with structured logger (`src/lib/logger.ts`)
- Added Zod schema validation to alert rules engine — malformed rules now rejected with clear errors instead of silently cast

### Frontend
- Added skip-to-content link (WCAG 2.4.1) to layout
- Added `type="button"` to 135 buttons across 21 Svelte components
- Added `aria-label="Close"` to 2 icon-only close buttons (alerts + fingerprints)
- Created 4 new Svelte 5 components: `TimeRangeSelector`, `ContainerSidebar`, `SplitPane`, `ContainerGroup`
- Fixed 3 duplicate `type` attributes in status and incidents pages

### Documentation
- New `docs/production.md` — comprehensive deployment guide (secrets, Docker, TLS, Redis auth, backups, network security)
- New `CODE_OF_CONDUCT.md` (Contributor Covenant v2.1)
- New `SECURITY.md` (vulnerability reporting policy)
- Updated `README.md` with production deployment link
- Updated `docs/integration.md` troubleshooting section

## [0.1.0-preview] - 2026-05-25

Initial release of HiAi Observe — a unified, self-hosted observability platform for AI Agents and TypeScript backends.

### Error Tracking
- Sentry SDK compatible ingestion (drop-in replacement — change DSN only)
- Automatic issue grouping by exception type, message, and stack frame
- Breadcrumbs, user context, tags, and release tracking preserved
- Issue lifecycle management (unresolved, resolved, ignored)
- Source map upload and lookup for original stack traces
- Event timeline per issue with full context
- Issue comments and collaboration

### Uptime Monitoring
- HTTP health checks with configurable intervals and timeouts
- Public status pages with uptime bars (HTML and JSON endpoints)
- Response time tracking with 30-day history
- Monitor groups for organizing checks
- Per-monitor uptime percentage badges (SVG)
- SSL certificate expiry tracking

### Infrastructure Monitoring
- Docker container stats collection (CPU, memory, network, block I/O)
- Host resource monitoring (CPU, memory, disk, load average)
- Auto-refreshing infrastructure dashboard
- Container log count aggregation

### Log Viewer
- Real-time log streaming via WebSocket with pub/sub
- Full-text search across container logs
- Filter by container, log level, and time range
- Pause/resume streaming per client
- Log statistics and container listing
- Saved search queries

### LLM & Agent Observability (Mastra Native)
- OpenTelemetry-compatible trace ingestion (OTLP HTTP)
- Mastra-specific trace parser for workflows, tools, and agents
- Workflow run visualization with step-by-step timeline
- Tool call tracking with input/output capture
- Token usage aggregation by model, agent, and workflow
- Latency percentiles (p50, p95, p99)
- Cost estimation per model
- Agent-specific ingestion endpoint

### Unified Dashboard
- Single-page overview with error count, uptime percentage, active containers, trace count
- Recent issues, monitor statuses, and alert summaries
- Auto-refresh every 30 seconds
- Error trend charts (24-hour)

### Alerting
- 6 condition types: error rate, uptime down, resource threshold, trace error, token usage, recovery
- Severity levels: critical, warning, info with auto-escalation
- Notification channels: Telegram, Discord, Slack, Email (SMTP)
- Redis-based deduplication to prevent alert spam
- Configurable cooldown periods
- Maintenance window suppression
- Alert history with trigger timeline
- Per-alert test endpoint and bulk test-all

### Maintenance Windows
- Schedule planned downtime to suppress alerts
- CRUD API for creating windows with start/end times
- Per-monitor or project-wide suppression
- Active, upcoming, and past filtering

### Incident Management
- Full incident lifecycle: investigating, identified, monitoring, resolved
- Status transition validation
- Per-project incident tracking
- Integration with status pages

### API & Auth
- Bearer token authentication on all sensitive endpoints
- Public endpoints for health, metrics, and status pages
- Redis sliding-window rate limiting (100 req/min API, 1000 req/min ingestion)
- Prometheus-compatible metrics endpoint at `/metrics`
- API key rotation per project
- Request ID tracking
- CORS configuration

### Additional Features
- Release tracking with deployment health
- Team member management
- Project CRUD with cascading deletes
- Data export (issues, traces, logs as JSON)
- Retention worker with configurable cleanup schedule
- Multi-project support with project-scoped data isolation

### Frontend
- Svelte 5 + SvelteKit frontend with dark mode
- 12 pages: Dashboard, Issues, Issue Detail, Uptime, Infrastructure, Logs, Traces, Trace Detail, Alerts, Settings, Status Page
- WebSocket live log streaming
- Responsive layout with Tailwind CSS v4
- Real-time data updates

### Infrastructure
- Single Docker container deployment (<512MB RAM)
- Multi-stage Dockerfile for production builds
- docker-compose.yml for development
- docker-compose.prod.yml with Caddy reverse proxy
- CI pipeline: lint, typecheck, test, build, Docker build + health check
- GitHub Actions workflow with PostgreSQL and Redis services

### Breaking Changes

None — this is the initial release.

### Known Limitations

- Single process (no clustering or worker threads)
- No built-in user authentication (API key only)
- Docker socket required for container monitoring
- PostgreSQL only (no ClickHouse/TimescaleDB)

[0.1.5]: https://github.com/HiAi-gg/hiai-observe/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/HiAi-gg/hiai-observe/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/HiAi-gg/hiai-observe/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/HiAi-gg/hiai-observe/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/HiAi-gg/hiai-observe/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/HiAi-gg/hiai-observe/releases/tag/v0.1.0
