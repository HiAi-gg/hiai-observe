<!-- portfolio-audit:2026-09-13 -->
> **Source reconciliation — 2026-09-13:** Read [TEAM_BACKLOG.md](TEAM_BACKLOG.md) before using the tasks/status below. UI base/port 5197 already configured and CI Bun pin updated; old task to create LAN contour is now runtime verification. Legacy /health is documented compatibility, not automatically a defect. Runtime/remote-CI claims retain their original dates; they were not revalidated in this pass. The linked task ledger holds execution status; this document retains its original product direction/history.
>
> **Local gates 2026-09-13:** `bun --no-env-file run test` **619 passed / 4 skipped** with no shared-DB inserts. Isolated 0003 old→new and live tenant-scope ran on disposable `hiai_observe_test` only (`app_hiai_observe` untouched). Typecheck and backend build exit 0. T01 Vite `:5197` still not started.

# ROADMAP — hiai-observe
Date: 2026-09-05 · HEAD 36fc5525369216d268d2d0c824ebfbfed25dc27d · origin HiAi-gg/hiai-observe · branch main
Live: npm `@hiai-gg/hiai-observe@0.2.3`. DEV-01 LAN `/hiai-observe/` 200 is **file_server**, contour `down`. `:8001` not listening here. Prod: INFRA-01 Coolify `:8001` (not reachable on DEV-01 loopback).

## Snapshot
OTLP / Sentry-compatible observability (API Bun/Elysia + SvelteKit `frontend/` + published SDK package). v0.2.3 is on npm; Docker `vgalibov/hiai-observe`. HEAD pins Bun 1.4, TypeScript 6, shared Postgres/Redis in `docker-compose.prod.yml`, frontend `@hiai-gg/hiai-ui` 0.1.3. Wave 5 in code: Zod env (`src/lib/config.ts`), OTLP logs route allowlisted, AI `gen_ai.*` enrichment, CI job with `INTEGRATION=1`. CI + Docker workflows on this commit are **green**.

Folded from `docs/PLAN.md` (2026-09-05): `PM-OTLP-LOGS` and `PM-AI-ENRICH` are done; open chain is **SI-TRACE-CORR**. `PM-RBAC` still blocks `PM-SCALE`. `docs/ROADMAP.md` Q3–Q5 still say Zod/OTLP logs are missing — that is false.

## Evidence
- Code: `src/index.ts`, `src/lib/config.ts` (Zod), `src/api/otlp.ts`, `src/mastra/trace-parser.ts`, `frontend/`, `packages/hiai-observe`, `docker-compose.prod.yml`
- Live/LAN: npm 0.2.3; LAN browse 200; local `:8001` down
- CI: HEAD CI **success** 2m56s + Docker **success** 7m22s (2026-09-05)
- Docs that lie: `docs/ROADMAP.md` Q3 “Zod missing”, Q4 “No OTLP logs”, Q5 gap as if `PM-AI-ENRICH` unstarted; Phase 2 table still lists `PM-OTLP-LOGS` / `PM-AI-ENRICH` / `QW-ZOD` / `QW-CI-E2E` open. 4 Sep root overlay same lies plus “pin Bun 1.4 / hiai-ui 0.1.3”. `AGENTS.md` Wave 5 leftover vs this file.

## Now
- Ingest: OTLP traces/metrics (+ protobuf), Sentry-compatible, Docker log pull, `/v1/logs` on the public path list.
- Config validated with Zod at boot.
- Shared-infra prod compose (required `DATABASE_URL`/`REDIS_URL`); Dockerfile healthcheck `GET /api/health`.
- SDK published; tag-driven `publish.yml`.
- Tenant isolation / SSRF / secure headers covered by recent tests (per README Wave 5).

## Next
1. **Seat DEV-01 Vite** (`frontend` `paths.base`, Caddy handle, hub `LAN_WEB_PORTS`, free 52xx). Source config is on 5197/`/hiai-observe`; runtime process not started in this pass.
2. **Drizzle snapshots:** journal 0000–0005 with snapshots 0002–0005 committed on the next-night RC. Correlation SQL is **0005** (Better Auth already used 0003/0004). Isolated 0005 old→new passed on `hiai_observe_test`; do not apply to `app_hiai_observe` or production from DEV-01.
3. **Ops:** confirm Coolify INFRA-01 `:8001` image 0.2.3 + shared DB/Redis, not embedded-DB compose. `GET /api/health` on prod (from INFRA, not DEV-01).
4. **SI-TRACE-CORR UI:** log↔trace jump is in source; needs runtime UI confirmation.
5. **PM-INF-1** mature remote agent (disk/net/containers/optional GPU).
6. Uptime leftovers: push heartbeat + JSON-query first. MQTT/Steam/Opsgenie later.
7. Publish follow-up: org 2FA vs CI provenance (`docs/ROADMAP.md` QW-PUBLISH checkbox). Prod compose healthcheck path is already `/api/health`.

## Later / Not doing
- Human **PM-RBAC** (OIDC / invitations) then **PM-AUDIT** then **PM-SCALE**.
- Custom dashboard builder only after **PM-TYPES**.
- ClickHouse / Timescale until PG volume hurts.
- Replacing Sentry-compatible ingest with a new protocol.
- DEV-01 is not the production host.
