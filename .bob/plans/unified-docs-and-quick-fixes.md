# Unified Plan: ROADMAP + README + Quick Fixes

## Goal
Single execution plan covering: (1) Critic-reviewed quick fixes, (2) ROADMAP.md full rewrite, (3) README screenshot markers. One `/start-work` run, one verification pass.

## Total Time: ~3h 45min

---

## Wave 1: Quick Fixes (code + release) — ~1h 15min

These fix factual errors the Critic found and prepare for npm publish.

### Task 1.1 — Cut v0.1.6 release (15 min)
**Files:** `package.json`, `CHANGELOG.md`, then `git tag`
- [ ] Bump `version` in root `package.json`: `0.1.5` → `0.1.6`
- [ ] Add `## [0.1.6]` entry to `CHANGELOG.md` (log worker 5-layer defense, 401 fix, VPS presets, token bucket tests, docs/configuration.md)
- [ ] `git tag v0.1.6 && git push origin v0.1.6` — user executes, agent reminds
- **QA:** `grep version package.json` shows `0.1.6`; `grep "0.1.6" CHANGELOG.md` found

### Task 1.2 — Fix hiai-client build step (20 min)
**File:** `packages/hiai-client/package.json`
- [ ] Read current package.json
- [ ] If `"main":"dist/index.js"` and no `"prepublishOnly"` script → add `"prepublishOnly": "bun run build"`
- [ ] If `"build"` script missing → add `"build": "tsc"` (verify tsconfig.json has `outDir: dist`)
- **QA:** `cd packages/hiai-client && bun run prepublishOnly` exits 0 without error

### Task 1.3 — CI bump actions/checkout v4→v5 (5 min)
**File:** `.github/workflows/ci.yml`
- [ ] Replace `actions/checkout@v4` with `actions/checkout@v5`
- **QA:** `grep "actions/checkout@v5" .github/workflows/ci.yml` found

### Task 1.4 — Fix npm scope in plan references (docs only) (30 min)
**Files:** `.bob/plans/roadmap-audit-and-update.md`, whichever docs reference `@hiai-gg`
- [ ] Search for `@hiai-gg` in `docs/` and `.bob/plans/` → replace with `@hiai-observe`
- [ ] In ROADMAP.md (Wave 2 output): use `@hiai-observe` scope for all npm packages
- **QA:** `grep -r "@hiai-gg" docs/` returns empty

### Task 1.5 — Add npm publish checklist to ROADMAP.md (part of Wave 2)
**Included in ROADMAP rewrite, not a separate task.**

---

## Wave 2: ROADMAP.md Full Rewrite — ~1h 30min

### Task 2.1 — Overwrite docs/ROADMAP.md
**File:** `docs/ROADMAP.md`
**Action:** Replace entire file with the structure below. Merge old ROADMAP items + 5 question answers + new gaps + quick/deep split.

**New structure (reference — exact content in plan body):**

```markdown
# Roadmap

Legend: 🔴 urgent · 🟡 medium · 🟢 nice-to-have · ✅ done

---

## ✅ Completed (v0.1.5 → v0.1.6)

| Item | Version |
|---|---|
| Retention for all time-series tables (logs, traces, events, stats, checks) | v0.1.5 |
| Whitelabel/brand overrides (logo, colors, title) | v0.1.5 |
| Log worker 5-layer defense (container filter → sampling → token bucket → backpressure → concurrent semaphore) | v0.1.6 |
| 401 Unauthorized fix (apiKey store instead of raw localStorage.getItem) | v0.1.6 |
| VPS-optimized presets in .env.example (LOG_MAX_LINES_PER_SEC=100, etc.) | v0.1.6 |
| docs/configuration.md — complete env var reference with examples | v0.1.6 |
| Unit tests for token bucket rate limiter | v0.1.6 |
| AGENTS.md overhaul + README agentic quickstart (OpenCode/Claude/Cursor prompts) | v0.1.6 |
| Backpressure / sampling on log ingestion | v0.1.6 |
| More notification channels + status page polish | v0.1.6 |

---

## ⚡ Phase 1: Quick Wins (ship this month, 1-4h each)

### 🔴 CRITICAL — Must ship before anything else

| ID | Task | Est. | Why |
|---|---|---|---|
| **QW-PUBLISH** | Publish SDK packages to npm (`@hiai-observe/client`, `mastra-exporter`, `mcp`, `cli`) | 3-4h | Blocks ecosystem adoption |
| **QW-V06** | Cut v0.1.6 release (version bump + CHANGELOG + git tag) | 15min | Prerequisite for npm publish |

**npm publish checklist:**
- [ ] Verify all 4 package.json have `"publishConfig": {"access": "public"}`
- [ ] Verify hiai-client has `"prepublishOnly": "bun run build"` with working build
- [ ] Generate `NPM_TOKEN` (GitHub Actions secret) — CI publish on tag push
- [ ] Enable 2FA on npm org, add `--provenance` for supply-chain attestation
- [ ] First publish: `bun publish --access public` from each package dir (manual, then automate)
- [ ] Excluded from publish (internal only): `@hiai-observe/sdk`, `@hiai-observe/agent`

### 🟡 Important

| ID | Task | Est. |
|---|---|---|
| **QW-CI** | CI bump `actions/checkout` v4→v5 | 15min |
| **QW-OTLP-PROTO** | OTLP protobuf support (content-type detection + protobuf decode + tests) | 4h |
| **QW-ZOD** | Config validation with Zod (validate all env vars at startup, log warnings) | 1h |

### 🟢 Nice-to-have

| ID | Task | Est. |
|---|---|---|
| **QW-SCREENSHOTS** | README screenshots (4 positions marked with HTML comments) | 10min |
| **QW-LOG-DOWNLOAD** | Log viewer "download as text" button | 2h |

---

## 🔧 Phase 2: Platform Maturation (1-4 days each)

### Dependency chain: PM-OTLP-LOGS → PM-AI-ENRICH → SI-TRACE-CORR

| ID | Task | Days | Depends On |
|---|---|---|---|
| **PM-EMBED** | Embedded/widget mode — iframe widgets + Web Components for custom dashboards | 3d | — |
| **PM-OTLP-LOGS** | OTLP `/v1/logs` endpoint — route + parser + Zod schema | 2d | — |
| **PM-AI-ENRICH** | AI tracing enrichment: recognize `gen_ai.*` attributes on non-Mastra OTLP spans | 2d | — |
| **PM-TYPES** | Frontend type coverage to 100% (strict mode, no `any` exports) | 3d | — |
| **PM-RBAC** | Multi-tenant RBAC — user accounts + invitations + SSO (OIDC/SAML) | 1-2w | — |
| **PM-SCALE** | Horizontal scaling — separate worker container, Redis-coordinated | 4d | PM-RBAC |

### Platform items carried forward from old ROADMAP:

| Item | Status |
|---|---|
| More monitor types (TCP, Push, Docker health, JSON-query) | 🟡 PM — 2d |
| More notification channels (Slack, PagerDuty, Opsgenie, Gotify) | 🟡 PM — 1d |
| Multi-host agent: disk, network, GPU, per-container stats | 🟡 PM — 3d |
| Per-project API rate limits (currently global) | 🟡 PM — 1d |
| Audit log (admin actions) | 🟡 PM — 2d |
| CI e2e/integration job (boot server, run suite) | 🟡 PM — 2d |
| Drizzle migration journal regeneration | 🟡 PM — 1h |
| Live split-pane multi-container log view | 🟡 PM — 2d |

---

## 🚀 Phase 3: Strategic Initiatives (weeks)

| ID | Task | Weeks | Depends On |
|---|---|---|---|
| **SI-CLICKHOUSE** | ClickHouse/TimescaleDB backend option for high-volume event pipelines | 4w | — |
| **SI-COST** | AI cost optimization engine — cheapest-model suggestions, prompt-size outlier detection, model comparison | 3w | PM-AI-ENRICH |
| **SI-DASHBOARD** | Custom dashboard builder — drag-and-drop widgets, saved layouts, cross-project | 4w | PM-TYPES |
| **SI-TRACE-CORR** | Trace-to-log correlation — link OTLP spans to log entries via trace_id | 2w | PM-OTLP-LOGS |
| **SI-ANOMALY** | Anomaly detection — error spike + latency regression alerts | 3w | — |

### Strategic items from old ROADMAP:
- Prompt management / versioning (🟢, 2w)
- Eval/score ingestion + dataset tracking (🟡, 3w)
- Read replicas support (🟢, 1w)

---

## 📊 Answers to 5 Questions

### Q1: SvelteKit version?
**SvelteKit 2** (`^2.60.0`) + **Svelte 5** (`^5.55.0`) with runes. ✅ No migration needed.

### Q2: Embedded/widget mode?
**Partial**: badges (SVG), public status pages (HTML), REST API, CLI, MCP tools exist.
**Missing**: iframe widgets, JS SDK for embedding components, Web Components.
→ **PM-EMBED** in Phase 2 covers this.

### Q3: OTEL/OTLP — что реализовано?
**Работает**: `POST /v1/traces` (JSON), `POST /v1/metrics` (JSON). `otlp-parser.ts` парсит оба.
**Нет**: protobuf support (QW-OTLP-PROTO), generic OTLP docs, Zod-валидация на входе (QW-ZOD).

### Q4: OTLP log support?
**Нет**. Логи только через Docker socket (`log-streamer.ts`). Нет роута `/v1/logs`, парсера, Zod-схемы.
→ **PM-OTLP-LOGS** in Phase 2 covers this.

### Q5: AI-трейсинг — свой формат + OTEL traces параллельно?
**Архитектура поддерживает**: один `/v1/traces` endpoint принимает и Mastra OTLP-спаны, и общие.
**Mastra спаны** обогащаются: workflowRuns, toolCalls, agentInteractions.
**Generic спаны** хранятся как есть, без AI-специфичной аналитики.
→ **PM-AI-ENRICH** — добавить эвристику `gen_ai.*` атрибутов (OpenTelemetry Semantic Conventions).

---

## 📈 KPI Targets

| Metric | Current | v0.2.0 Target |
|---|---|---|
| Test count | 243 | 300+ |
| Frontend type coverage | ~70% | 100% |
| npm packages published | 0 | 4 |
| Log worker max RAM | configurable (default unbounded) | <50MB (VPS preset enforced) |
| CI pipeline | typecheck + unit tests | + e2e on booted server |
| OTLP protocols | JSON traces + metrics | + protobuf + logs |

---

## 🗂️ Integration with existing docs

| Doc | Purpose | Updated? |
|---|---|---|
| `docs/configuration.md` | Every env var with examples | ✅ v0.1.6 |
| `docs/production.md` | Deploy, TLS, security hardening | ✅ v0.1.6 |
| `docs/api.md` | REST + WS reference | Needs OTLP /v1/logs entry (PM-OTLP-LOGS) |
| `docs/integration.md` | Mastra, Sentry, OTLP, MCP setup | Needs generic OTLP section (PM-AI-ENRICH) |
| `AGENTS.md` | Agent operating manual | ✅ v0.1.6 |
| `README.md` | Public landing | Needs screenshots (QW-SCREENSHOTS) |
```

### Task 2.2 — Verify ROADMAP.md against old file
- [ ] All old ROADMAP items are either in ✅ Completed, 🔧 Platform, or 🚀 Strategic
- [ ] No dropped items without explanation
- [ ] Dependency chains documented (PM-OTLP-LOGS → PM-AI-ENRICH → SI-TRACE-CORR, PM-RBAC → PM-SCALE, etc.)

---

## Wave 3: README Screenshot Markers — ~10 min

### Task 3.1 — Insert 4 HTML comment markers in README.md
**File:** `README.md`
**No code changes — HTML comments only.**

| # | Position | File | Size |
|---|---|---|---|
| 1 | After "3. What are my agents actually doing?", before `## Quick Start` | `docs/screenshots/hero.png` | 1200×675 |
| 2 | After `## What's Included`, before `## Comparison` | `docs/screenshots/features.png` | 1200×500 |
| 3 | After Sentry SDK code fence, before `### OpenTelemetry` | `docs/screenshots/error-detail.png` | 1200×700 |
| 4 | After MCP Shell/CLI paragraph, before `## API Endpoints` | `docs/screenshots/ai-tracing.png` | 1200×700 |

Each marker is an HTML comment block with: file path, what to show, recommended dimensions, alt text, ready `<img>` tag. User creates `docs/screenshots/` folder, drops PNGs, uncomments the `<img>` tags.

---

## Wave 4: Verify — ~15 min

### Task 4.1 — Typecheck + tests
```bash
cd projects/hiai-observe && bun run typecheck && bun run test
```
- [ ] Typecheck: 0 errors
- [ ] Tests: 243 passed (ROADMAP + README + non-code changes — no regression expected)

### Task 4.2 — Cross-verify plan references
- [ ] `@hiai-observe` used everywhere (not `@hiai-gg`)
- [ ] PM-2 appears only in Platform Maturation (not in Quick Wins)
- [ ] v0.1.6 recorded in CHANGELOG + git tag

---

## Deliverables
| File | Change |
|---|---|
| `package.json` | Version 0.1.5 → 0.1.6 |
| `CHANGELOG.md` | + [0.1.6] entry |
| `.github/workflows/ci.yml` | `actions/checkout@v4` → `v5` |
| `packages/hiai-client/package.json` | + `"prepublishOnly": "bun run build"` |
| `docs/ROADMAP.md` | Full rewrite (~200 lines) |
| `README.md` | + 4 screenshot markers |
| Git | `v0.1.6` tag reminder |
| Typecheck | 0 errors |
| Tests | 243 passed |
