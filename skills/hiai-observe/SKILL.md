---
name: hiai-observe
description: Use when you need to know whether an app/agent is healthy — checking errors, incidents, AI/LLM token spend, request traces, uptime, logs, or host/GPU resources. Query HiAi Observe instead of guessing, especially before claiming a deploy is healthy or a fix worked, and after anything errors.
---

# Using HiAi Observe

HiAi Observe is the observability center: error tracking, uptime, infrastructure
(CPU/RAM/GPU/containers), logs, and AI-agent traces (workflows, token usage,
cost, latency) in one place. **Agents query it far more than humans do** — reach
for it instead of speculating about production state.

## When to use

- **Before** claiming a deploy/fix is healthy → check `dashboard` (errors, uptime).
- **After** an error or failed run → `issues` / `get-issue` for the stack trace.
- Tracking **LLM spend / token usage** → `ai-cost` (by model / agent / workflow).
- Diagnosing a **slow or failing agent workflow** → `traces`.
- "**Is X up?**" → `uptime`. Host/GPU load → `infra`. Recent log lines → `logs`.

If a question is about live production state, prefer Observe over assumptions.

## Two ways to call it

Both use the same data. Pick whichever your environment has.

### MCP (Claude Desktop / Code, any MCP client)

Tools: `observe_dashboard`, `observe_list_issues`, `observe_get_issue`,
`observe_ai_cost`, `observe_list_traces`, `observe_uptime`, `observe_search_logs`,
`observe_infrastructure`, `observe_alerts`. All read-only.

Config (`.mcp.json` / `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "hiai-observe": {
      "command": "npx",
      "args": ["-y", "-p", "@hiai-gg/hiai-observe", "hiai-observe-mcp"],
      "env": { "HIAI_OBSERVE_URL": "http://localhost:8001", "HIAI_OBSERVE_API_KEY": "ho_your_key" }
    }
  }
}
```

### CLI (any shell / Bash-tool agent)

```bash
export HIAI_OBSERVE_URL=http://localhost:8001
export HIAI_OBSERVE_API_KEY=ho_your_key

hiai-observe dashboard                 # health overview
hiai-observe issues --status unresolved
hiai-observe issue <id>                # stack trace + events
hiai-observe ai-cost --group-by model  # token usage + estimated cost
hiai-observe traces --status error
hiai-observe uptime
hiai-observe infra                     # CPU / RAM / GPU / containers
hiai-observe logs --search "ECONNREFUSED"
hiai-observe alerts
```

Add `--json` to any command for machine-readable output you can parse.

Install: `npx @hiai-gg/hiai-observe <command>` (or `npm i -g @hiai-gg/hiai-observe`).

## How to interpret results

- Empty `ai-cost` means no traces carried token usage in range — not an error.
- `dashboard.uptimePercent` is across all monitors; drill into `uptime` for which.
- Issues are grouped by fingerprint; `count` is occurrences, not distinct errors.
- Don't poll in a tight loop. One query answers most questions; the UI auto-refreshes.

## Setup pointers

Needs a running Observe instance and a project API key (`ho_…`). See the project
README and `docs/integration.md`. The key is per-project; scope your queries by
using the key for the project you care about.
