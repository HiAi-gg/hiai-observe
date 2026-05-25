# Changelog

All notable changes to HiAi Observe will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-05-25

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
- API keys stored in plaintext (encrypted storage planned for v0.2.0)
- No built-in user authentication (API key only)
- Docker socket required for container monitoring
- PostgreSQL only (no ClickHouse/TimescaleDB)

[0.1.0]: https://github.com/hiai-tools/hiai-observe/releases/tag/v0.1.0
