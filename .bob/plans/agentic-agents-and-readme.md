# Plan: Agentic AGENTS.md + README Agentic Quickstart

## Goal
Update AGENTS.md for AI agents and add agentic quickstart to README.md alongside manual quickstart.

---

## Wave 1: AGENTS.md Overhaul

### Task 1.1 — Update Identity & Purpose section
**File:** `AGENTS.md`
**Change:** Update version to v0.1.6, add log worker defense note.
- Line 8: `v0.1.6 — MVP complete, production-ready with hardened log worker`
- Line 14: add `- Log streaming uses 5-layer defense: container filtering → sampling → token bucket rate limiting → backpressure → concurrent insert semaphore`

### Task 1.2 — Update Runtime Contract
- Fix DB port: `5433` (not 5432)
- Add frontend dev port: `5174`

### Task 1.3 — Update Repo Map table
Add/update rows:
| `src/workers/` | Health check, retention cleanup, maintenance |
| `src/lib/` | Auth helpers, RBAC, logger, config loading |
| `tests/` | 24 test files (243 unit + integration tests) |
Update `docs/` to include configuration.md

### Task 1.4 — Add "How AI Agents Should Install This" section
Insert after Architecture Decisions. Content:
- Step 1: Clone, generate API key, edit .env
- Step 2: Docker compose up
- Step 3: Integrate into user's project (Mastra exporter, Sentry SDK, OTLP)
- Step 4: Verify health + open UI
- Small VPS preset (5 env vars for <512MB)

### Task 1.5 — Expand Environment Variables table
Add all 7 log streaming vars + RETENTION_DAYS + ADMIN_API_KEY + ENCRYPTION_KEY

### Task 1.6 — Update Critic Guidelines
Add:
- Check that log worker defenses are enabled for production (5 layers)
- Check that frontend uses `apiKey` store, NOT raw `localStorage.getItem`

---

## Wave 2: README Agentic Quickstart

### Task 2.1 — Add agentic quickstart section
**File:** `README.md`
**Insert after:** Quick Start section (line ~27)
**Title:** `## Agentic Quickstart (AI-Powered Setup)`
**Content:** Copy-paste prompts for 3 AI assistants:
1. **OpenCode / Claude Code** — prompt to install, configure, and integrate hiai-observe
2. **Cursor** — prompt with agent mode instructions
3. **GitHub Copilot** — prompt for workspace setup

Each prompt includes:
- Clone + .env setup
- Docker compose up
- Integration into user's existing project (Mastra, Sentry, OTLP)
- Small VPS optimization

---

## Wave 3: Verify

### Task 3.1 — Run typecheck + tests
```bash
cd projects/hiai-observe && bun run typecheck && bun run test
```

---

## Deliverables
- `AGENTS.md` (~200 lines) — complete agent operating manual with install section
- `README.md` — new Agentic Quickstart section
- Typecheck: 0 errors
- Tests: 243 passed
