#!/usr/bin/env node
/**
 * @hiai-gg/hiai-observe — Model Context Protocol server for HiAi Observe.
 *
 * Exposes the read-oriented Observe API as MCP tools so AI agents can ask
 * "what's broken / how much am I spending / is everything up" directly.
 *
 * Config (env):
 *   HIAI_OBSERVE_URL      base URL (default http://localhost:8001)
 *   HIAI_OBSERVE_API_KEY  Bearer API key (required)
 *
 * Run: HIAI_OBSERVE_API_KEY=ho_... bunx -p @hiai-gg/hiai-observe hiai-observe-mcp
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE_URL = (process.env.HIAI_OBSERVE_URL ?? "http://localhost:8001").replace(/\/$/, "");
const API_KEY = process.env.HIAI_OBSERVE_API_KEY;

if (!API_KEY) {
  console.error("HIAI_OBSERVE_API_KEY is required");
  process.exit(1);
}

type Query = Record<string, string | number | undefined>;

/** Call the Observe API and return parsed JSON (or throw with a readable message). */
async function call(path: string, query?: Query): Promise<unknown> {
  const url = new URL(`${BASE_URL}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url, { headers: { Authorization: `Bearer ${API_KEY}` } });
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
  if (!id) throw new Error("No project found — pass projectId explicitly.");
  cachedProjectId = id;
  return id;
}

const server = new McpServer({ name: "hiai-observe", version: "0.1.0" });

/** Register a read tool that maps args to an API call and returns JSON text. */
function tool(
  name: string,
  description: string,
  inputSchema: z.ZodRawShape,
  run: (args: Record<string, unknown>) => Promise<unknown>,
) {
  server.registerTool(name, { description, inputSchema }, async (args: Record<string, unknown>) => {
    try {
      const data = await run(args ?? {});
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return {
        isError: true,
        content: [
          { type: "text" as const, text: err instanceof Error ? err.message : String(err) },
        ],
      };
    }
  });
}

const projectId = z
  .string()
  .describe("Project id (optional; defaults to the key's project)")
  .optional();

tool(
  "observe_dashboard",
  "Unified overview: 24h error count, uptime %, active containers, trace count, recent issues.",
  {},
  () => call("/api/dashboard"),
);

tool(
  "observe_list_issues",
  "List error-tracking issues, newest first. Filter by status/level and full-text search.",
  {
    status: z.enum(["unresolved", "resolved", "ignored"]).optional(),
    level: z.enum(["error", "warning", "info", "debug"]).optional(),
    search: z.string().optional(),
    limit: z.number().int().min(1).max(100).default(20),
  },
  (a) =>
    call("/api/issues", {
      status: a.status as string,
      level: a.level as string,
      search: a.search as string,
      limit: a.limit as number,
    }),
);

tool(
  "observe_get_issue",
  "Full detail for one issue: stack trace, metadata, and recent events.",
  { id: z.string().describe("Issue id") },
  (a) => call(`/api/issues/${a.id}`),
);

tool(
  "observe_ai_cost",
  "AI/LLM token usage and estimated cost, grouped by model, agent, or workflow.",
  {
    projectId,
    groupBy: z.enum(["model", "agent", "workflow"]).default("model"),
    from: z.string().describe("ISO start time (optional)").optional(),
    to: z.string().describe("ISO end time (optional)").optional(),
  },
  async (a) =>
    call("/api/traces/stats", {
      projectId: await resolveProjectId(a.projectId as string),
      groupBy: a.groupBy as string,
      from: a.from as string,
      to: a.to as string,
    }),
);

tool(
  "observe_list_traces",
  "List recent AI/agent traces. Filter by workflow, agent, or status.",
  {
    workflowName: z.string().optional(),
    agentName: z.string().optional(),
    status: z.string().optional(),
    limit: z.number().int().min(1).max(100).default(20),
  },
  (a) =>
    call("/api/traces", {
      workflowName: a.workflowName as string,
      agentName: a.agentName as string,
      status: a.status as string,
      limit: a.limit as number,
    }),
);

tool(
  "observe_uptime",
  "Uptime monitors and their current status (HTTP/DNS/Ping/Keyword/gRPC).",
  { projectId },
  (a) => call("/api/monitors", { project_id: a.projectId as string }),
);

tool(
  "observe_search_logs",
  "Search stored container logs by text, level, and container.",
  {
    search: z.string().optional(),
    level: z.string().optional(),
    container: z.string().optional(),
    limit: z.number().int().min(1).max(200).default(50),
  },
  (a) =>
    call("/api/logs", {
      search: a.search as string,
      level: a.level as string,
      container: a.container as string,
      limit: a.limit as number,
    }),
);

tool(
  "observe_infrastructure",
  "Current host resources (CPU/RAM/disk), running containers, and GPU stats.",
  {},
  async () => {
    const [hosts, containers, gpu] = await Promise.all([
      call("/api/infrastructure/hosts").catch((e) => ({ error: String(e) })),
      call("/api/infrastructure/containers").catch((e) => ({ error: String(e) })),
      call("/api/infrastructure/gpu").catch((e) => ({ error: String(e) })),
    ]);
    return { hosts, containers, gpu };
  },
);

tool(
  "observe_alerts",
  "Configured alert rules and recent alert history.",
  { limit: z.number().int().min(1).max(100).default(20) },
  async (a) => {
    const [rules, history] = await Promise.all([
      call("/api/alerts"),
      call("/api/alerts/history", { limit: a.limit as number }).catch((e) => ({
        error: String(e),
      })),
    ]);
    return { rules, history };
  },
);

tool(
  "observe_search",
  "Full-text search across issues, traces, events, and logs. Cross-entity type filter.",
  {
    q: z.string().describe("Search query (required)"),
    type: z.enum(["issues", "traces", "events", "logs"]).optional(),
    projectId,
  },
  async (a) =>
    call("/api/search", {
      q: a.q as string,
      type: a.type as string,
      projectId: await resolveProjectId(a.projectId as string),
    }),
);

tool(
  "observe_list_releases",
  "List releases with deployment health and status, newest first.",
  {
    projectId,
    limit: z.number().int().min(1).max(100).default(20),
  },
  async (a) =>
    call("/api/releases", {
      projectId: await resolveProjectId(a.projectId as string),
      limit: a.limit as number,
    }),
);

tool("observe_list_team", "List team members for a project.", { projectId }, async (a) =>
  call("/api/team", { projectId: await resolveProjectId(a.projectId as string) }),
);

tool(
  "observe_list_incidents",
  "List incidents, newest first. Filter by status (investigating/identified/monitoring/resolved).",
  {
    status: z.enum(["investigating", "identified", "monitoring", "resolved"]).optional(),
    limit: z.number().int().min(1).max(100).default(20),
  },
  (a) =>
    call("/api/incidents", {
      status: a.status as string,
      limit: a.limit as number,
    }),
);

tool(
  "observe_get_notifications",
  "Get notification channel configuration for a project (Telegram, Discord, SMTP, webhooks).",
  { projectId },
  async (a) =>
    call("/api/notifications", {
      projectId: await resolveProjectId(a.projectId as string),
    }),
);

tool(
  "observe_list_events",
  "List error events for a specific issue, newest first.",
  {
    issueId: z.string().describe("Issue id (required)"),
    limit: z.number().int().min(1).max(100).default(20),
  },
  (a) =>
    call("/api/events", {
      issueId: a.issueId as string,
      limit: a.limit as number,
    }),
);

tool(
  "observe_log_stats",
  "Aggregated log statistics (counts by level, container, time bucket).",
  { projectId },
  async (a) =>
    call("/api/logs/stats", {
      projectId: await resolveProjectId(a.projectId as string),
    }),
);

tool(
  "observe_get_badge",
  "Generate a status badge URL (uptime or incidents) in SVG or PNG format.",
  {
    type: z.enum(["uptime", "incidents"]).describe("Badge type"),
    slug: z.string().describe("Project or monitor slug"),
    id: z.string().describe("Target id (monitor or project)"),
    format: z.enum(["svg", "png"]).default("svg"),
  },
  (a) =>
    call(`/api/badges/${a.type}/${a.slug}/${a.id}`, {
      format: a.format as string,
    }),
);

tool(
  "observe_list_saved_searches",
  "List saved search queries for a project.",
  { projectId },
  async (a) =>
    call("/api/saved-searches", {
      projectId: await resolveProjectId(a.projectId as string),
    }),
);

tool(
  "observe_get_maintenance",
  "List scheduled maintenance windows for a project.",
  { projectId },
  async (a) =>
    call("/api/maintenance", {
      projectId: await resolveProjectId(a.projectId as string),
    }),
);

tool(
  "observe_export",
  "Export issues/traces/logs data for offline analysis (CSV or JSON).",
  {
    type: z.enum(["issues", "traces", "logs"]).describe("Data type to export"),
    format: z.enum(["csv", "json"]).default("json"),
    from: z.string().describe("ISO start time (optional)").optional(),
    to: z.string().describe("ISO end time (optional)").optional(),
  },
  (a) =>
    call(`/api/export/${a.type}`, {
      format: a.format as string,
      from: a.from as string,
      to: a.to as string,
    }),
);

await server.connect(new StdioServerTransport());
console.error(`hiai-observe MCP server connected (${BASE_URL})`);
