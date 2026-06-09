# Roadmap

What's worth adding next, grouped by phase and roughly prioritized. This is a
living document — open an issue to propose or reprioritize items.

**Legend:** 🔴 urgent · 🟡 medium · 🟢 nice-to-have · ✅ done

**Dependency chains** (read these before starting work):
- `PM-OTLP-LOGS` → `PM-AI-ENRICH` → `SI-TRACE-CORR` (logs → AI spans → trace↔log correlation)
- `PM-RBAC` → `PM-SCALE` (multi-tenant auth before horizontal scaling)
- `PM-TYPES` → `SI-DASHBOARD` (typed widget contracts before custom builder)

---

## ✅ Completed (v0.1.5 → v0.1.6)

| Item | Version | Notes |
|---|---|---|
| Retention for all time-series tables (logs, traces, events, stats, checks) | v0.1.5 | Daily cleanup at 3 AM UTC |
| Whitelabel/brand overrides (logo, colors, title) | v0.1.5 | |
| Logs page: WebSocket "Offline" + polling "Live" contradiction fix | v0.1.5 | Added `/ws/logs` to `PUBLIC_PATHS`; relabeled polling badge to "Auto-refresh" |
| **Log worker 5-layer defense** (container filter → sampling → token bucket → backpressure → concurrent semaphore) | v0.1.6 | 7 new env vars, drops noisy lines, caps RAM at <50MB on VPS preset |
| **401 Unauthorized fix** (apiKey store instead of raw `localStorage.getItem`) | v0.1.6 | Affected container detail, logs download, uptime pages |
| **VPS-optimized presets** in `.env.example` | v0.1.6 | `LOG_MAX_LINES_PER_SEC=100`, `LOG_SAMPLE_RATE=0.1`, etc. |
| `docs/configuration.md` — complete env var reference with examples | v0.1.6 | Dev / production / small VPS presets |
| Unit tests for token bucket rate limiter | v0.1.6 | `tests/monitoring/token-bucket.test.ts`, 7 tests |
| AGENTS.md overhaul + README agentic quickstart | v0.1.6 | OpenCode / Claude / Cursor / Copilot prompts |
| **Bump `actions/checkout@v4` → `v5`** | v0.1.6 | 6 occurrences in `.github/workflows/ci.yml` |
| hiai-client build step (`prepublishOnly`) | v0.1.6 | Required for `npm publish` |
| **Backpressure / sampling on log ingestion** | v0.1.6 | Carried over from old ROADMAP |

---

## ⚡ Phase 1: Quick Wins (ship this month, ≤4h each)

### 🔴 CRITICAL — must ship before anything else

| ID | Task | Est. | Why | Depends On |
|---|---|---|---|---|
| **QW-V06** | Cut v0.1.6 release (version bump + CHANGELOG + git tag) | 15min | Prerequisite for npm publish | — |
| **QW-PUBLISH** | Publish 4 SDK packages to npm | 3-4h | Blocks ecosystem adoption | QW-V06 |

**`npm publish` checklist (QW-PUBLISH):**
- [x] Consolidated into a single `@hiai-gg/hiai-observe` package (SDK + CLI + MCP + Mastra exporter), node-compatible build (`dist/` JS + `.d.ts`), `publishConfig {access: public, provenance}`, `prepublishOnly` build verified
- [ ] Create the `hiai-gg` npm org + enable 2FA
- [ ] Generate `NPM_TOKEN` and add as a GitHub Actions secret
- [ ] First publish: `cd packages/hiai-observe && bun publish --access public` (then automated by `publish.yml` on `v*` tags)
- [x] Excluded from publish (internal only): `@hiai-observe/sdk`, `@hiai-observe/agent` (private)
- [x] CI workflow: `.github/workflows/publish.yml` triggered on `v*` tag push (now publishes the single package)

### 🟡 Important

| ID | Task | Est. |
|---|---|---|
| **QW-CI** | CI bump `actions/checkout` v4→v5 | ~~15min~~ ✅ done in v0.1.6 |
| **QW-OTLP-PROTO** | OTLP protobuf support (content-type detection + protobuf decode + tests) | 4h |
| **QW-ZOD** | Config validation with Zod (validate all env vars at startup, log warnings) | 1h |
| **QW-CI-E2E** | Dedicated CI job that boots the server and runs the e2e/integration suite (`INTEGRATION=1`) | 2d |
| **QW-DRIZZLE-REGEN** | Regenerate the Drizzle migration journal/snapshots so `drizzle-kit generate` works again | 1h |

### 🟢 Nice-to-have

| ID | Task | Est. |
|---|---|---|
| **QW-SCREENSHOTS** | README screenshots (4 positions marked with HTML comments) | 10min |
| **QW-LOG-DOWNLOAD** | Log viewer "download as text" button | 2h |
| **QW-MODEL-PRICING** | Keep `MODEL_PRICING` defaults current; consider fetching from a maintained source | 2h |
| **QW-COVERAGE** | Raise automated test coverage (currently report-only; the suite is unit-focused with a mocked DB) | ongoing |

---

## 🔧 Phase 2: Platform Maturation (1-4 days each)

### Carried-forward items (grouped by area)

#### Error tracking (vs Bugsink / Sentry) — ~85%
| ID | Item | Priority | Days |
|---|---|---|---|
| PM-ERR-1 | Performance/transaction monitoring (span waterfalls beyond AI traces) | 🟡 | 3d |
| PM-ERR-2 | User-feedback widget and crash-free session metrics | 🟢 | 2d |
| PM-ERR-3 | Inbound email/Slack issue actions (resolve, assign from notification) | 🟢 | 1d |

#### Uptime monitoring (vs Uptime Kuma) — ~65%
| ID | Item | Priority | Days |
|---|---|---|---|
| PM-MON-1 | More monitor types: TCP port, Push (heartbeat), Docker container health, JSON-query, MQTT, Steam | 🔴 | 2d |
| PM-MON-2 | More notification channels (Slack, PagerDuty, Opsgenie, generic webhook, Gotify, ntfy) | 🔴 | 1d |
| PM-MON-3 | Multiple status pages per instance + custom domains per page | 🟡 | 1d |
| PM-MON-4 | Proxy support for outbound checks | 🟢 | 0.5d |

#### Infrastructure (vs Beszel) — ~70%
| ID | Item | Priority | Days |
|---|---|---|---|
| PM-INF-1 | Mature multi-host agent: disk, network, per-container stats, temperature sensors, GPU from remote hosts | 🔴 | 3d |
| PM-INF-2 | Agent auto-registration + token rotation | 🟡 | 1d |
| PM-INF-3 | Configurable per-metric alert thresholds in the UI | 🟢 | 1d |

#### Log viewer (vs Dozzle) — ~75%
| ID | Item | Priority | Days |
|---|---|---|---|
| PM-LOG-1 | Finish the live split-pane multi-container view (components exist; wire into a dedicated "live tail" mode) | 🟡 | 2d |
| PM-LOG-2 | One-click "tail this container now" with zero storage (Dozzle-style ephemeral mode) | 🟢 | 1d |
| PM-LOG-3 | Log ingestion from external sources (syslog, Filebeat, Vector) | 🟢 | 3d |

#### AI / LLM observability (complements Langfuse) — ~50%
| ID | Item | Priority | Days |
|---|---|---|---|
| PM-AI-1 | Cost optimization hints (cheapest-model suggestions, prompt-size outliers) | 🟡 | 2d |
| PM-AI-2 | Model comparison view (latency/cost/error rate side by side) | 🟡 | 2d |
| PM-AI-3 | Eval/score ingestion and dataset tracking (toward Langfuse-level workflows) | 🟡 | 3d |
| PM-AI-4 | Prompt management / versioning | 🟢 | 2d |

### New platform items

| ID | Task | Days | Depends On |
|---|---|---|---|
| **PM-EMBED** | Embedded/widget mode — iframe widgets + Web Components for custom dashboards | 3d | — |
| **PM-OTLP-LOGS** | OTLP `/v1/logs` endpoint — route + parser + Zod schema | 2d | — |
| **PM-AI-ENRICH** | AI tracing enrichment: recognize `gen_ai.*` attributes on non-Mastra OTLP spans | 2d | — |
| **PM-TYPES** | Frontend type coverage to 100% (strict mode, no `any` exports) | 3d | — |
| **PM-RBAC** | Multi-tenant RBAC — user accounts + invitations + SSO (OIDC/SAML) | 1-2w | — |
| **PM-SCALE** | Horizontal scaling — separate worker container, Redis-coordinated | 4d | PM-RBAC |
| **PM-RATE-LIMIT** | Per-project API rate limits (currently global) | 1d | — |
| **PM-AUDIT** | Audit log for admin actions (key rotation, project/user changes) | 2d | PM-RBAC |

---

## 🚀 Phase 3: Strategic Initiatives (weeks)

| ID | Task | Weeks | Depends On |
|---|---|---|---|
| **SI-CLICKHOUSE** | ClickHouse/TimescaleDB backend option for high-volume event pipelines | 4w | — |
| **SI-COST** | AI cost optimization engine — cheapest-model suggestions, prompt-size outlier detection, model comparison | 3w | PM-AI-ENRICH |
| **SI-DASHBOARD** | Custom dashboard builder — drag-and-drop widgets, saved layouts, cross-project | 4w | PM-TYPES |
| **SI-TRACE-CORR** | Trace-to-log correlation — link OTLP spans to log entries via `trace_id` | 2w | PM-OTLP-LOGS |
| **SI-ANOMALY** | Anomaly detection — error spike + latency regression alerts | 3w | — |
| **SI-DASHBOARD-MULTI** | Cross-project / multi-project aggregated dashboard | 2w | SI-DASHBOARD |
| **SI-READ-REPLICAS** | Read replicas support for dashboards | 1w | PM-SCALE |
| **SI-A11Y** | Continued accessibility and mobile-responsive improvements | ongoing | — |

---

## 📊 Answers to 5 User Questions

### Q1: SvelteKit version?
**SvelteKit 2** (`^2.60.0`) + **Svelte 5** (`^5.55.0`) with runes. ✅ No migration needed.

### Q2: Embedded/widget mode?
**Already partial:**
- SVG badges (`GET /api/badges/:slug/status`, `…/uptime/:slug/:id`)
- Public HTML status pages (`GET /status/:slug`)
- REST API for any external dashboard
- CLI (`hiai-observe` bin in `@hiai-gg/hiai-observe`) for shell-based access
- MCP server (`hiai-observe-mcp` bin) for AI agent access

**Missing for true embedded mode:**
- iframe widgets
- JS SDK for embedding components
- Web Components

→ **`PM-EMBED`** in Phase 2 covers this.

### Q3: OTEL/OTLP — what is implemented?
**Works today:**
- `POST /v1/traces` (OTLP JSON traces)
- `POST /v1/metrics` (OTLP JSON metrics)
- `src/ingestion/otlp-parser.ts` parses both
- `src/mastra/trace-parser.ts` classifies Mastra spans by `mastra.*` attributes
- Mastra exporter sends OTLP with `mastra.*` attributes

**Missing:**
- Protobuf support (binary OTLP frames) — `QW-OTLP-PROTO`
- Generic OTLP docs (only Mastra integration is documented)
- Zod validation on input — `QW-ZOD`

### Q4: OTLP log support?
**No.** Logs today are pulled from the Docker socket by `src/monitoring/log-streamer.ts`. There is no `POST /v1/logs` route, no OTLP log parser, no Zod schema for `ResourceLogs` / `ScopeLogs` / `LogRecord`.

→ **`PM-OTLP-LOGS`** in Phase 2 covers this.

### Q5: AI tracing — own format + OTEL traces in parallel?
**Architecture already supports dual ingestion:**
- One `/v1/traces` endpoint accepts both Mastra OTLP spans (with `mastra.*` attributes) and generic OTLP spans.
- **Mastra spans** are enriched by `trace-parser.ts` into `workflowRuns`, `toolCalls`, `agentInteractions` rows, then aggregated by `token-aggregator.ts` (Claude / GPT / Gemini token buckets).
- **Generic spans** are stored as-is (in the `traces` table) but do NOT trigger AI-specific analytics (no latency breakdown per model, no cost calculation, no token roll-up).

**The gap:** generic OpenTelemetry spans emitted by, e.g., a LangChain or LlamaIndex app, carry `gen_ai.*` attributes from the [OpenTelemetry GenAI Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/) but we ignore them.

→ **`PM-AI-ENRICH`** — add a heuristic that recognizes `gen_ai.system`, `gen_ai.request.model`, `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens` and routes those spans through the same enrichment path as Mastra spans.

---

## 📈 KPI Targets (v0.2.0 → v0.3.0)

| Metric | Current (v0.1.6) | v0.2.0 Target | v0.3.0 Target |
|---|---|---|---|
| Test count | 243 | 300+ | 400+ |
| Frontend type coverage | ~70% | 100% | 100% |
| npm packages published | 0 of 4 | 4 of 4 | 4 of 4 + automated CI publish |
| Log worker max RAM | <50MB (VPS preset enforced) | <30MB | <30MB |
| CI pipeline | typecheck + unit tests | + e2e on booted server | + nightly perf benchmark |
| OTLP protocols | JSON traces + metrics | + protobuf + logs | + logs + tail-sampling |
| Notification channels | 7 (Telegram, Discord, SMTP, …) | 12 (+ Slack, PagerDuty, Opsgenie) | 15 (+ Gotify, ntfy, webhook) |
| Monitor types | HTTP, gRPC, keyword, JSON | + TCP, Push, Docker, JSON-query, MQTT | + custom scripts |
| Uptime Kuma parity | ~65% | ~80% | ~95% |
| Sentry SDK parity | ~85% | ~92% | ~98% |
| Beszel parity | ~70% (single-host) | ~85% (multi-host) | ~95% (multi-host + GPU) |
| Dozzle parity | ~75% | ~85% | ~95% |

---

## 🗂️ Integration with existing docs

| Doc | Purpose | Status |
|---|---|---|
| `docs/configuration.md` | Every env var with examples | ✅ v0.1.6 |
| `docs/production.md` | Deploy, TLS, security hardening | ✅ v0.1.6 |
| `docs/api.md` | REST + WS reference | Needs OTLP `/v1/logs` entry (PM-OTLP-LOGS) |
| `docs/integration.md` | Mastra, Sentry, OTLP, MCP setup | Needs generic OTLP section (PM-AI-ENRICH) |
| `AGENTS.md` | Agent operating manual | ✅ v0.1.6 |
| `README.md` | Public landing | Needs screenshots (QW-SCREENSHOTS) |
| `docs/architecture.md` | System overview | ✅ current |
| `docs/agent-protocol.md` | AI agent access | ✅ current |
| `docs/backup.md` | Backup/restore | ✅ current |

---

## 🛠️ Quick reference: how to pick up an item

1. Find the ID (e.g. `PM-OTLP-LOGS`) in the table above.
2. Check the `Depends On` column — is the dependency shipped?
3. Open an issue or branch with the ID as the prefix.
4. Update this file: move the item from its current phase to `✅ Completed` with the version tag.
