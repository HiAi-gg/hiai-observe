# Plan: ROADMAP Audit & Update (5 Questions)

## Goal
Answer 5 user questions about hiai-observe state, produce updated `docs/ROADMAP.md` with completed items marked ✅, new gaps identified, and work split into Quick Wins / Platform Maturation / Strategic Initiatives.

---

## Answers to 5 Questions

### Q1: SvelteKit или SvelteKit 2?
**Answer:** SvelteKit 2 (`@sveltejs/kit: ^2.60.0`) + Svelte 5 (`svelte: ^5.55.0`). Runes throughout. No migration needed. ✅ Good.

### Q2: Embedded / widget mode
**Answer:** Partial today (badges, public status pages, REST API, CLI, MCP). Missing: iframe widgets, JS SDK, Web Components. → **PM-1 in roadmap.**

### Q3: OTEL/OTLP implementation audit
**Answer:** Core works (JSON traces + metrics). Missing: protobuf support (QW-5), generic OTLP docs, Zod validation. → **QW-5 + PM-4.**

### Q4: OTLP log support
**Answer:** Does NOT exist. Logs ONLY via Docker socket. Missing: `/v1/logs` route, parser, Zod schema, trace correlation. → **PM-2 in roadmap.**

### Q5: AI tracing — custom + OTEL parallel
**Answer:** Architecture supports dual ingestion today (same `/v1/traces` endpoint). Mastra spans enriched; generic OTLP spans stored raw. Missing: `gen_ai.*` attribute heuristic for non-Mastra AI spans. → **PM-3 in roadmap.**

---

## Wave 1: Write Updated ROADMAP.md

### Task 1.1 — Replace ROADMAP.md with new version
**File:** `docs/ROADMAP.md`
**Action:** Overwrite with content below.

**Structure of new ROADMAP.md:**
1. Legend (🔴🟡🟢✅)
2. ✅ Completed section — all items from v0.1.5/v0.1.6 that were in old roadmap
3. ⚡ Phase 1: Quick Wins (6 items, 1-4h each)
4. 🔧 Phase 2: Platform Maturation (6 items, 1-3 days each)
5. 🚀 Phase 3: Strategic Initiatives (4 items, weeks)
6. 📊 Answers to 5 Questions (full detail)
7. 📈 KPI Targets
8. 🗂️ Integration with existing docs

### Completed items to mark ✅:
- Dashboard audit (broken links, missing metrics) → v0.1.6
- More notification channels + status page polish → v0.1.6
- Backpressure / sampling on log ingestion → v0.1.6
- Retention for all time-series tables → v0.1.5
- Whitelabel/brand overrides → v0.1.5
- 401 fix + log worker 5-layer defense → v0.1.6
- Token bucket unit tests → v0.1.6
- Env vars docs + VPS presets → v0.1.6
- AGENTS.md + README agentic quickstart → v0.1.6

### Quick Wins — Urgent (⚡, ship this week):

| ID | Task | Est. | Urgency |
|---|---|---|---|
| **QW-4** | **Publish SDK packages to npm** | 1.5h | 🔴 CRITICAL |
| **QW-3** | CI bump `actions/checkout` v4→v5 | 15min | 🟡 |
| **QW-5** | OTLP protobuf support | 2h | 🟡 |
| **QW-6** | Config validation with Zod | 1h | 🟡 |

**QW-4 npm details:**
- Registry: https://www.npmjs.com/settings/hiai-gg/packages
- Org: @hiai-gg
- Packages to publish: `@hiai-gg/hiai-observe-client`, `@hiai-gg/hiai-observe-mastra-exporter`, `@hiai-gg/hiai-observe-mcp`, `@hiai-gg/hiai-observe-cli`
- Pre-flight: verify `package.json` name/version fields, add `"publishConfig": {"access": "public", "registry": "https://registry.npmjs.org/"}`

### Quick Wins — Simple (⏱️, ship this month):

| ID | Task | Est. |
|---|---|---|
| **QW-1** | README screenshots (agent-browser) | 1.5h |
| **QW-2** | Log viewer download button | 2h |
| **PM-2** | OTLP `/v1/logs` MVP | 3h |

### Platform Maturation (new):
- PM-1: Embedded/widget mode (3d) — iframe widgets + Web Components
- PM-2: OTLP /v1/logs endpoint (2d) — route + parser + Zod + trace correlation
- PM-3: AI tracing gen_ai.* enrichment (2d) — recognize non-Mastra AI spans
- PM-4: Frontend type coverage to 100% (3d)
- PM-5: Multi-tenant RBAC (3d) — user accounts + invitations
- PM-6: Horizontal scaling — separate worker container (4d)

### Strategic Initiatives (new):
- SI-1: ClickHouse/TimescaleDB backend (4w)
- SI-2: AI cost optimization engine (3w)
- SI-3: Custom dashboard builder (4w)
- SI-4: Trace-to-log correlation (2w)

---

## Wave 2: Verify

### Task 2.1 — Run typecheck + tests
```bash
cd projects/hiai-observe && bun run typecheck && bun run test
```
Document change — should not affect code. Verify 0 errors, 243 passed.

---

## Deliverable
- `docs/ROADMAP.md` — fully updated with completed items, 5 question answers, quick wins, platform maturation, strategic initiatives
- Typecheck: 0 errors
- Tests: 243 passed
