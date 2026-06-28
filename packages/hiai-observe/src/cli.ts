#!/usr/bin/env node
const BASE_URL = (process.env.HIAI_OBSERVE_URL ?? "http://localhost:8001").replace(/\/$/, "");
const API_KEY = process.env.HIAI_OBSERVE_API_KEY;

type Query = Record<string, string | number | undefined>;

interface Issue {
  id: string;
  title: string;
  level: string;
  status: string;
  count: number;
  lastSeen: string;
  createdAt: string;
}

interface Trace {
  id: string;
  workflowName?: string;
  agentName?: string;
  status: string;
  startTime: string;
  endTime?: string;
  latencyMs?: number;
}

interface Monitor {
  id: string;
  name: string;
  type: string;
  url: string;
  status: string;
  uptimePercentage?: number;
  lastCheckedAt?: string;
}

interface LogEntry {
  timestamp: string;
  level: string;
  container: string;
  message: string;
}

async function call(path: string, query?: Query): Promise<unknown> {
  const url = new URL(`${BASE_URL}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }
  }
  const headers: Record<string, string> = {};
  if (API_KEY) headers.Authorization = `Bearer ${API_KEY}`;
  const res = await fetch(url, { headers });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Observe API ${res.status} on ${path}: ${text.slice(0, 300)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Resolve a project id: use the explicit one, else the first project the key can see. */
let cachedProjectId: string | undefined;
async function resolveProjectId(explicit?: string): Promise<string> {
  if (explicit) return explicit;
  if (cachedProjectId) return cachedProjectId;
  const res = (await call("/api/projects")) as { projects?: Array<{ id: string }> };
  const id = res.projects?.[0]?.id;
  if (!id) throw new Error("No project found — pass --project <id>.");
  cachedProjectId = id;
  return id;
}

const IS_JSON = process.argv.includes("--json");

function out(data: unknown) {
  if (IS_JSON) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
}

function pad(s: string | number, w: number): string {
  const str = String(s);
  return str.length >= w ? str.slice(0, w) : str + " ".repeat(w - str.length);
}

function table(
  rows: Array<Record<string, string | number>>,
  columns: Array<{ key: string; header: string; width: number }>,
) {
  if (rows.length === 0) {
    console.log("(no data)");
    return;
  }
  const header = columns.map((c) => pad(c.header, c.width)).join("  ");
  console.log(header);
  console.log(columns.map((c) => "-".repeat(c.width)).join("  "));
  for (const row of rows) {
    const line = columns.map((c) => pad(String(row[c.key] ?? ""), c.width)).join("  ");
    console.log(line);
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

async function cmdDashboard() {
  const data = (await call("/api/dashboard")) as Record<string, unknown>;
  if (IS_JSON) {
    out(data);
    return;
  }

  console.log("╔══════════════════════════════════════════╗");
  console.log("║        HiAi Observe Dashboard            ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log();

  const kv: Array<[string, string]> = [];
  if (typeof data.errorCount24h === "number") kv.push(["Errors (24h)", String(data.errorCount24h)]);
  if (typeof data.traceCount24h === "number") kv.push(["Traces (24h)", String(data.traceCount24h)]);
  if (typeof data.uptimePercentage === "number")
    kv.push(["Uptime %", `${data.uptimePercentage.toFixed(2)}%`]);
  if (typeof data.activeContainers === "number")
    kv.push(["Active Containers", String(data.activeContainers)]);
  if (typeof data.activeAlerts === "number") kv.push(["Active Alerts", String(data.activeAlerts)]);

  for (const [k, v] of kv) {
    console.log(`${pad(k, 18)} ${v}`);
  }

  const recent = data.recentIssues as Issue[] | undefined;
  if (recent && recent.length > 0) {
    console.log();
    console.log("Recent Issues:");
    table(
      recent.map((i) => ({
        id: i.id.slice(0, 8),
        title: truncate(i.title, 35),
        level: i.level,
        status: i.status,
        count: String(i.count),
        last: fmtDate(i.lastSeen),
      })),
      [
        { key: "id", header: "ID", width: 10 },
        { key: "title", header: "Title", width: 37 },
        { key: "level", header: "Level", width: 7 },
        { key: "status", header: "Status", width: 10 },
        { key: "count", header: "Count", width: 6 },
        { key: "last", header: "Last Seen", width: 16 },
      ],
    );
  }

  const errorBuckets = data.errorBuckets as Array<{ hour: string; count: number }> | undefined;
  if (errorBuckets && errorBuckets.length > 0) {
    console.log();
    console.log("Error Trend (24h):");
    const maxCount = Math.max(...errorBuckets.map((b) => b.count));
    const barWidth = 40;
    for (const b of errorBuckets) {
      const barLen = maxCount > 0 ? Math.round((b.count / maxCount) * barWidth) : 0;
      const bar = "█".repeat(barLen);
      const hour = new Date(b.hour).getHours().toString().padStart(2, "0") + ":00";
      console.log(`${pad(hour, 6)} ${pad(bar, barWidth + 2)} ${String(b.count).padStart(3)}`);
    }
  }
}

async function cmdIssues(args: string[]) {
  const status = extractFlag(args, "--status");
  const level = extractFlag(args, "--level");
  const search = extractFlag(args, "--search");
  const limit = parseInt(extractFlag(args, "--limit") ?? "20", 10);

  const data = (await call("/api/issues", { status, level, search, limit })) as {
    issues?: Issue[];
  };
  if (IS_JSON) {
    out(data);
    return;
  }

  const issues = data.issues ?? [];
  console.log(`Issues (${issues.length} shown):`);
  table(
    issues.map((i) => ({
      id: i.id.slice(0, 8),
      title: truncate(i.title, 40),
      level: i.level,
      status: i.status,
      count: String(i.count),
      last: fmtDate(i.lastSeen),
    })),
    [
      { key: "id", header: "ID", width: 10 },
      { key: "title", header: "Title", width: 42 },
      { key: "level", header: "Level", width: 7 },
      { key: "status", header: "Status", width: 10 },
      { key: "count", header: "Count", width: 6 },
      { key: "last", header: "Last Seen", width: 16 },
    ],
  );
}

async function cmdIssue(args: string[]) {
  const id = args[0];
  if (!id) {
    console.error("Usage: hiai-observe issue <id>");
    process.exit(1);
  }
  const data = await call(`/api/issues/${id}`);
  if (IS_JSON) {
    out(data);
    return;
  }

  const issue = data as Record<string, unknown>;
  console.log("╔══════════════════════════════════════════╗");
  console.log("║           Issue Detail                   ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log();
  console.log(`${pad("ID:", 14)} ${issue.id}`);
  console.log(`${pad("Title:", 14)} ${issue.title}`);
  console.log(`${pad("Level:", 14)} ${issue.level}`);
  console.log(`${pad("Status:", 14)} ${issue.status}`);
  console.log(`${pad("Count:", 14)} ${issue.count}`);
  console.log(`${pad("Created:", 14)} ${fmtDate(issue.createdAt as string)}`);
  console.log(`${pad("Last Seen:", 14)} ${fmtDate(issue.lastSeen as string)}`);

  const stackTrace = issue.stackTrace as string | undefined;
  if (stackTrace) {
    console.log();
    console.log("Stack Trace:");
    console.log(stackTrace);
  }

  const events = issue.events as Array<Record<string, unknown>> | undefined;
  if (events && events.length > 0) {
    console.log();
    console.log(`Recent Events (${events.length}):`);
    for (const ev of events.slice(0, 5)) {
      const msg = truncate(String(ev.message ?? ev.errorMessage ?? "—"), 60);
      console.log(`  [${fmtDate(ev.createdAt as string)}] ${msg}`);
    }
  }
}

async function cmdAiCost(args: string[]) {
  const groupBy = extractFlag(args, "--group-by") ?? "model";
  const from = extractFlag(args, "--from");
  const to = extractFlag(args, "--to");
  const projectId = await resolveProjectId(extractFlag(args, "--project"));

  const data = await call("/api/traces/stats", { projectId, groupBy, from, to });
  if (IS_JSON) {
    out(data);
    return;
  }

  console.log(`AI Cost (grouped by ${groupBy}):`);
  console.log();

  const stats = (data as Record<string, unknown>).tokenUsage as
    | Array<Record<string, unknown>>
    | undefined;
  if (!stats || stats.length === 0) {
    console.log("(no token usage in range)");
    return;
  }

  table(
    stats.map((s) => ({
      name: truncate(String(s.groupKey ?? "—"), 25),
      calls: String(s.requestCount ?? 0),
      tokens: String(s.totalTokens ?? 0),
      cost: `$${Number(s.estimatedCostUsd ?? 0).toFixed(4)}`,
    })),
    [
      { key: "name", header: groupBy.charAt(0).toUpperCase() + groupBy.slice(1), width: 27 },
      { key: "calls", header: "Calls", width: 7 },
      { key: "tokens", header: "Tokens", width: 10 },
      { key: "cost", header: "Cost", width: 10 },
    ],
  );
}

async function cmdTraces(args: string[]) {
  const workflowName = extractFlag(args, "--workflow");
  const agentName = extractFlag(args, "--agent");
  const status = extractFlag(args, "--status");
  const limit = parseInt(extractFlag(args, "--limit") ?? "20", 10);

  const data = (await call("/api/traces", { workflowName, agentName, status, limit })) as {
    traces?: Trace[];
  };
  if (IS_JSON) {
    out(data);
    return;
  }

  const traces = data.traces ?? [];
  console.log(`Traces (${traces.length} shown):`);
  table(
    traces.map((t) => ({
      id: t.id.slice(0, 8),
      workflow: truncate(t.workflowName ?? "—", 20),
      agent: truncate(t.agentName ?? "—", 15),
      status: t.status,
      latency: t.latencyMs ? `${t.latencyMs}ms` : "—",
      start: fmtDate(t.startTime),
    })),
    [
      { key: "id", header: "ID", width: 10 },
      { key: "workflow", header: "Workflow", width: 22 },
      { key: "agent", header: "Agent", width: 17 },
      { key: "status", header: "Status", width: 10 },
      { key: "latency", header: "Latency", width: 10 },
      { key: "start", header: "Started", width: 16 },
    ],
  );
}

async function cmdUptime() {
  const data = (await call("/api/monitors")) as { monitors?: Monitor[] };
  if (IS_JSON) {
    out(data);
    return;
  }

  const monitors = data.monitors ?? [];
  console.log(`Uptime Monitors (${monitors.length}):`);
  table(
    monitors.map((m) => ({
      name: truncate(m.name, 25),
      type: m.type,
      status: m.status,
      uptime: m.uptimePercentage !== undefined ? `${m.uptimePercentage.toFixed(2)}%` : "—",
      last: m.lastCheckedAt ? fmtDate(m.lastCheckedAt) : "—",
    })),
    [
      { key: "name", header: "Name", width: 27 },
      { key: "type", header: "Type", width: 8 },
      { key: "status", header: "Status", width: 10 },
      { key: "uptime", header: "Uptime", width: 10 },
      { key: "last", header: "Last Check", width: 16 },
    ],
  );
}

async function cmdLogs(args: string[]) {
  const search = extractFlag(args, "--search");
  const level = extractFlag(args, "--level");
  const container = extractFlag(args, "--container");
  const limit = parseInt(extractFlag(args, "--limit") ?? "50", 10);

  const data = (await call("/api/logs", { search, level, container, limit })) as {
    logs?: LogEntry[];
  };
  if (IS_JSON) {
    out(data);
    return;
  }

  const logs = data.logs ?? [];
  console.log(`Logs (${logs.length} shown):`);
  for (const log of logs) {
    const levelColor =
      log.level === "error"
        ? "\x1b[31m"
        : log.level === "warn"
          ? "\x1b[33m"
          : log.level === "info"
            ? "\x1b[32m"
            : "\x1b[36m";
    const reset = "\x1b[0m";
    console.log(
      `${levelColor}[${log.level.padEnd(5)}]${reset} ${fmtDate(log.timestamp)} ${pad(log.container, 15)} ${truncate(log.message, 80)}`,
    );
  }
}

async function cmdInfra() {
  const [hosts, containers, gpu] = await Promise.all([
    call("/api/infrastructure/hosts").catch((e) => ({ error: String(e) })),
    call("/api/infrastructure/containers").catch((e) => ({ error: String(e) })),
    call("/api/infrastructure/gpu").catch((e) => ({ error: String(e) })),
  ]);

  const data = { hosts, containers, gpu };
  if (IS_JSON) {
    out(data);
    return;
  }

  console.log("╔══════════════════════════════════════════╗");
  console.log("║        Infrastructure Status             ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log();

  const hostList = (hosts as Record<string, unknown>).hosts as
    | Array<Record<string, unknown>>
    | undefined;
  if (hostList && hostList.length > 0) {
    console.log("Hosts:");
    table(
      hostList.map((h) => ({
        name: truncate(String(h.name ?? "—"), 20),
        cpu: `${Number(h.cpuPercent ?? 0).toFixed(1)}%`,
        mem: `${Number(h.memUsedGb ?? 0).toFixed(1)}/${Number(h.memTotalGb ?? 0).toFixed(1)} GB`,
        disk: `${Number(h.diskUsedGb ?? 0).toFixed(1)}/${Number(h.diskTotalGb ?? 0).toFixed(1)} GB`,
        uptime: fmtUptime(Number(h.uptimeSeconds ?? 0)),
      })),
      [
        { key: "name", header: "Host", width: 22 },
        { key: "cpu", header: "CPU", width: 8 },
        { key: "mem", header: "Memory", width: 18 },
        { key: "disk", header: "Disk", width: 18 },
        { key: "uptime", header: "Uptime", width: 12 },
      ],
    );
    console.log();
  }

  const containerList = (containers as Record<string, unknown>).containers as
    | Array<Record<string, unknown>>
    | undefined;
  if (containerList && containerList.length > 0) {
    console.log("Containers:");
    table(
      containerList.map((c) => ({
        name: truncate(String(c.name ?? "—"), 25),
        status: String(c.status ?? "—"),
        cpu: `${Number(c.cpuPercent ?? 0).toFixed(1)}%`,
        mem: `${Number(c.memUsageMb ?? 0).toFixed(0)} MB`,
      })),
      [
        { key: "name", header: "Container", width: 27 },
        { key: "status", header: "Status", width: 10 },
        { key: "cpu", header: "CPU", width: 8 },
        { key: "mem", header: "Memory", width: 12 },
      ],
    );
    console.log();
  }

  const gpuList = (gpu as Record<string, unknown>).gpus as
    | Array<Record<string, unknown>>
    | undefined;
  if (gpuList && gpuList.length > 0) {
    console.log("GPUs:");
    table(
      gpuList.map((g) => ({
        name: truncate(String(g.name ?? "—"), 25),
        util: `${Number(g.utilizationPercent ?? 0).toFixed(0)}%`,
        mem: `${Number(g.memoryUsedMb ?? 0).toFixed(0)}/${Number(g.memoryTotalMb ?? 0).toFixed(0)} MB`,
        temp: `${Number(g.temperatureC ?? 0).toFixed(0)}°C`,
      })),
      [
        { key: "name", header: "GPU", width: 27 },
        { key: "util", header: "Util", width: 6 },
        { key: "mem", header: "Memory", width: 20 },
        { key: "temp", header: "Temp", width: 8 },
      ],
    );
  }
}

async function cmdAlerts(args: string[]) {
  const limit = parseInt(extractFlag(args, "--limit") ?? "20", 10);

  const [rules, history] = await Promise.all([
    call("/api/alerts"),
    call("/api/alerts/history", { limit }).catch((e) => ({ error: String(e) })),
  ]);

  const data = { rules, history };
  if (IS_JSON) {
    out(data);
    return;
  }

  console.log("╔══════════════════════════════════════════╗");
  console.log("║           Alerts Status                  ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log();

  const ruleList = (rules as Record<string, unknown>).alerts as
    | Array<Record<string, unknown>>
    | undefined;
  if (ruleList && ruleList.length > 0) {
    console.log("Alert Rules:");
    table(
      ruleList.map((r) => ({
        name: truncate(String(r.name ?? "—"), 25),
        condition: String(r.conditionType ?? "—"),
        threshold: String(r.threshold ?? "—"),
        channel: String(r.channelType ?? "—"),
        enabled: r.enabled ? "yes" : "no",
      })),
      [
        { key: "name", header: "Name", width: 27 },
        { key: "condition", header: "Condition", width: 12 },
        { key: "threshold", header: "Threshold", width: 12 },
        { key: "channel", header: "Channel", width: 10 },
        { key: "enabled", header: "Enabled", width: 8 },
      ],
    );
    console.log();
  }

  const histList = (history as Record<string, unknown>).history as
    | Array<Record<string, unknown>>
    | undefined;
  if (histList && histList.length > 0) {
    console.log("Recent History:");
    table(
      histList.map((h) => ({
        alert: truncate(String(h.alertName ?? "—"), 25),
        triggered: fmtDate(h.triggeredAt as string),
        resolved: h.resolvedAt ? fmtDate(h.resolvedAt as string) : "—",
        message: truncate(String(h.message ?? "—"), 30),
      })),
      [
        { key: "alert", header: "Alert", width: 27 },
        { key: "triggered", header: "Triggered", width: 16 },
        { key: "resolved", header: "Resolved", width: 16 },
        { key: "message", header: "Message", width: 32 },
      ],
    );
  }
}

async function cmdHealth() {
  const data = await call("/health");
  if (IS_JSON) {
    out(data);
    return;
  }

  console.log("╔══════════════════════════════════════════╗");
  console.log("║           Health Check                   ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log();
  console.log(`${pad("Status:", 14)} ${(data as Record<string, unknown>).status ?? "OK"}`);
  console.log(`${pad("URL:", 14)} ${BASE_URL}`);
  console.log(`${pad("Timestamp:", 14)} ${new Date().toISOString()}`);
}

function extractFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx !== -1 && idx + 1 < args.length) {
    return args[idx + 1];
  }
  return undefined;
}

function fmtUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

const HELP = `
hiai-observe CLI — Thin command-line interface for HiAi Observe

Usage: hiai-observe <command> [options] [--json]

Commands:
  dashboard              24h overview: errors, uptime, containers, traces
  issues [opts]          List error-tracking issues
  issue <id>             Show full detail for one issue
  ai-cost [opts]         AI/LLM token usage and estimated cost
  traces [opts]          List recent AI/agent traces
  uptime                 Uptime monitors and current status
  logs [opts]            Search stored container logs
  infra                  Host resources, containers, and GPU stats
  alerts [opts]          Alert rules and recent history
  health                 Quick connectivity check

Global flags:
  --json                 Output raw JSON instead of formatted tables
  --help, -h             Show this help

Issue options:
  --status <unresolved|resolved|ignored>
  --level <error|warning|info|debug>
  --search <text>
  --limit <n>            (default 20)

AI-cost options:
  --group-by <model|agent|workflow>  (default model)
  --from <ISO>
  --to <ISO>

Traces options:
  --workflow <name>
  --agent <name>
  --status <status>
  --limit <n>            (default 20)

Logs options:
  --search <text>
  --level <level>
  --container <name>
  --limit <n>            (default 50)

Alerts options:
  --limit <n>            (default 20)

Environment:
  HIAI_OBSERVE_URL       Base URL (default http://localhost:8001)
  HIAI_OBSERVE_API_KEY   Bearer API key

Examples:
  HIAI_OBSERVE_API_KEY=ho_... hiai-observe dashboard
  hiai-observe issues --status unresolved --limit 10
  hiai-observe issue abc123
  hiai-observe ai-cost --group-by workflow --from 2024-01-01
  hiai-observe logs --search "error" --level error --limit 20
`;

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const rest = args.slice(1);

  if (!cmd || cmd === "--help" || cmd === "-h") {
    console.log(HELP);
    process.exit(0);
  }

  try {
    switch (cmd) {
      case "dashboard":
        await cmdDashboard();
        break;
      case "issues":
        await cmdIssues(rest);
        break;
      case "issue":
        await cmdIssue(rest);
        break;
      case "ai-cost":
        await cmdAiCost(rest);
        break;
      case "traces":
        await cmdTraces(rest);
        break;
      case "uptime":
        await cmdUptime();
        break;
      case "logs":
        await cmdLogs(rest);
        break;
      case "infra":
        await cmdInfra();
        break;
      case "alerts":
        await cmdAlerts(rest);
        break;
      case "health":
        await cmdHealth();
        break;
      default:
        console.error(`Unknown command: ${cmd}`);
        console.log(HELP);
        process.exit(1);
    }
  } catch (err) {
    if (IS_JSON) {
      console.log(
        JSON.stringify({ error: err instanceof Error ? err.message : String(err) }, null, 2),
      );
    } else {
      console.error(`\x1b[31mError:\x1b[0m ${err instanceof Error ? err.message : String(err)}`);
    }
    process.exit(1);
  }
}

main();
