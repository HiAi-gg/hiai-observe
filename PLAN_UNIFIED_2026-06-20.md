# HiAi Observe — Unified Execution Plan
**Created:** 2026-06-20
**Source:** Code audit + documentation audit + roadmap audit + AUDIT_2026-06-20.md
**Status:** Wave 0–4 complete · Wave 5 in progress (11/14) · Wave 6 not started

## Executive Summary

| Metric | Value |
|---|---|
| Total effort | ~150h |
| Wall-clock (max parallelism) | ~61h |
| Waves | 7 (0, 1, 2, 3, 4, 5, 6) |
| Critical path | Wave 0 → Wave 2 (OBS0) → Wave 3 (OBS1) → Wave 4 (OBS2) |
| Current state | Product 100%, Ecosystem 100% (OBS0–2 done), Docs ~95/100, Production 8.0/10 |
| Quality gates | `tsc` 0 errors · vitest 500 passed / 35 skipped · coverage 27.25% (threshold 25%) · build 2.15 MB / 630 modules |

## Wave Completion Summary

| Wave | Scope | Status | Date |
|---|---|---|---|
| 0 | P0 fixes (Drizzle regen, pre-commit, v0.1.9) | ✅ Complete | 2026-06-20 |
| 1 | Docs sync + 16 endpoints + QW-OTLP-PROTO | ✅ Complete | 2026-06-20 |
| 2 | OBS0 — Zod 3.25+, `config.ts`, `/api/health` | ✅ Complete | 2026-06-20 |
| 3 | OBS1 — `@hiai/ui` theme/component unification | ✅ Complete | 2026-06-20 |
| 4 | OBS2 — `EMBED.md`, plugin manifest, tenant filter, tenant-health | ✅ Complete | 2026-06-20 |
| 5 | Platform Maturation (14 items) | 🟡 **11/14** | Active |
| 6 | Strategic Initiatives (ClickHouse, cost engine, custom dashboard, anomaly) | ⏸ Not started | — |

---

## Wave 0 — P0 Fixes (blocking production) ⏱️ ~4h wall-clock ✅ COMPLETE
All 3 tasks are independent — run in PARALLEL.

| ID | Task | Owner | Effort | Files | DoD | Status |
|---|---|---|---|---|---|---|
| W0.1 | Drizzle migrations regeneration | coder | 4h | drizzle/, drizzle.config.ts | `drizzle-kit generate` works, all 23 tables covered | ✅ |
| W0.2 | Pre-commit hook (Biome lint) | coder | 0.5h | .husky/pre-commit, package.json | `bun run lint` runs on staged files | ✅ |
| W0.3 | Root package.json version bump | sub | 1min | package.json | version = 0.1.9 | ✅ |

---

## Wave 1 — Documentation Sync + Quick Wins ⏱️ ~4h wall-clock ✅ COMPLETE
All 9 tasks are independent — run in PARALLEL.

| ID | Task | Owner | Effort | Files | DoD | Status |
|---|---|---|---|---|---|---|
| W1.1 | Update AGENTS.md | writer | 1h | AGENTS.md | version=0.1.9, 32 plugins, 23 tables, 41 test files | ✅ |
| W1.2 | Update README.md | writer | 0.5h | README.md | correct counts, screenshots stay as placeholders for now | ✅ |
| W1.3 | Update RELEASE_PROCESS.md | writer | 0.5h | RELEASE_PROCESS.md | 1 npm pkg, vgalibov/ org, @hiai-gg scope | ✅ |
| W1.4 | Update docs/backup.md | writer | 0.5h | docs/backup.md | 23 tables, no `sessions` table | ✅ |
| W1.5 | Update docs/architecture.md | writer | 0.5h | docs/architecture.md | 32 plugins, 23 tables, all indexes | ✅ |
| W1.6 | Update docs/integration.md | writer | 1h | docs/integration.md | port 5433, MCP+CLI sections | ✅ |
| W1.7 | Document 16 API endpoints | writer | 4h | docs/api.md | dashboard, projects, export, notifications, sourcemaps, embed, admin-bridge, agent-ingest, releases, team, comments, saved-searches, search, badges, fingerprint-rules, subscribers | ✅ |
| W1.8 | QW-SCREENSHOTS | sub | 10min | README.md | 4 screenshots referenced | ✅ (placeholders remain) |
| W1.9 | QW-OTLP-PROTO | coder | 4h | src/api/otlp.ts, tests/ | protobuf content-type detection + decode + tests | ✅ |

---

## Wave 2 — OBS0: Convention Hygiene ⏱️ ~16h wall-clock ✅ COMPLETE
Dependencies shown below. Max parallelism within each group.

### Group A (parallel, no deps): OBS0.1 + OBS0.3 + OBS0.5
| ID | Task | Owner | Effort | Depends On | Files | DoD | Status |
|---|---|---|---|---|---|---|---|
| W2.1 | OBS0.1 Zod 3.24→3.25+ | coder | 2h | — | package.json ×2 | bun install + typecheck green | ✅ |
| W2.2 | OBS0.3 /api/health alias | coder | 1h | — | src/index.ts, src/api/health.ts, src/middleware/auth.ts | /api/health works, /health still works | ✅ |
| W2.3 | OBS0.5 Add @hiai/ui dep | coder | 0.5h | — | frontend/package.json | bun install resolves @hiai/ui | ✅ |

### Group B (after W2.1): OBS0.4
| ID | Task | Owner | Effort | Depends On | Files | DoD | Status |
|---|---|---|---|---|---|---|---|
| W2.4 | OBS0.4 Verify Zod schemas | coder | 4h | W2.1 | src/api/sentry-ingest.ts, src/api/otlp.ts | all ingestion tests pass | ✅ |

### Group C (after W2.1): OBS0.2
| ID | Task | Owner | Effort | Depends On | Files | DoD | Status |
|---|---|---|---|---|---|---|---|
| W2.5 | OBS0.2 config.ts consolidation | coder | 12h | W2.1 | 36 files in src/ | 0 process.env in src/ except config.ts | ✅ (verified: 0 outside config.ts) |

---

## Wave 3 — OBS1: UI Unification ⏱️ ~14h wall-clock ✅ COMPLETE
Depends on W2.3 (OBS0.5).

### Group A (parallel): OBS1.1b + OBS1.2a + OBS1.2b
| ID | Task | Owner | Effort | Depends On | Files | DoD | Status |
|---|---|---|---|---|---|---|---|
| W3.1 | OBS1.1b Verify token mapping | coder | 1h | W2.3 | frontend/src/app.css, app.html | dark theme visually matches current | ✅ |
| W3.2 | OBS1.2a Replace 4 duplicate components | coder | 6h | W2.3 | 4 .svelte files | StatusBadge, ConfirmDialog, Pagination, Toast from @hiai/ui | ✅ |
| W3.3 | OBS1.2b Retheme 9 observe components | coder | 10h | W2.3 | 9 .svelte files | all hex/oklch replaced with canonical tokens | ✅ |

### Group B (after Group A): OBS1.2c
| ID | Task | Owner | Effort | Depends On | Files | DoD | Status |
|---|---|---|---|---|---|---|---|
| W3.4 | OBS1.2c Rewrite app.css | coder | 4h | W3.1+W3.2+W3.3 | frontend/src/app.css | @import @hiai/ui, 0 local hex tokens | ✅ |

---

## Wave 4 — OBS2: Integration ⏱️ ~15h wall-clock ✅ COMPLETE
Depends on Wave 2 + Wave 3.

### Group A (parallel): OBS2.1 + OBS2.2 + OBS2.3a
| ID | Task | Owner | Effort | Depends On | Files | DoD | Status |
|---|---|---|---|---|---|---|---|
| W4.1 | OBS2.1 docs/EMBED.md | writer+coder | 4h | — | docs/EMBED.md (new) | all endpoints + scope params + examples | ✅ |
| W4.2 | OBS2.2 Plugin manifest | coder | 4h | W4.1 | src/plugin.ts (new) | valid HiAiPlugin per §6 conventions | ✅ |
| W4.3 | OBS2.3a Auth bridge design | strategist | 2h | — | docs/AUTH_BRIDGE.md (new) | 3 options analyzed, recommendation clear | ✅ |

### Group B (after W4.3): OBS2.3b
| ID | Task | Owner | Effort | Depends On | Files | DoD | Status |
|---|---|---|---|---|---|---|---|
| W4.4 | OBS2.3b Per-tenant filtering | coder | 6h | W4.3 | schema.ts, all api/*.ts, auth.ts | ?tenantId= filters all list endpoints | ✅ (via `tenant-scope.ts` middleware + Drizzle 0001) |

### Group C (after W4.4): OBS2.3c
| ID | Task | Owner | Effort | Depends On | Files | DoD | Status |
|---|---|---|---|---|---|---|---|
| W4.5 | OBS2.3c Tenant-health endpoint | coder | 3h | W4.4 | src/api/tenant-health.ts (new) | GET /api/tenant/:tenantId/health returns summary | ✅ |

### Group D (after W4.2+W4.5): OBS2.4
| ID | Task | Owner | Effort | Depends On | Files | DoD | Status |
|---|---|---|---|---|---|---|---|
| W4.6 | OBS2.4 Dashboard embed | coder | 4h | W4.2+W4.5 | hiai-dashboard, hiai-admin | observe plugin in dashboard, tenant-health card in admin | ✅ |

---

## Wave 5 — Platform Maturation (parallel, by priority) 🟡 11/14 COMPLETE
No dependencies between items — run in PARALLEL as resources allow.

| ID | Task | Priority | Effort | Files | Status | Evidence |
|---|---|---|---|---|---|---|
| W5.1 | QW-DRIZZLE-REGEN | 🔴 | 1h | drizzle/ | ✅ | `drizzle/0000_initial.sql` regenerated; all 23 tables covered |
| W5.2 | QW-ZOD (config validation) | 🟡 | 1h | src/lib/config.ts | ✅ | Zod schema + `summarizeConfig()` banner; 0 `process.env` outside `config.ts` |
| W5.3 | QW-CI-E2E (dedicated CI job) | 🔴 | 2d | .github/workflows/ci.yml | ⏳ | Not yet — Wave 5 critical-path remaining |
| W5.4 | QW-LOG-DOWNLOAD | 🟢 | 2h | frontend/src/routes/logs/ | ✅ | `GET /api/logs/download` added to API table |
| W5.5 | QW-MODEL-PRICING | 🟢 | 2h | src/mastra/pricing.ts | ✅ | Per-model pricing table; `MODEL_PRICING` env override |
| W5.6 | Coverage threshold (25% lines) | 🟡 | 0.5h | vitest.config.ts | ✅ | `thresholds.lines: 25` enforced; current 27.25% |
| W5.7 | Tests for 18+ untested API routes | 🟡 | 8h | tests/api/ | ✅ | 99 API route tests; 500 passed / 35 skipped |
| W5.8 | PM-OTLP-LOGS | 🔴 | 2d | src/api/otlp.ts (new route) | ✅ | `POST /v1/logs` (JSON + protobuf) at `src/api/otlp.ts:414` |
| W5.9 | PM-AI-ENRICH | 🟡 | 2d | src/mastra/ | ✅ | Dual `gen_ai.*` naming in trace-parser, token-aggregator, latency-analyzer |
| W5.10 | PM-MON-1 more monitor types | 🔴 | 2d | src/monitoring/ | ✅ | `src/monitoring/checks/tcp-check.ts` (new) + dns, ping, grpc, cert, http |
| W5.11 | PM-INF-1 mature multi-host | 🔴 | 3d | packages/hiai-observe/ | ⏳ | Not yet — Wave 5 remaining |
| W5.12 | PM-RBAC multi-tenant | 🔴 | 1-2w | src/middleware/, src/store/ | ⏳ | Not yet — **critical path**, 1–2 weeks |
| W5.13 | PM-RATE-LIMIT per-project | 🟡 | 1d | src/middleware/ | ✅ | `src/middleware/tenant-scope.ts` + `drizzle/0001_per_project_rate_limit.sql` (3-bucket: IP+API-key+Project) |
| W5.14 | PM-AUDIT log | 🟡 | 2d | src/store/, src/api/ | ⏳ | Not yet — Wave 5 remaining |

---

## Wave 6 — Strategic Initiatives (long-term)
Run in PARALLEL as resources allow.

| ID | Task | Effort | Depends On |
|---|---|---|---|
| W6.1 | SI-CLICKHOUSE backend | 4w | — |
| W6.2 | SI-COST optimization engine | 3w | PM-AI-ENRICH |
| W6.3 | SI-DASHBOARD custom builder | 4w | PM-TYPES |
| W6.4 | SI-TRACE-CORR | 2w | PM-OTLP-LOGS |
| W6.5 | SI-ANOMALY detection | 3w | — |
| W6.6 | SI-DASHBOARD-MULTI | 2w | SI-DASHBOARD |
| W6.7 | SI-READ-REPLICAS | 1w | PM-RBAC |
| W6.8 | SI-A11Y improvements | ongoing | — |

---

## Critical Path

```
Wave 0 (4h) ──────────────────────────────────────┐
                                                   │
Wave 1 (4h, parallel with Wave 0) ─────────────────┤
                                                   │
Wave 2A: OBS0.1+0.3+0.5 (2h) ────┐               │
                                   ├─ Wave 2B: OBS0.4 (4h) ─┐
                                   ├─ Wave 2C: OBS0.2 (12h)─┤
                                                   │        │
Wave 3A: OBS1.1b+1.2a+1.2b (10h) ──┐              │        │
                                     ├─ Wave 3B: OBS1.2c (4h)┤
                                                   │        │
Wave 4A: OBS2.1+2.2+2.3a (4h) ──┐                 │        │
                                  ├─ Wave 4B: OBS2.3b (6h)──┤
                                  │                 │        │
                                  └─ Wave 4C: OBS2.3c (3h)──┤
                                                    │        │
                                     Wave 4D: OBS2.4 (4h)───┘
```

**Minimum wall-clock: ~61h** (critical path: W0 → W2A → W2C → W3A → W3B → W4A → W4B → W4C → W4D)

---

## Risk Register

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Zod 3.25 breaks ingestion schemas | M | H | W2.4 dedicated verification |
| config.ts consolidation misses a variable | M | M | grep process.env as gate + bun test |
| @hiai/ui components have different props | M | H | Adapter wrapper if mismatch; manual page walkthrough |
| Token mapping gives visual drift | H | M | Screenshot diff for each page before/after |
| tenant_id migration breaks backward compat | L | H | Nullable, no default. Existing = NULL → no filtering |
| Plugin manifest needs runtime env | M | M | Manifest = factory: createObservePlugin(config) |

---

## Execution Notes

- Each wave: `bun run typecheck` + `bun run test` after changes
- After OBS0.2: grep `process.env` in src/ must return 0 (except config.ts)
- After each phase: update AUDIT_2026-06-20.md with status
- Coordinator verifies tsc + tests after each wave