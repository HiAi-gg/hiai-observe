# Team backlog — hiai-observe

Source audit: **2026-09-13**. Kind: **service**.
Baseline HEAD: `5eb0ce745586465f6575e608c6bdbc2e43c7775b`; branch: `n/a`.

Coordination and acceptance: [TEAM_HANDOFF.md](../TEAM_HANDOFF.md).

## Current reconciliation

UI base/port 5197 already configured and CI Bun pin updated; old task to create LAN contour is now runtime verification. Legacy /health is documented compatibility, not automatically a defect.

Source checks support this note; they do not certify the running app. Prior live/CI/test claims are historical until rechecked. GitHub freshness was not verified.

Recent local commits:

- `5eb0ce7 Serve the Observe staff UI under /hiai-observe on port 5197.`
- `36fc552 fix(ci): pin Bun 1.4.0 and refresh the frontend lock for frozen installs`
- `189b6fe fix(infra): require shared Postgres/Redis and pin Bun 1.4 / TypeScript 6`

Pre-existing Git status: **3 changed/untracked entries** before this audit. Preserve them; the baseline inventory records paths, not secret contents.

## Read first

- [docs/ROADMAP.md](docs/ROADMAP.md)
- [docs/PLAN.md](docs/PLAN.md)
- [docs/AUTH_BRIDGE.md](docs/AUTH_BRIDGE.md)
- [frontend/vite.config.ts](frontend/vite.config.ts)
- [frontend/svelte.config.js](frontend/svelte.config.js)
- [src/store/schema.ts](src/store/schema.ts)
- [ROADMAP.md](ROADMAP.md)

## Dependencies and scope

Read/integration dependencies: hiai-ui. Audits may run independently; only changed-contract integration waits.
Use isolated fixtures. No production change, DNS, publishing, real messages or financial action is implied.

## Task ledger

Effort is a planning estimate, not a deadline. Confirm the first task baseline before implementation; already implemented work becomes verification.

### HIAI-OBSERVE-T01 — Verify staff UI subpath and tenant/auth bridge

- [x] **P1** · status: **review** · owner: **grok** · effort: M: about 0.5-1 day
- Depends on: current baseline and cited source inspection.
- Acceptance: 5197/base-path configuration confirmed in runtime; unauthorized project access rejected; no secret embedded in public output.
- Evidence: 2026-09-16 follow-up. Live Vite `:5197/hiai-observe/` HTTP 200; empty-key sentinel; unauthenticated `/hiai-observe/api/dashboard` **401** (not 502) with isolated API. Login/infra/WS use `joinApiUrl`; Vite `${BASE}/ws` rewrite; non-prod Better Auth trusts LAN `:5197`. See `docs/acceptance/NEXT-NIGHT-20260915.md`.
- Delivery: dated acceptance report, reviewable diff if needed, and remaining IDs.

### HIAI-OBSERVE-T02 — Assess log-to-trace correlation and migration consistency

- [x] **P2** · status: **review** · owner: **grok** · effort: M-L: about 1-2 days
- Depends on: HIAI-OBSERVE-T01.
- Acceptance: Distinguish trace schema from log schema; implement only verified missing link; migration journal checked without generating/applying destructive changes.
- Evidence: 0005 additive SQL in journal (`drizzle/0005_logs_trace_correlation.sql`; 0003/0004 are Better Auth on origin/main). Snapshots 0002–0005 committed. Isolated old→new apply passed on disposable `hiai_observe_test` (`OBSERVE_MIGRATE_LIVE=1`). Not applied to `app_hiai_observe` or production. See `docs/acceptance/GROK-20260913.md` and `docs/acceptance/NEXT-NIGHT-20260915.md`.
- Delivery: dated acceptance report, reviewable diff if needed, and remaining IDs.

### HIAI-OBSERVE-T03 — Reconcile healthcheck and observability gates

- [x] **P2** · status: **review** · owner: **grok** · effort: M-L: about 1-2 days
- Depends on: HIAI-OBSERVE-T01.
- Acceptance: Compare /health versus /api/health semantics before changing; test dependencies failing and rate limits; preserve useful completed history.
- Evidence: CI Test job now has an explicit `Live tenant-scope DB tests` step after migrate (`TENANT_SCOPE_LIVE_DB=1`). Default `bun --no-env-file run test` 2026-09-14: **639 passed / 5 skipped**. Docker Hub still waits for CI `workflow_run`; this pass did not publish. See `docs/acceptance/RECOVERY-20260914.md`.
- Delivery: dated acceptance report, reviewable diff if needed, and remaining IDs.

## Verification entry points

Available script names read from manifests (not executed and not automatically safe):

- `.`: `bun run build`, `bun run build:frontend`, `bun run build:all`, `bun run test`, `bun run lint`, `bun run typecheck`.
- `frontend`: `bun run build`, `bun run check`, `bun run test`.

CI definitions: .github/workflows/ci.yml, .github/workflows/docker.yml, .github/workflows/publish.yml. Presence does not prove a passing run.

Before acceptance attach actual test/typecheck/build evidence and explicitly record pending runtime/visual checks.
