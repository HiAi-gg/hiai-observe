# HiAi Observe — План к 10/10 паритету

> Based on 5 critic findings (2026-05-25). Current: 5-7.5/10 per dimension. Target: 10/10 everywhere.

## Current State

| Dimension | Score | Gap |
|-----------|-------|-----|
| vs Bugsink (error tracking) | 5/10 | releases, fingerprint rules, assignment, cross-project search |
| vs Uptime Kuma (uptime) | 4/10 | DNS/ICMP/keyword, 90+ providers, custom HTTP, badges, SSL cert |
| vs Beszel (infra) | 5.5/10 | multi-host, GPU, process-level, time ranges, system info |
| vs Dozzle (logs) | 5.5/10 | ANSI colors, multi-host, fuzzy search, volume graphs, split pane |
| Overall quality | 7.5/10 | frontend tests, API key hashing, logging, client SDK, OpenAPI |

---

## Phase 17: Error Tracking → 10/10 (vs Bugsink)

**Effort:** XL (~30h)

### 17A: Release Management (12h)

- [ ] **17A-1. Releases table + API** — `src/store/schema.ts`, `src/api/releases.ts`
  - Table: `releases(id, projectId, version, environment, createdAt, deployedAt)`
  - CRUD API: POST create, GET list, GET detail, PUT update (deployedAt)
  - Parse `release` from Sentry events and link to release record
  - Effort: 3h

- [ ] **17A-2. Per-release issue filtering** — `src/api/issues.ts`
  - Filter issues by `release` field (first seen in which release)
  - Show "introduced in release X" badge on issue detail
  - Effort: 2h

- [ ] **17A-3. Release health** — `src/api/releases.ts`
  - New issues count per release (issues first seen after release.deployedAt)
  - Error rate per release (events count / time since deploy)
  - Health score: green (<1% error rate), yellow (<5%), red (>5%)
  - Effort: 3h

- [ ] **17A-4. Auto-resolve on next release** — `src/alerts/rules-engine.ts`
  - When a new release is deployed, auto-resolve issues that haven't been seen in the new release
  - Configurable per-project: auto-resolve enabled/disabled
  - Effort: 2h

- [ ] **17A-5. Releases UI** — `frontend/src/routes/releases/+page.svelte`
  - List releases with health badges, new issue count, deploy time
  - Release detail: issues introduced, error rate chart
  - Effort: 2h

### 17B: Issue Assignment & Collaboration (6h)

- [ ] **17B-1. Team members table + API** — `src/store/schema.ts`, `src/api/team.ts`
  - Table: `teamMembers(id, projectId, name, email, role, createdAt)`
  - CRUD API for team members
  - Effort: 2h

- [ ] **17B-2. Issue assignment** — `src/api/issues.ts`
  - `assignedTo` field on issues (FK to teamMembers)
  - PATCH /issues/:id/assign endpoint
  - Filter issues by assignee
  - Effort: 1.5h

- [ ] **17B-3. Issue comments** — `src/store/schema.ts`, `src/api/comments.ts`
  - Table: `issueComments(id, issueId, authorName, body, createdAt)`
  - CRUD: POST create, GET list (paginated), DELETE
  - Effort: 1.5h

- [ ] **17B-4. Assignment + comments UI** — `frontend/src/routes/issues/[id]/+page.svelte`
  - Assignee dropdown in issue detail sidebar
  - Comments section below events
  - Effort: 1h

### 17C: Advanced Filtering & Search (8h)

- [ ] **17C-1. Environment filtering** — `src/api/issues.ts`, `src/api/events.ts`
  - `environment` stored in issue metadata (already parsed from Sentry)
  - Add `?environment=production` query param to issues/events list
  - Filter tabs in issues UI: All / Production / Staging / Dev
  - Effort: 2h

- [ ] **17C-2. Cross-project search** — `src/api/search.ts` (new)
  - `GET /api/search?q=TypeError&projectId=all` — search across all projects
  - Full-text search on issue title + event message
  - Results grouped by project
  - Effort: 3h

- [ ] **17C-3. Server-side fingerprint rules** — `src/store/schema.ts`, `src/api/fingerprint-rules.ts`
  - Table: `fingerprintRules(id, projectId, pattern, groupBy, createdAt)`
  - Pattern: regex on exception message or type
  - groupBy: what to use as fingerprint (message, type, custom)
  - Applied in `grouper.ts` after SDK fingerprint check
  - Effort: 3h

### 17D: Level & Fingerprint Alerting (4h)

- [ ] **17D-1. Level filtering in issues UI** — `frontend/src/routes/issues/+page.svelte`
  - Filter by error/warning/info level
  - Effort: 1h

- [ ] **17D-2. Fingerprint-scoped alerts** — `src/alerts/rules-engine.ts`
  - New condition type: `new_error` — fires when a NEW fingerprint appears
  - New condition type: `error_recurrence` — fires when a SPECIFIC fingerprint recurs N times
  - Effort: 3h

---

## Phase 18: Uptime Monitoring → 10/10 (vs Uptime Kuma)

**Effort:** XL (~35h)

### 18A: Monitor Types (12h)

- [ ] **18A-1. DNS monitoring** — `src/monitoring/checks/dns-check.ts`
  - Check A/AAAA/CNAME/MX/TXT/NS records
  - Configurable: record type, expected value, resolver
  - Use `bun:dns` or `dns.promises`
  - Effort: 3h

- [ ] **18A-2. ICMP ping monitoring** — `src/monitoring/checks/ping-check.ts`
  - Latency measurement via ICMP
  - Fallback to TCP ping if ICMP unavailable (no root)
  - Effort: 2h

- [ ] **18A-3. Keyword assertion** — `src/monitoring/checks/http-check.ts`
  - Add `keyword` field to monitors: body must contain string
  - Add `keywordNot` field: body must NOT contain string
  - Effort: 1h

- [ ] **18A-4. Custom HTTP configuration** — `src/monitoring/checks/http-check.ts`
  - Method: GET/POST/PUT/DELETE/HEAD/PATCH
  - Custom headers (JSON object)
  - Custom body (string)
  - Basic Auth / Bearer token
  - Ignore SSL errors flag
  - Max redirects configurable
  - Effort: 3h

- [ ] **18A-5. gRPC monitoring** — `src/monitoring/checks/grpc-check.ts`
  - gRPC health check protocol (grpc.health.v1.Health)
  - Configurable: service name, deadline
  - Effort: 3h

### 18B: SSL Certificate Monitoring (4h)

- [ ] **18B-1. Real TLS cert extraction** — `src/monitoring/checks/cert-check.ts`
  - Use `tls.connect()` to get peer certificate
  - Extract: issuer, validFrom, validTo, daysRemaining, subject
  - Store in `uptime_checks` table
  - Effort: 2h

- [ ] **18B-2. Cert expiry alerts** — `src/alerts/rules-engine.ts`
  - New condition type: `cert_expiry` — fires when cert expires in N days
  - Configurable threshold per alert rule
  - Effort: 1h

- [ ] **18B-3. Cert info in UI** — `frontend/src/routes/uptime/+page.svelte`
  - Show cert expiry badge on monitor cards
  - Show cert details in monitor detail
  - Effort: 1h

### 18C: Status Page Enhancement (10h)

- [ ] **18C-1. Custom domain support** — `src/api/status-page.ts`, Caddy config
  - `customDomain` field on projects
  - Caddy virtual host config generated from DB
  - Effort: 3h

- [ ] **18C-2. Custom branding** — `src/api/status-page.ts`
  - Logo URL, title, description, footer text fields on project
  - Render in status-page-html.ts
  - Effort: 2h

- [ ] **18C-3. Status badges (SVG)** — `src/api/badges.ts` (new)
  - `GET /api/badges/:slug/status` — SVG badge (up/down/degraded)
  - `GET /api/badges/:slug/uptime` — SVG badge with uptime %
  - Embeddable in READMEs
  - Effort: 2h

- [ ] **18C-4. Subscriber notifications** — `src/store/schema.ts`, `src/api/subscribers.ts`
  - Table: `statusSubscribers(id, projectId, email, createdAt)`
  - POST /api/status/:slug/subscribe
  - Send email on incident create/update/resolve
  - Effort: 3h

### 18D: Notification Providers (9h)

- [ ] **18D-1. Generic webhook** — `src/alerts/notifiers/webhook.ts`
  - POST JSON payload to configurable URL
  - Headers: X-Hiai-Signature (HMAC-SHA256)
  - Effort: 1.5h

- [ ] **18D-2. PagerDuty** — `src/alerts/notifiers/pagerduty.ts`
  - Events API v2 integration
  - routing_key from notification config
  - Effort: 1.5h

- [ ] **18D-3. Microsoft Teams** — `src/alerts/notifiers/teams.ts`
  - Incoming webhook connector
  - Adaptive Card format
  - Effort: 1.5h

- [ ] **18D-4. ntfy.sh** — `src/alerts/notifiers/ntfy.ts`
  - HTTP POST to ntfy.sh topic
  - Effort: 1h

- [ ] **18D-5. Gotify** — `src/alerts/notifiers/gotify.ts`
  - POST to Gotify server with priority
  - Effort: 1h

- [ ] **18D-6. Pushover** — `src/alerts/notifiers/pushover.ts`
  - POST to Pushover API with priority/sound
  - Effort: 1h

- [ ] **18D-7. Add all providers to VALID_CHANNELS** — `src/api/notifications.ts`
  - Update validation, env config, test dispatch
  - Effort: 1.5h

---

## Phase 19: Infrastructure → 10/10 (vs Beszel)

**Effort:** L (~22h)

### 19A: Multi-Host Monitoring (10h)

- [ ] **19A-1. Agent protocol design** — `docs/agent-protocol.md`
  - Lightweight agent reports host+container stats via HTTP POST
  - Auth: API key in header
  - Payload: host stats + container stats array
  - Effort: 2h

- [ ] **19A-2. Agent endpoint** — `src/api/agent-ingest.ts`
  - `POST /api/agent/ingest` — accepts host+container stats
  - Stores with `hostId` field for multi-host differentiation
  - Effort: 2h

- [ ] **19A-3. Lightweight agent binary** — `packages/hiai-agent/` (new)
  - Bun compile to single binary (~10MB)
  - Reads /proc + Docker socket, POSTs to central server
  - Configurable interval and endpoint
  - Effort: 4h

- [ ] **19A-4. Multi-host UI** — `frontend/src/routes/infrastructure/+page.svelte`
  - Host selector dropdown
  - Per-host dashboards
  - Aggregate view across all hosts
  - Effort: 2h

### 19B: GPU & Process Monitoring (6h)

- [ ] **19B-1. NVIDIA GPU monitoring** — `src/monitoring/host-collector.ts`
  - Parse `nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu --format=csv`
  - Store in new `gpu_stats` table or `host_stats` JSONB field
  - Effort: 2h

- [ ] **19B-2. Process-level monitoring** — `src/monitoring/host-collector.ts`
  - Parse `/proc/[pid]/stat` and `/proc/[pid]/status` for top processes
  - Store top 10 processes by CPU and memory
  - Effort: 2h

- [ ] **19B-3. GPU + process UI** — `frontend/src/routes/infrastructure/+page.svelte`
  - GPU card: utilization %, VRAM, temperature
  - Process table: PID, name, CPU%, memory%
  - Effort: 2h

### 19C: Time Ranges & System Info (6h)

- [ ] **19C-1. Flexible time range selector** — `frontend/src/lib/components/TimeRangeSelector.svelte`
  - Presets: 1h, 6h, 24h, 7d, 30d, 90d, custom
  - Shared component used on infrastructure, dashboard, traces pages
  - Effort: 2h

- [ ] **19C-2. System info panel** — `src/monitoring/host-collector.ts`, `src/api/infrastructure.ts`
  - Collect: OS name, kernel version, CPU model, core count, architecture, uptime
  - Store in `host_info` table or extend `host_stats`
  - Display on infrastructure page header
  - Effort: 2h

- [ ] **19C-3. Host network rate** — `src/monitoring/host-collector.ts`
  - Track previous RX/TX bytes, calculate rate (bytes/sec)
  - Store `networkRxRate`, `networkTxRate` in host_stats
  - Effort: 1h

- [ ] **19C-4. Historical charts for infra** — `frontend/src/routes/infrastructure/+page.svelte`
  - Use TimeRangeSelector for 1h/6h/24h/7d/30d/90d
  - Query API with from/to params
  - Effort: 1h

---

## Phase 20: Log Viewer → 10/10 (vs Dozzle)

**Effort:** L (~22h)

### 20A: ANSI Color Rendering (4h)

- [ ] **20A-1. ANSI renderer component** — `frontend/src/lib/components/AnsiText.svelte`
  - Parse ANSI escape codes (SGR sequences: colors, bold, italic, underline)
  - Render as styled `<span>` elements
  - Support 16 colors, 256 colors, and 24-bit RGB
  - Respect `prefers-reduced-motion`
  - Effort: 3h

- [ ] **20A-2. Replace stripAnsi with AnsiText** — `frontend/src/routes/logs/+page.svelte`
  - Use `<AnsiText text={entry.message} />` instead of `stripAnsi(entry.message)`
  - Keep stripAnsi for search indexing
  - Effort: 1h

### 20B: Advanced Search (4h)

- [ ] **20B-1. Regex search** — `src/api/logs.ts`
  - Add `?regex=pattern` query param
  - Use PostgreSQL `~` operator for regex matching
  - Effort: 1.5h

- [ ] **20B-2. Fuzzy search** — `src/api/logs.ts`
  - Use `pg_trgm` similarity for fuzzy matching
  - Add `?fuzzy=term` query param
  - Effort: 1.5h

- [ ] **20B-3. Saved searches** — `src/store/schema.ts`, `src/api/saved-searches.ts`
  - Table: `savedSearches(id, projectId, name, query, createdAt)`
  - CRUD API
  - Dropdown in logs UI
  - Effort: 1h

### 20C: Log Volume & Export (4h)

- [ ] **20C-1. Per-container log volume API** — `src/api/logs.ts`
  - `GET /api/logs/volume?interval=1h&containerId=xxx` — time-series log counts
  - GROUP BY date_trunc(interval, timestamp)
  - Effort: 1.5h

- [ ] **20C-2. Log volume chart** — `frontend/src/routes/logs/+page.svelte`
  - CSS-only bar chart showing log rate per container over time
  - Clickable bars to jump to that time range
  - Effort: 1.5h

- [ ] **20C-3. Download button in UI** — `frontend/src/routes/logs/+page.svelte`
  - "Download" button that calls `/api/export/logs` with current filters
  - Triggers browser download of CSV/JSON
  - Effort: 1h

### 20D: Multi-Host & UX (10h)

- [ ] **20D-1. Multi-host log aggregation** — `src/api/logs.ts`
  - Logs from multiple hosts tagged with `hostId`
  - Filter by host in UI
  - Agent sends logs along with metrics
  - Effort: 3h

- [ ] **20D-2. Container sidebar** — `frontend/src/lib/components/ContainerSidebar.svelte`
  - Persistent sidebar listing all containers
  - Click to filter, color-coded by status
  - Log count badge per container
  - Effort: 3h

- [ ] **20D-3. Split pane view** — `frontend/src/lib/components/SplitPane.svelte`
  - 2-4 pane layout for side-by-side container logs
  - Drag to resize panes
  - Each pane has independent scroll and filter
  - Effort: 3h

- [ ] **20D-4. Container grouping** — `frontend/src/lib/components/ContainerGroup.svelte`
  - Group by Docker Compose project or label
  - Collapsible groups in sidebar
  - Effort: 1h

---

## Phase 21: Quality & DX → 10/10

**Effort:** L (~25h)

### 21A: Security Hardening (6h)

- [ ] **21A-1. Hash API keys** — `src/store/schema.ts`, `src/api/projects.ts`
  - Store `apiKeyHash` (bcrypt) instead of plain `apiKey`
  - Show only key prefix (first 8 chars) in UI
  - Lookup by hash on auth
  - Effort: 3h

- [ ] **21A-2. Constant-time admin key comparison** — `src/workers/retention.ts`
  - Replace `token !== adminKey` with `crypto.timingSafeEqual()`
  - Effort: 0.5h

- [ ] **21A-3. Public bootstrap endpoint** — `src/api/projects.ts`
  - `POST /api/projects` — create first project without auth (only if zero projects exist)
  - Returns API key on creation
  - Effort: 1h

- [ ] **21A-4. Rate limiter path boundary fix** — `src/middleware/rate-limiter.ts`
  - Use exact prefix with `/` boundary instead of `startsWith`
  - Effort: 0.5h

- [ ] **21A-5. CORS validation** — `src/index.ts`
  - Warn if CORS_ORIGIN is `*` in production
  - Effort: 0.5h

- [ ] **21A-6. Disk space check in health** — `src/api/health.ts`
  - Check available disk space via `statvfs` or `df`
  - Return "degraded" if <1GB free
  - Effort: 0.5h

### 21B: Frontend Tests (8h)

- [ ] **21B-1. API client tests** — `frontend/src/lib/api.test.ts`
  - Test all API functions with mocked fetch
  - Error handling, timeout, auth header
  - Effort: 3h

- [ ] **21B-2. Dashboard page test** — `frontend/src/routes/+page.test.ts`
  - Test metric card rendering, sparkline data, error states
  - Effort: 2h

- [ ] **21B-3. Issues page test** — `frontend/src/routes/issues/+page.test.ts`
  - Test issue list, filtering, pagination
  - Effort: 2h

- [ ] **21B-4. Logs page test** — `frontend/src/routes/logs/+page.test.ts`
  - Test log streaming, search, ANSI rendering
  - Effort: 1h

### 21C: Client SDK & OpenAPI (6h)

- [ ] **21C-1. TypeScript client SDK** — `packages/hiai-client/` (new)
  - Auto-generated from OpenAPI spec
  - `HiaiClient` class with typed methods for all endpoints
  - npm publishable
  - Effort: 3h

- [ ] **21C-2. OpenAPI spec generation** — `src/lib/openapi.ts`
  - Generate from Elysia route definitions
  - Serve at `/api/openapi.json`
  - Effort: 2h

- [ ] **21C-3. CHANGELOG** — `CHANGELOG.md`
  - Document all versions starting from v0.1.0
  - Effort: 1h

### 21D: Code Quality (5h)

- [ ] **21D-1. Replace all console.log with logger** — all files
  - Grep for console.log/error/warn, replace with logger calls
  - Effort: 2h

- [ ] **21D-2. Remove deprecated markAlertFired** — `src/alerts/dispatcher.ts`, `src/alerts/dedup.ts`
  - Remove the deprecated function, update callers
  - Effort: 1h

- [ ] **21D-3. Zod validation on JSONB reads** — `src/alerts/rules-engine.ts`
  - Validate `condition` and `channels` JSONB on read with Zod
  - Effort: 1.5h

- [ ] **21D-4. Trace sampling** — `src/api/otlp.ts`
  - Configurable sampling rate (e.g., SAMPLE_RATE=0.1 for 10%)
  - Probabilistic sampling on ingestion
  - Effort: 0.5h

---

## Execution Summary

| Phase | Name | Effort | Parity Target |
|-------|------|--------|---------------|
| 17 | Error Tracking → 10/10 | ~30h | vs Bugsink: 5→10 |
| 18 | Uptime Monitoring → 10/10 | ~35h | vs Uptime Kuma: 4→10 |
| 19 | Infrastructure → 10/10 | ~22h | vs Beszel: 5.5→10 |
| 20 | Log Viewer → 10/10 | ~22h | vs Dozzle: 5.5→10 |
| 21 | Quality & DX → 10/10 | ~25h | Overall: 7.5→10 |
| **Total** | | **~134h** | |

### Parallelism per Phase

- **Phase 17:** 4 groups (17A releases, 17B assignment, 17C search, 17D alerting)
- **Phase 18:** 4 groups (18A monitor types, 18B SSL, 18C status page, 18D notifications)
- **Phase 19:** 3 groups (19A multi-host, 19B GPU/process, 19C time ranges)
- **Phase 20:** 4 groups (20A ANSI, 20B search, 20C volume/export, 20D multi-host/UX)
- **Phase 21:** 4 groups (21A security, 21B frontend tests, 21C SDK/OpenAPI, 21D code quality)

### Critical Path

```
Phase 17 (30h) ─┐
Phase 18 (35h) ─┤
Phase 19 (22h) ─┼─→ Phase 21 (25h) → DONE
Phase 20 (22h) ─┘
```

**Minimum wall-clock with max parallelism: ~60h** (Phases 17-20 in parallel, then Phase 21)

### Agent Execution Plan

Each phase launches 3-4 agent teams:
- Each agent owns exactly 1 file group
- No file overlap between parallel agents
- Coordinator verifies tsc + tests after each wave

### Expected Final Scores

| Dimension | After Phase 17-21 |
|-----------|-------------------|
| vs Bugsink | **10/10** |
| vs Uptime Kuma | **10/10** |
| vs Beszel | **10/10** |
| vs Dozzle | **10/10** |
| Overall quality | **10/10** |
