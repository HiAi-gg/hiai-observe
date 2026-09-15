# hiai-observe — next-night 2026-09-15

Status: **review** (release candidate). Not accepted-live. Controller/Codex must review before merge or production deploy.

Writer: Grok implementation worker. Exclusive repo: `/mnt/data/projects/hiai-observe`. No worktrees, no sibling library edits, no DNS, no Coolify/production, no Docker Hub/npm publish.

## Task

Reconcile recorded gaps against current source and produce an evidence-backed RC:

| Recorded gap (plan / 2026-09-13 ROADMAP) | Fresh 2026-09-15 result |
|---|---|
| T01 Vite `:5197` not started | **Reproduced live.** `bun scripts/vite-health-gate.ts` → HTTP 200, `theme-observe`, empty-key sentinel. Graphical interaction on Dashboard, Logs, Login. |
| Integration / e2e not run | **Ran on disposable `hiai_observe_test` + API `:18001`.** `tests/e2e` + `tests/integration` **30 passed**. |
| 0002/0003 drizzle snapshots absent | **Resolved.** Journal now 0000–0005; snapshots 0002–0005 committed. Correlation SQL is **0005** (origin/main already used 0003/0004 for Better Auth). |
| CI tenant tests historically excluded | **In RC source.** CI Test job has `Live tenant-scope DB tests` after migrate; local live 3/3 passed on `observe_test` / `hiai_observe_test`. |

Baseline before this night: detached `5eb0ce745586465f6575e608c6bdbc2e43c7775b` with preserved dirty T01–T03 work. `origin/main` was `c7ba81dc2463f24f35a4b6e69acf296879eef419` (Better Auth staff gate, dashboard URL join, HTTPS login redirects). RC branch `grok/next-night-20260915` is **origin/main + that work**, not a rewind of Better Auth.

## Before / after

**Before (this session start)**

- Detached HEAD at `5eb0ce7`; dirty tree from 2026-09-13/14 Grok passes (uncommitted).
- Vite `:5197` listening; first 3s curl timed out, 8s curl HTTP 200.
- API `:8001` `{status, version}` 200 against **shared** `app_hiai_observe` (not mutated).
- `http://127.0.0.1/hiai-observe/` Caddy **502**; `https://192.168.1.111/hiai-observe/` unreachable from this host.
- `drizzle/meta/` had 0000/0001 snapshots only. Untracked `0003_logs_trace_correlation.sql` **collided in name** with `origin/main` `0003_better_auth.sql`.
- origin/main CI had no `vite-health` job and no explicit live tenant step.

**After**

- Branch `grok/next-night-20260915` on top of `origin/main`.
- Empty-key Vite sentinel kept (does **not** bake `HIAI_OBSERVE_API_KEY`).
- Correlation migration renamed to `drizzle/0005_logs_trace_correlation.sql`; comment no longer contains `;` (`migrate.ts` splits on `;`).
- Snapshots 0002–0005; `generateMigration(0004,0005)` is only `trace_id` / `span_id` + indexes.
- Isolated fixture `observe_test` / `hiai_observe_test` used for migrate, 0005 old→new, tenant 3/3, e2e. **`app_hiai_observe` not migrated.**
- Verification API on **`:18001`** (did not steal the existing `:8001` watch, which is still the shared-DB process and was not listening after the merge reload).

## Commands and results

| Command | Exit | Result |
|---|---|---|
| `bun --no-env-file run typecheck` (flock) | 0 | `tsc --noEmit` clean |
| `env -u DATABASE_URL -u TENANT_SCOPE_LIVE_DB -u OBSERVE_MIGRATE_LIVE -u INTEGRATION -u VITE_HEALTH_GATE bun --no-env-file run test` (flock) | 0 | **70 files passed / 2 skipped; 666 passed / 5 skipped** |
| `bun --no-env-file run --cwd frontend test` (flock) | 0 | **4 files, 164 passed** |
| `bun --no-env-file run build` (flock) | 0 | 1244 modules, `dist/index.js` 3.86 MB |
| `bun --no-env-file run build:frontend` (flock) | 0 | adapter-static wrote `frontend/build` |
| Isolated `scripts/migrate.ts` (0005 comment fix) | 0 | applied `0005_logs_trace_correlation.sql` |
| `OBSERVE_MIGRATE_LIVE=1` `tests/migrations/0005-apply.test.ts` + journal + staff-ui + isolated-db (flock) | 0 | **23 passed / 1 skipped** (live Vite gate skipped without `VITE_HEALTH_GATE`) |
| `TENANT_SCOPE_LIVE_DB=1` `tests/middleware/tenant-scope.test.ts` (flock) | 0 | **3 passed** |
| `INTEGRATION=1` `vitest run tests/e2e tests/integration` vs `:18001` (flock) | 0 | **3 files, 30 passed** |
| `VITE_HEALTH_GATE=1 bun --no-env-file run test tests/staff-ui-runtime.test.ts` (flock) | 0 | **2 passed** |
| `bun scripts/vite-health-gate.ts` | 0 | `ok http://127.0.0.1:5197/hiai-observe/ status=200 bytes=1777` |
| `GET http://127.0.0.1:18001/api/health` | 200 | `{"status":"ok","version":"0.2.3"}` |
| `GET http://127.0.0.1:18001/api/dashboard` (no auth) | 401 | `{"error":"Unauthorized"}` |
| `GET http://127.0.0.1:18001/` (no cookie) | 302 | `Location: /login` |

Logs: `/tmp/observe-next-night-checks/`.

## Graphical interaction

Named `agent-browser` session `hiai-observe-next-night`. HTTP 200 was not treated as proof.

- Desktop Dashboard (dark + light toggle) — shell renders; Vite proxy to `:8001` returns **502** because the shared watch is down. Error + Retry is real UI, not a blank 200.
- Logs page: Pause, Auto-refresh, search box, level/container filters, Download. Typed `trace` + Enter. Network: repeated `GET /hiai-observe/api/dashboard` **502**.
- Mobile viewport 390×844, dark and light.
- Keyboard: Tab from search; login email field filled, Tab to password. Empty Sign in uses HTML5 required.
- Vite `/hiai-observe/login`: email/password form (“Restricted to authorized operators”). **No real-user sign-in, no invented identity.**
- After `build:frontend`, API `:18001/login` serves the same form (pre-rebuild SPA showed “Page Not Found”).
- Console eval: `theme-observe`, `readyState=complete`.

Evidence PNGs: `docs/acceptance/next-night-20260915/`.

## SHA / URL

- Branch: `grok/next-night-20260915`
- Commit SHA is the tip of that branch after the acceptance commit (see git). Parent merge: `31a25137d398f0f8400296dc7e325dfaaa935732`.
- Local URLs: `http://127.0.0.1:5197/hiai-observe/`, `http://127.0.0.1:18001/` (isolated RC process).
- Intended production: HiAI Observe on **INFRA-01** via GitHub → Coolify. **Not deployed this pass.**
- No confirmed separate public domain in DOMAIN_PLAN.md for this service.

## Remaining blockers

1. Windows LAN `https://192.168.1.111/hiai-observe/` not reachable from DEV-01; `http://127.0.0.1/hiai-observe/` is Caddy host-match **502** to `:50111`. Shared Caddy was **not** edited (first-stage infra freeze).
2. Existing `bun run --parallel dev:api dev:ui` (`:8001` / `:5197`) still points at `app_hiai_observe`. After merge reload, `:8001` was not listening. Isolated verification used `:18001`. Do not run `scripts/migrate.ts` against `app_hiai_observe` from DEV-01.
3. Production Coolify image / HTTPS / apex are **controller** after source acceptance.
4. Wave leftovers unchanged: **PM-INF-1**, **PM-RBAC** (SSO beyond Better Auth staff gate).
5. Docker Hub / npm publish still wait for CI `workflow_run` on push to main / tags. This pass does not publish.

## Rollback

```bash
git checkout main
# or revert the RC PR
```

SQL 0005 is additive `IF NOT EXISTS`. Isolated test DB only. Shared `app_hiai_observe` and production were not migrated. Old-host disposition: none (no domain cutover).

## Deploy candidate

Hand to the single controller: branch `grok/next-night-20260915`, GitHub PR to `main`, CI must be green. Do not mark accepted-live without controller scenario evidence on INFRA-01.
