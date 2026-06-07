# @hiai-observe/mcp

[Model Context Protocol](https://modelcontextprotocol.io) server for **HiAi
Observe**. It lets AI agents ask your observability stack questions directly —
"what's broken?", "how much am I spending on LLM calls?", "is everything up?",
"show me the slow workflows" — instead of a human opening a dashboard.

Agents query Observe far more often than people do; this is their front door.

## Tools

| Tool | What it returns |
|------|-----------------|
| `observe_dashboard` | 24h errors, uptime %, active containers, trace count, recent issues |
| `observe_list_issues` | Error-tracking issues (filter by status/level/search) |
| `observe_get_issue` | One issue: stack trace, metadata, recent events |
| `observe_ai_cost` | LLM token usage + estimated cost by model / agent / workflow |
| `observe_list_traces` | Recent AI/agent traces (filter by workflow/agent/status) |
| `observe_uptime` | Uptime monitors and current status |
| `observe_search_logs` | Search stored container logs |
| `observe_infrastructure` | Host CPU/RAM/disk, containers, and GPU stats |
| `observe_alerts` | Alert rules and recent history |

All tools are read-only.

## Configuration

Two environment variables:

| Var | Default | Notes |
|-----|---------|-------|
| `HIAI_OBSERVE_URL` | `http://localhost:8001` | Observe base URL |
| `HIAI_OBSERVE_API_KEY` | — | **required** — a project API key (`ho_…`) |

## Use it

### Claude Code / any MCP client (`.mcp.json`)

```json
{
  "mcpServers": {
    "hiai-observe": {
      "command": "bunx",
      "args": ["@hiai-observe/mcp"],
      "env": {
        "HIAI_OBSERVE_URL": "http://localhost:8001",
        "HIAI_OBSERVE_API_KEY": "ho_your_key"
      }
    }
  }
}
```

### Claude Desktop (`claude_desktop_config.json`)

Same `mcpServers` block as above.

### Run directly (stdio)

```bash
HIAI_OBSERVE_API_KEY=ho_your_key bunx @hiai-observe/mcp
```

## License

MIT
