# @hiai-gg/hiai-observe

Client SDK, CLI, MCP server, and Mastra exporter for
[HiAi Observe](https://github.com/HiAi-gg/hiai-observe) — the unified, self-hosted
observability platform for AI agents and TypeScript backends.

One package, four entry points. Works on **Node ≥ 18** and Bun.

```bash
npm install @hiai-gg/hiai-observe      # library + CLIs
# or run a CLI without installing:
npx @hiai-gg/hiai-observe dashboard
```

Configure with two env vars (used by the CLI and MCP server):

| Var | Default | |
|-----|---------|--|
| `HIAI_OBSERVE_URL` | `http://localhost:8001` | Observe base URL |
| `HIAI_OBSERVE_API_KEY` | — | project API key (`ho_…`), required |

## 1. CLI — `hiai-observe`

```bash
export HIAI_OBSERVE_API_KEY=ho_your_key
hiai-observe dashboard                 # health overview
hiai-observe issues --status unresolved
hiai-observe ai-cost --group-by model
hiai-observe traces --status error
hiai-observe uptime
hiai-observe logs --search ECONNREFUSED
hiai-observe infra                     # CPU / RAM / GPU / containers
hiai-observe alerts
```

Add `--json` to any command for machine-readable output.

## 2. MCP server — `hiai-observe-mcp`

Lets AI agents (Claude Code / Desktop, any MCP client) query Observe directly —
9 read tools (`observe_dashboard`, `observe_ai_cost`, `observe_list_issues`, …).

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

## 3. Client SDK

```ts
import { HiaiClient } from "@hiai-gg/hiai-observe";

const observe = new HiaiClient({ baseUrl: "http://localhost:8001", apiKey: "ho_your_key" });
const { data: issues } = await observe.issues.list({ status: "unresolved" });
```

## 4. Mastra exporter

```ts
import { Mastra } from "@mastra/core";
import { HiaiObserveExporter } from "@hiai-gg/hiai-observe/mastra";

const mastra = new Mastra({
  observability: {
    exporters: [new HiaiObserveExporter({
      endpoint: "http://localhost:8001",
      apiKey: process.env.HIAI_OBSERVE_API_KEY,
    })],
  },
});
```

## 5. Host metrics agent — `hiai-observe-agent` (Bun only)

A lightweight collector that reports host CPU/memory/uptime to a central Observe
instance for multi-host monitoring. It reads `/proc` via Bun APIs, so it
**requires the Bun runtime** — on Node it exits with a clear message.

```bash
HIAI_OBSERVE_URL=http://observe-host:8001 API_KEY=ho_your_key \
  bunx -p @hiai-gg/hiai-observe hiai-observe-agent
```

Future improvements (disk/network/per-container/temperature/GPU from remote
hosts) are tracked in the project [ROADMAP](https://github.com/HiAi-gg/hiai-observe/blob/master/docs/ROADMAP.md) (`PM-INF-1`).

> **Runtime support:** the SDK, CLI (`hiai-observe`), and MCP server
> (`hiai-observe-mcp`) run on **Node ≥ 18 and Bun**. The agent
> (`hiai-observe-agent`) is **Bun-only**.

## License

MIT
