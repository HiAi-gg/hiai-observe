# Roadmap

What's worth adding next, grouped by theme and roughly prioritized. This is a
living document — open an issue to propose or reprioritize items.

Legend: 🔴 high priority · 🟡 medium · 🟢 nice-to-have

---

## Parity with the tools we replace

HiAi Observe already unifies error tracking, uptime, infrastructure, logs, and
AI tracing into one container. These items close the remaining gaps with each
single-purpose tool it replaces.

### Error tracking (vs Bugsink / Sentry) — ~85%
- 🟡 Performance/transaction monitoring (span waterfalls beyond AI traces)
- 🟢 User-feedback widget and crash-free session metrics
- 🟢 Inbound email/Slack issue actions (resolve, assign from notification)

### Uptime monitoring (vs Uptime Kuma) — ~65%
- 🔴 More monitor types: TCP port, Push (heartbeat), Docker container health, JSON-query, MQTT, Steam
- 🔴 More notification channels (currently 7; Uptime Kuma has 90+) — Slack, PagerDuty, Opsgenie, generic webhook, Gotify, ntfy
- 🟡 Multiple status pages per instance + custom domains per page
- 🟢 Proxy support for outbound checks

### Infrastructure (vs Beszel) — ~70%
- 🔴 Mature multi-host agent: the current `hiai-agent` only reports CPU/memory/uptime. Add disk, network, per-container stats, temperature sensors, and GPU from remote hosts
- 🟡 Agent auto-registration + token rotation
- 🟢 Configurable per-metric alert thresholds in the UI

### Log viewer (vs Dozzle) — ~75%
- 🟡 Finish the live split-pane multi-container view (components exist; wire into a dedicated "live tail" mode)
- 🟢 One-click "tail this container now" with zero storage (Dozzle-style ephemeral mode)
- 🟢 Log ingestion from external sources (syslog, Filebeat, Vector)

### AI / LLM observability (complements Langfuse) — ~50%
- 🔴 Keep `MODEL_PRICING` defaults current; consider fetching prices from a maintained source
- 🟡 Cost optimization hints (cheapest-model suggestions, prompt-size outliers)
- 🟡 Model comparison view (latency/cost/error rate side by side)
- 🟡 Eval/score ingestion and dataset tracking (toward Langfuse-level workflows)
- 🟢 Prompt management / versioning

---

## Platform & security

- 🔴 User accounts + sessions and SSO (OIDC/SAML) layered on top of the existing per-key RBAC roles
- 🟡 Per-project, configurable API rate limits (currently global)
- 🟡 Audit log for admin actions (key rotation, project/user changes)
- 🟢 ClickHouse/TimescaleDB backend option for very high event volume

---

## Scale & reliability

- 🟡 Horizontal scaling: move background workers out of the single Bun process (separate worker container, shared via Redis)
- 🟡 Backpressure / sampling on high-volume trace and log ingestion
- 🟢 Read replicas support for dashboards

---

## Developer experience & release hygiene

- 🔴 README screenshots / a short demo GIF of the dashboard, traces, and infra views
- 🟡 A dedicated CI job that boots the server and runs the e2e/integration suite (`INTEGRATION=1`) — currently those suites skip in CI because no server is started
- 🟡 Regenerate the Drizzle migration journal/snapshots so `drizzle-kit generate` works again (runtime uses `scripts/migrate.ts`, which applies the SQL files directly, so deploys are unaffected)
- 🟢 Bump `actions/checkout@v4` → `v5` (Node 20 deprecation on GitHub runners)
- 🟢 Publish the SDK packages (`@hiai-observe/*`) to npm
- 🟢 Raise automated test coverage (currently report-only; the suite is unit-focused with a mocked DB)

---

## Dashboards & UX

- 🟡 Custom dashboard widgets and saved layouts
- 🟡 Cross-project / multi-project aggregated dashboard
- 🟢 Anomaly detection for error spikes and latency regressions
- 🟢 Continued accessibility and mobile-responsive improvements
