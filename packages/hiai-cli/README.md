# @hiai-observe/cli

Command-line client for **HiAi Observe**. Query your observability stack from
any shell — handy for humans in a terminal, CI scripts, and Bash-tool agents
that don't have an MCP connection.

For MCP clients (Claude Desktop / Code) see [`@hiai-observe/mcp`](../hiai-mcp).

## Setup

```bash
export HIAI_OBSERVE_URL=http://localhost:8001   # default
export HIAI_OBSERVE_API_KEY=ho_your_key         # required
```

## Commands

```bash
hiai-observe dashboard                 # health overview (errors, uptime, traces)
hiai-observe issues [--status unresolved] [--level error] [--search <q>]
hiai-observe issue <id>                # stack trace + recent events
hiai-observe ai-cost [--group-by model|agent|workflow] [--project <id>]
hiai-observe traces [--status error] [--workflow <name>] [--agent <name>]
hiai-observe uptime                    # monitors and status
hiai-observe logs [--search <q>] [--level error] [--container <name>]
hiai-observe infra                     # CPU / RAM / GPU / containers
hiai-observe alerts                    # rules and recent history
hiai-observe health                    # server health
```

Add `--json` to any command for machine-readable output.

## Run

```bash
bunx @hiai-observe/cli dashboard
# or install globally
bun add -g @hiai-observe/cli && hiai-observe dashboard
```

## License

MIT
