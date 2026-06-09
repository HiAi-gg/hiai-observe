/**
 * @hiai-gg/hiai-observe — TypeScript client SDK for HiAi Observe API.
 *
 * Provides typed access to all major resources: issues, monitors, alerts,
 * traces, logs, releases, team, dashboard, comments, maintenance, incidents,
 * notifications, and search.
 *
 * @example
 * ```ts
 * import { HiaiClient } from "@hiai-gg/hiai-observe";
 *
 * const client = new HiaiClient({
 *   baseUrl: "http://localhost:8001",
 *   apiKey: "ho_your_api_key_here",
 * });
 *
 * const { data, total } = await client.issues.list({ status: "unresolved" });
 * const dashboard = await client.dashboard.get();
 * ```
 */

// ── Error class ────────────────────────────────────────────────────────────

export class HiaiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "HiaiError";
  }
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface HiaiClientOptions {
  /** Base URL of the HiAi Observe instance (e.g. "http://localhost:8001") */
  baseUrl: string;
  /** API key for authentication */
  apiKey: string;
  /** Custom fetch implementation (defaults to global fetch) */
  fetch?: typeof globalThis.fetch;
}

export interface PaginationParams {
  limit?: number;
  offset?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  logoUrl?: string | null;
  customDomain?: string | null;
  autoResolveOnDeploy?: boolean;
  createdAt: string;
}

export interface Issue {
  id: string;
  projectId: string;
  title: string;
  type: string;
  fingerprint: string;
  status: "unresolved" | "resolved" | "ignored";
  count: number;
  firstSeen: string;
  lastSeen: string;
  assignedTo?: string | null;
  environment?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface IssueDetail extends Issue {
  events: Event[];
}

export interface Event {
  id: string;
  projectId: string;
  issueId?: string | null;
  message?: string | null;
  exceptionType?: string | null;
  stackTrace?: string | null;
  level: string;
  tags?: Record<string, string> | null;
  context?: Record<string, unknown> | null;
  fingerprint?: string | null;
  sdk?: string | null;
  environment?: string | null;
  createdAt: string;
}

export interface Monitor {
  id: string;
  projectId: string;
  name: string;
  url: string;
  type: string;
  monitorGroup?: string | null;
  intervalSeconds: number;
  active: boolean;
  method?: string | null;
  headers?: Record<string, string> | null;
  body?: string | null;
  authType?: string | null;
  ignoreSsl?: boolean;
  maxRedirects?: number;
  keyword?: string | null;
  keywordNot?: string | null;
  dnsRecordType?: string | null;
  dnsExpectedValue?: string | null;
  dnsResolver?: string | null;
  uptime24h?: number | null;
  createdAt: string;
}

export interface MonitorCreateInput {
  name: string;
  url: string;
  project_id: string;
  type?: string;
  group?: string;
  interval_seconds?: number;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  auth_type?: string;
  auth_value?: string;
  ignore_ssl?: boolean;
  max_redirects?: number;
  keyword?: string;
  keyword_not?: string;
  dns_record_type?: string;
  dns_expected_value?: string;
  dns_resolver?: string;
}

export interface MonitorUpdateInput {
  name?: string;
  url?: string;
  interval_seconds?: number;
  active?: boolean;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  auth_type?: string;
  auth_value?: string;
  ignore_ssl?: boolean;
  max_redirects?: number;
  keyword?: string;
  keyword_not?: string;
  dns_record_type?: string;
  dns_expected_value?: string;
  dns_resolver?: string;
}

export interface AlertCondition {
  type: "error_rate" | "uptime_down" | "resource_threshold" | "trace_error" | "token_usage";
  threshold: number;
  duration?: number;
  operator: "gt" | "lt" | "eq" | "gte" | "lte";
  consecutiveFailures?: number;
  resource?: "cpu" | "memory" | "disk";
  model?: string;
}

export interface AlertChannel {
  type: string;
  target: string;
}

export interface Alert {
  id: string;
  projectId: string;
  name: string;
  severity: "critical" | "warning" | "info";
  condition: AlertCondition;
  channels: AlertChannel[];
  isActive: boolean;
  cooldownSeconds: number;
  lastTriggered?: string | null;
  createdAt: string;
}

export interface AlertCreateInput {
  name: string;
  projectId: string;
  severity?: "critical" | "warning" | "info";
  condition: AlertCondition;
  channels: AlertChannel[];
  cooldownSeconds?: number;
}

export interface AlertUpdateInput {
  name?: string;
  severity?: "critical" | "warning" | "info";
  condition?: Partial<AlertCondition>;
  channels?: AlertChannel[];
  isActive?: boolean;
  cooldownSeconds?: number;
}

export interface AlertHistoryEntry {
  id: string;
  alertId: string;
  triggeredAt: string;
  resolvedAt?: string | null;
  context?: Record<string, unknown> | null;
}

export interface Trace {
  id: string;
  projectId: string;
  traceId: string;
  spanId: string;
  parentSpanId?: string | null;
  name: string;
  kind?: string | null;
  status?: string;
  startTime: string;
  endTime?: string | null;
  durationMs?: number | null;
  attributes?: Record<string, unknown> | null;
  tokenUsage?: { prompt: number; completion: number; total: number } | null;
  model?: string | null;
  createdAt: string;
}

export interface LogEntry {
  id: string;
  containerId: string;
  containerName: string;
  stream: string;
  message: string;
  level?: string | null;
  timestamp: string;
}

export interface Release {
  id: string;
  projectId: string;
  version: string;
  environment: string;
  deployedAt?: string | null;
  createdAt: string;
}

export interface ReleaseCreateInput {
  projectId: string;
  version: string;
  environment?: "production" | "staging" | "development";
  deployedAt?: string;
}

export interface ReleaseHealth {
  releaseId: string;
  version: string;
  environment: string;
  newIssuesCount: number;
  errorRate: number;
  healthScore: "green" | "yellow" | "red";
  windowHours: number;
}

export interface TeamMember {
  id: string;
  projectId: string;
  name: string;
  email: string;
  role: "owner" | "admin" | "member" | "viewer";
  createdAt: string;
  updatedAt?: string | null;
}

export interface TeamMemberCreateInput {
  projectId: string;
  name: string;
  email: string;
  role?: "owner" | "admin" | "member" | "viewer";
}

export interface TeamMemberUpdateInput {
  name?: string;
  email?: string;
  role?: "owner" | "admin" | "member" | "viewer";
}

export interface Comment {
  id: string;
  issueId: string;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface CommentCreateInput {
  authorName: string;
  body: string;
}

export interface MaintenanceWindow {
  id: string;
  projectId: string;
  name: string;
  description?: string | null;
  startsAt: string;
  endsAt: string;
  monitorIds: string[];
  createdAt: string;
}

export interface MaintenanceWindowCreateInput {
  projectId: string;
  name: string;
  description?: string;
  startsAt: string;
  endsAt: string;
  monitorIds?: string[];
}

export interface MaintenanceWindowUpdateInput {
  name?: string;
  description?: string;
  startsAt?: string;
  endsAt?: string;
  monitorIds?: string[];
}

export interface Incident {
  id: string;
  projectId: string;
  monitorId?: string | null;
  title: string;
  status: "investigating" | "identified" | "monitoring" | "resolved";
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string | null;
}

export interface IncidentCreateInput {
  projectId: string;
  monitorId?: string;
  title: string;
  status?: "investigating" | "identified" | "monitoring" | "resolved";
}

export interface IncidentUpdateInput {
  title?: string;
  status?: "investigating" | "identified" | "monitoring" | "resolved";
  monitorId?: string;
}

export interface DashboardData {
  errorCount24h: number;
  uptimePercent: number;
  activeContainers: number;
  traceCount24h: number;
  recentIssues: Array<{ id: string; title: string; type: string; count: number; status: string; lastSeen: string }>;
  monitorStatuses: Array<{ id: string; name: string; url: string; active: boolean; isUp: boolean }>;
  alertCount: number;
  errorBuckets: Array<{ hour: string; count: number }>;
  traceBuckets: Array<{ hour: string; count: number }>;
}

export interface NotificationConfig {
  id: string;
  projectId: string;
  channel: string;
  config: Record<string, string>;
  enabled: boolean;
  configured: boolean;
  createdAt: string;
  updatedAt?: string | null;
}

export interface SearchResults {
  issues: Array<Issue & { projectName: string }>;
  events: Array<Event & { projectName: string }>;
  traces: Array<Trace & { projectName: string }>;
}

// ── Resource client helpers ────────────────────────────────────────────────

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

async function request<T>(
  fetch: FetchFn,
  baseUrl: string,
  apiKey: string,
  method: string,
  path: string,
  body?: unknown,
  query?: Record<string, string | number | undefined>,
): Promise<T> {
  const url = new URL(path, baseUrl);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
  };

  const init: RequestInit = { method, headers };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  const response = await fetch(url.toString(), init);

  if (!response.ok) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = await response.text().catch(() => undefined);
    }
    const message =
      typeof body === "object" && body !== null && "error" in body
        ? String((body as { error: unknown }).error)
        : `HTTP ${response.status}`;
    throw new HiaiError(message, response.status, body);
  }

  return (await response.json()) as T;
}

// ── Resource sub-clients ───────────────────────────────────────────────────

class IssuesResource {
  constructor(
    private readonly fetch: FetchFn,
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  /** List issues with optional filters */
  list(params?: {
    projectId?: string;
    status?: string;
    search?: string;
    environment?: string;
    level?: string;
    limit?: number;
    offset?: number;
  }): Promise<PaginatedResponse<Issue>> {
    return request(this.fetch, this.baseUrl, this.apiKey, "GET", "/api/issues", undefined, params as Record<string, string | number | undefined>);
  }

  /** Get issue detail with recent events */
  get(id: string): Promise<IssueDetail> {
    return request(this.fetch, this.baseUrl, this.apiKey, "GET", `/api/issues/${id}`);
  }

  /** Update issue status or assignment */
  update(id: string, data: { status?: string; assignedTo?: string | null }): Promise<Issue> {
    return request(this.fetch, this.baseUrl, this.apiKey, "PATCH", `/api/issues/${id}`, data);
  }

  /** Delete an issue and its events */
  delete(id: string): Promise<{ deleted: boolean }> {
    return request(this.fetch, this.baseUrl, this.apiKey, "DELETE", `/api/issues/${id}`);
  }

  /** Merge source issues into a target */
  merge(targetIssueId: string, sourceIssueIds: string[]): Promise<{ merged: number; targetIssueId: string; totalEvents: number }> {
    return request(this.fetch, this.baseUrl, this.apiKey, "POST", "/api/issues/merge", { targetIssueId, sourceIssueIds });
  }

  /** List comments for an issue */
  listComments(issueId: string, params?: PaginationParams): Promise<PaginatedResponse<Comment>> {
    return request(this.fetch, this.baseUrl, this.apiKey, "GET", `/api/issues/${issueId}/comments`, undefined, params as Record<string, string | number | undefined>);
  }

  /** Add comment to an issue */
  addComment(issueId: string, data: CommentCreateInput): Promise<Comment> {
    return request(this.fetch, this.baseUrl, this.apiKey, "POST", `/api/issues/${issueId}/comments`, data);
  }
}

class EventsResource {
  constructor(
    private readonly fetch: FetchFn,
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  /** List events */
  list(params?: { issueId?: string; projectId?: string; limit?: number; offset?: number }): Promise<PaginatedResponse<Event>> {
    return request(this.fetch, this.baseUrl, this.apiKey, "GET", "/api/events", undefined, params as Record<string, string | number | undefined>);
  }

  /** Get single event */
  get(id: string): Promise<Event> {
    return request(this.fetch, this.baseUrl, this.apiKey, "GET", `/api/events/${id}`);
  }
}

class MonitorsResource {
  constructor(
    private readonly fetch: FetchFn,
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  /** List monitors with uptime */
  list(params?: { project_id?: string; group?: string; hours?: number }): Promise<{ monitors: Monitor[] }> {
    return request(this.fetch, this.baseUrl, this.apiKey, "GET", "/api/monitors", undefined, params as Record<string, string | number | undefined>);
  }

  /** Get monitor detail */
  get(id: string): Promise<{ monitor: Monitor }> {
    return request(this.fetch, this.baseUrl, this.apiKey, "GET", `/api/monitors/${id}`);
  }

  /** Create a monitor */
  create(data: MonitorCreateInput): Promise<{ monitor: Monitor }> {
    return request(this.fetch, this.baseUrl, this.apiKey, "POST", "/api/monitors", data);
  }

  /** Update a monitor */
  update(id: string, data: MonitorUpdateInput): Promise<{ monitor: Monitor }> {
    return request(this.fetch, this.baseUrl, this.apiKey, "PUT", `/api/monitors/${id}`, data);
  }

  /** Delete a monitor */
  delete(id: string): Promise<{ deleted: boolean }> {
    return request(this.fetch, this.baseUrl, this.apiKey, "DELETE", `/api/monitors/${id}`);
  }

  /** Get monitor groups */
  groups(projectId?: string): Promise<{ groups: string[] }> {
    return request(this.fetch, this.baseUrl, this.apiKey, "GET", "/api/monitors/groups", undefined, { project_id: projectId });
  }

  /** Get check history for a monitor */
  checks(id: string, params?: { limit?: number; offset?: number; from?: string; to?: string }): Promise<{ data: unknown[]; total: number }> {
    return request(this.fetch, this.baseUrl, this.apiKey, "GET", `/api/monitors/${id}/checks`, undefined, params as Record<string, string | number | undefined>);
  }
}

class AlertsResource {
  constructor(
    private readonly fetch: FetchFn,
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  /** List alert rules */
  list(params?: { projectId?: string; search?: string; limit?: number; offset?: number }): Promise<{ items: Alert[]; total: number; limit: number; offset: number }> {
    return request(this.fetch, this.baseUrl, this.apiKey, "GET", "/api/alerts", undefined, params as Record<string, string | number | undefined>);
  }

  /** Get alert detail with history */
  get(id: string): Promise<Alert & { history: AlertHistoryEntry[] }> {
    return request(this.fetch, this.baseUrl, this.apiKey, "GET", `/api/alerts/${id}`);
  }

  /** Create alert rule */
  create(data: AlertCreateInput): Promise<Alert> {
    return request(this.fetch, this.baseUrl, this.apiKey, "POST", "/api/alerts", data);
  }

  /** Update alert rule */
  update(id: string, data: AlertUpdateInput): Promise<Alert> {
    return request(this.fetch, this.baseUrl, this.apiKey, "PUT", `/api/alerts/${id}`, data);
  }

  /** Delete alert rule */
  delete(id: string): Promise<{ deleted: boolean }> {
    return request(this.fetch, this.baseUrl, this.apiKey, "DELETE", `/api/alerts/${id}`);
  }

  /** Test a single alert */
  test(id: string): Promise<unknown> {
    return request(this.fetch, this.baseUrl, this.apiKey, "POST", `/api/alerts/${id}/test`);
  }

  /** Test all active alerts */
  testAll(): Promise<{ message: string; results: unknown[] }> {
    return request(this.fetch, this.baseUrl, this.apiKey, "POST", "/api/alerts/test-all");
  }

  /** List alert trigger history */
  history(params?: { alertId?: string; limit?: number; offset?: number }): Promise<{ items: AlertHistoryEntry[]; total: number }> {
    return request(this.fetch, this.baseUrl, this.apiKey, "GET", "/api/alerts/history", undefined, params as Record<string, string | number | undefined>);
  }

  /** List available notification channels */
  channels(): Promise<{ channels: unknown[] }> {
    return request(this.fetch, this.baseUrl, this.apiKey, "GET", "/api/alerts/channels");
  }
}

class TracesResource {
  constructor(
    private readonly fetch: FetchFn,
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  /** List traces with filters */
  list(params?: {
    projectId?: string;
    traceId?: string;
    workflowName?: string;
    agentName?: string;
    status?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ data: Trace[]; total: number; limit: number; offset: number }> {
    return request(this.fetch, this.baseUrl, this.apiKey, "GET", "/api/traces", undefined, params as Record<string, string | number | undefined>);
  }

  /** Get trace detail with span tree */
  get(id: string): Promise<unknown> {
    return request(this.fetch, this.baseUrl, this.apiKey, "GET", `/api/traces/${id}`);
  }

  /** Aggregated stats (token usage + latency) */
  stats(projectId: string, params?: { from?: string; to?: string; groupBy?: string }): Promise<{ tokenUsage: unknown; latency: unknown }> {
    return request(this.fetch, this.baseUrl, this.apiKey, "GET", "/api/traces/stats", undefined, { projectId, ...params } as Record<string, string | number | undefined>);
  }

  /** List workflow runs */
  workflows(params?: { projectId?: string; workflowName?: string; status?: string; limit?: number; offset?: number }): Promise<unknown> {
    return request(this.fetch, this.baseUrl, this.apiKey, "GET", "/api/traces/workflows", undefined, params as Record<string, string | number | undefined>);
  }

  /** Get workflow run detail */
  getWorkflow(id: string): Promise<unknown> {
    return request(this.fetch, this.baseUrl, this.apiKey, "GET", `/api/traces/workflows/${id}`);
  }
}

class LogsResource {
  constructor(
    private readonly fetch: FetchFn,
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  /** Search logs */
  search(params?: {
    container?: string;
    level?: string;
    search?: string;
    regex?: string;
    fuzzy?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ data: { logs: LogEntry[]; total: number; limit: number; offset: number } }> {
    return request(this.fetch, this.baseUrl, this.apiKey, "GET", "/api/logs", undefined, params as Record<string, string | number | undefined>);
  }

  /** Log statistics (24h) */
  stats(): Promise<{ total24h: number; byLevel: Record<string, number>; byContainer: Array<{ name: string; count: number }>; byHour: Array<{ hour: string; count: number }> }> {
    return request(this.fetch, this.baseUrl, this.apiKey, "GET", "/api/logs/stats");
  }

  /** Log volume over time */
  volume(params?: { interval?: string; containerId?: string; from?: string; to?: string }): Promise<{ data: unknown[] }> {
    return request(this.fetch, this.baseUrl, this.apiKey, "GET", "/api/logs/volume", undefined, params as Record<string, string | number | undefined>);
  }

  /** List log containers */
  containers(): Promise<{ data: string[] }> {
    return request(this.fetch, this.baseUrl, this.apiKey, "GET", "/api/logs/containers");
  }

  /** Clear logs before a timestamp */
  clear(before?: string): Promise<{ deleted: number }> {
    return request(this.fetch, this.baseUrl, this.apiKey, "DELETE", "/api/logs", undefined, { before });
  }
}

class ReleasesResource {
  constructor(
    private readonly fetch: FetchFn,
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  /** List releases */
  list(params?: { projectId?: string; environment?: string; limit?: number; offset?: number }): Promise<PaginatedResponse<Release>> {
    return request(this.fetch, this.baseUrl, this.apiKey, "GET", "/api/releases", undefined, params as Record<string, string | number | undefined>);
  }

  /** Get release detail */
  get(id: string): Promise<Release> {
    return request(this.fetch, this.baseUrl, this.apiKey, "GET", `/api/releases/${id}`);
  }

  /** Create a release */
  create(data: ReleaseCreateInput): Promise<Release> {
    return request(this.fetch, this.baseUrl, this.apiKey, "POST", "/api/releases", data);
  }

  /** Update a release */
  update(id: string, data: { version?: string; environment?: string; deployedAt?: string }): Promise<Release> {
    return request(this.fetch, this.baseUrl, this.apiKey, "PUT", `/api/releases/${id}`, data);
  }

  /** Delete a release */
  delete(id: string): Promise<{ deleted: boolean }> {
    return request(this.fetch, this.baseUrl, this.apiKey, "DELETE", `/api/releases/${id}`);
  }

  /** Get release health metrics */
  health(id: string): Promise<ReleaseHealth> {
    return request(this.fetch, this.baseUrl, this.apiKey, "GET", `/api/releases/${id}/health`);
  }
}

class TeamResource {
  constructor(
    private readonly fetch: FetchFn,
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  /** List team members */
  list(params?: { projectId?: string; limit?: number; offset?: number }): Promise<PaginatedResponse<TeamMember>> {
    return request(this.fetch, this.baseUrl, this.apiKey, "GET", "/api/team", undefined, params as Record<string, string | number | undefined>);
  }

  /** Add team member */
  create(data: TeamMemberCreateInput): Promise<TeamMember> {
    return request(this.fetch, this.baseUrl, this.apiKey, "POST", "/api/team", data);
  }

  /** Update team member */
  update(id: string, data: TeamMemberUpdateInput): Promise<TeamMember> {
    return request(this.fetch, this.baseUrl, this.apiKey, "PUT", `/api/team/${id}`, data);
  }

  /** Remove team member */
  delete(id: string): Promise<{ deleted: boolean }> {
    return request(this.fetch, this.baseUrl, this.apiKey, "DELETE", `/api/team/${id}`);
  }
}

class CommentsResource {
  constructor(
    private readonly fetch: FetchFn,
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  /** Delete a comment */
  delete(id: string): Promise<{ deleted: boolean }> {
    return request(this.fetch, this.baseUrl, this.apiKey, "DELETE", `/api/comments/${id}`);
  }
}

class MaintenanceResource {
  constructor(
    private readonly fetch: FetchFn,
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  /** List maintenance windows */
  list(params?: { projectId?: string; status?: string; limit?: number; offset?: number }): Promise<{ items: MaintenanceWindow[]; total: number }> {
    return request(this.fetch, this.baseUrl, this.apiKey, "GET", "/api/maintenance", undefined, params as Record<string, string | number | undefined>);
  }

  /** Get currently active maintenance windows */
  activeNow(projectId?: string): Promise<{ items: MaintenanceWindow[] }> {
    return request(this.fetch, this.baseUrl, this.apiKey, "GET", "/api/maintenance/active/now", undefined, { projectId });
  }

  /** Get maintenance window */
  get(id: string): Promise<MaintenanceWindow> {
    return request(this.fetch, this.baseUrl, this.apiKey, "GET", `/api/maintenance/${id}`);
  }

  /** Create maintenance window */
  create(data: MaintenanceWindowCreateInput): Promise<MaintenanceWindow> {
    return request(this.fetch, this.baseUrl, this.apiKey, "POST", "/api/maintenance", data);
  }

  /** Update maintenance window */
  update(id: string, data: MaintenanceWindowUpdateInput): Promise<MaintenanceWindow> {
    return request(this.fetch, this.baseUrl, this.apiKey, "PUT", `/api/maintenance/${id}`, data);
  }

  /** Delete maintenance window */
  delete(id: string): Promise<{ deleted: boolean }> {
    return request(this.fetch, this.baseUrl, this.apiKey, "DELETE", `/api/maintenance/${id}`);
  }
}

class IncidentsResource {
  constructor(
    private readonly fetch: FetchFn,
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  /** List incidents */
  list(params?: { projectId?: string; status?: string; limit?: number; offset?: number }): Promise<{ items: Incident[]; total: number }> {
    return request(this.fetch, this.baseUrl, this.apiKey, "GET", "/api/incidents", undefined, params as Record<string, string | number | undefined>);
  }

  /** Get active (non-resolved) incidents */
  active(projectId?: string): Promise<{ items: Incident[] }> {
    return request(this.fetch, this.baseUrl, this.apiKey, "GET", "/api/incidents/active", undefined, { projectId });
  }

  /** Get incident */
  get(id: string): Promise<Incident> {
    return request(this.fetch, this.baseUrl, this.apiKey, "GET", `/api/incidents/${id}`);
  }

  /** Create incident */
  create(data: IncidentCreateInput): Promise<Incident> {
    return request(this.fetch, this.baseUrl, this.apiKey, "POST", "/api/incidents", data);
  }

  /** Update incident */
  update(id: string, data: IncidentUpdateInput): Promise<Incident> {
    return request(this.fetch, this.baseUrl, this.apiKey, "PUT", `/api/incidents/${id}`, data);
  }

  /** Delete incident */
  delete(id: string): Promise<{ deleted: boolean }> {
    return request(this.fetch, this.baseUrl, this.apiKey, "DELETE", `/api/incidents/${id}`);
  }
}

class NotificationsResource {
  constructor(
    private readonly fetch: FetchFn,
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  /** List notification configs */
  list(projectId?: string): Promise<{ notifications: NotificationConfig[] }> {
    return request(this.fetch, this.baseUrl, this.apiKey, "GET", "/api/notifications", undefined, { projectId });
  }

  /** Get notification channel config */
  get(channel: string, projectId?: string): Promise<unknown> {
    return request(this.fetch, this.baseUrl, this.apiKey, "GET", `/api/notifications/${channel}`, undefined, { projectId });
  }

  /** Upsert notification channel config */
  upsert(channel: string, data: { projectId: string; config: Record<string, string>; enabled?: boolean }): Promise<unknown> {
    return request(this.fetch, this.baseUrl, this.apiKey, "PUT", `/api/notifications/${channel}`, data);
  }

  /** Delete notification channel config */
  delete(channel: string, projectId?: string): Promise<{ deleted: boolean }> {
    return request(this.fetch, this.baseUrl, this.apiKey, "DELETE", `/api/notifications/${channel}`, undefined, { projectId });
  }

  /** Test a notification channel */
  test(channel: string, projectId?: string): Promise<unknown> {
    return request(this.fetch, this.baseUrl, this.apiKey, "POST", `/api/notifications/${channel}/test`, undefined, { projectId });
  }
}

class SearchResource {
  constructor(
    private readonly fetch: FetchFn,
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  /** Cross-project search across issues, events, and traces */
  search(q: string, params?: { projectId?: string; limit?: number }): Promise<SearchResults> {
    return request(this.fetch, this.baseUrl, this.apiKey, "GET", "/api/search", undefined, { q, ...params } as Record<string, string | number | undefined>);
  }
}

class ProjectsResource {
  constructor(
    private readonly fetch: FetchFn,
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  /** List all projects */
  list(): Promise<{ projects: Project[] }> {
    return request(this.fetch, this.baseUrl, this.apiKey, "GET", "/api/projects");
  }

  /** Create a project */
  create(data: { name: string }): Promise<{ project: Project; apiKey: string }> {
    return request(this.fetch, this.baseUrl, this.apiKey, "POST", "/api/projects", data);
  }

  /** Delete a project and all its data */
  delete(id: string): Promise<{ deleted: boolean }> {
    return request(this.fetch, this.baseUrl, this.apiKey, "DELETE", `/api/projects/${id}`);
  }

  /** Rotate project API key */
  rotateKey(id: string): Promise<{ apiKey: string }> {
    return request(this.fetch, this.baseUrl, this.apiKey, "POST", `/api/projects/${id}/rotate-key`);
  }
}

class DashboardResource {
  constructor(
    private readonly fetch: FetchFn,
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  /** Get aggregated dashboard data */
  get(projectId?: string): Promise<DashboardData> {
    return request(this.fetch, this.baseUrl, this.apiKey, "GET", "/api/dashboard", undefined, { projectId });
  }
}

// ── Main client ────────────────────────────────────────────────────────────

/**
 * HiAi Observe client SDK.
 *
 * @example
 * ```ts
 * const client = new HiaiClient({
 *   baseUrl: "http://localhost:8001",
 *   apiKey: "ho_abc123",
 * });
 *
 * // List unresolved issues
 * const { data } = await client.issues.list({ status: "unresolved" });
 *
 * // Get dashboard summary
 * const dash = await client.dashboard.get();
 *
 * // Create a monitor
 * await client.monitors.create({ name: "API", url: "https://api.example.com/health", project_id: "..." });
 *
 * // Search across everything
 * const results = await client.search.search("timeout");
 * ```
 */
export class HiaiClient {
  private readonly fetch: FetchFn;
  private readonly baseUrl: string;
  private readonly apiKey: string;

  /** Issue tracking */
  readonly issues: IssuesResource;
  /** Error events */
  readonly events: EventsResource;
  /** Uptime monitors */
  readonly monitors: MonitorsResource;
  /** Alert rules and history */
  readonly alerts: AlertsResource;
  /** Distributed traces */
  readonly traces: TracesResource;
  /** Container log search */
  readonly logs: LogsResource;
  /** Release tracking */
  readonly releases: ReleasesResource;
  /** Team members */
  readonly team: TeamResource;
  /** Issue comments */
  readonly comments: CommentsResource;
  /** Maintenance windows */
  readonly maintenance: MaintenanceResource;
  /** Incident lifecycle */
  readonly incidents: IncidentsResource;
  /** Notification channel config */
  readonly notifications: NotificationsResource;
  /** Cross-project search */
  readonly search: SearchResource;
  /** Project management */
  readonly projects: ProjectsResource;
  /** Aggregated dashboard */
  readonly dashboard: DashboardResource;

  constructor(options: HiaiClientOptions) {
    this.fetch = options.fetch ?? globalThis.fetch;
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.apiKey = options.apiKey;

    this.issues = new IssuesResource(this.fetch, this.baseUrl, this.apiKey);
    this.events = new EventsResource(this.fetch, this.baseUrl, this.apiKey);
    this.monitors = new MonitorsResource(this.fetch, this.baseUrl, this.apiKey);
    this.alerts = new AlertsResource(this.fetch, this.baseUrl, this.apiKey);
    this.traces = new TracesResource(this.fetch, this.baseUrl, this.apiKey);
    this.logs = new LogsResource(this.fetch, this.baseUrl, this.apiKey);
    this.releases = new ReleasesResource(this.fetch, this.baseUrl, this.apiKey);
    this.team = new TeamResource(this.fetch, this.baseUrl, this.apiKey);
    this.comments = new CommentsResource(this.fetch, this.baseUrl, this.apiKey);
    this.maintenance = new MaintenanceResource(this.fetch, this.baseUrl, this.apiKey);
    this.incidents = new IncidentsResource(this.fetch, this.baseUrl, this.apiKey);
    this.notifications = new NotificationsResource(this.fetch, this.baseUrl, this.apiKey);
    this.search = new SearchResource(this.fetch, this.baseUrl, this.apiKey);
    this.projects = new ProjectsResource(this.fetch, this.baseUrl, this.apiKey);
    this.dashboard = new DashboardResource(this.fetch, this.baseUrl, this.apiKey);
  }

  /** Get the OpenAPI spec from the server */
  openapi(): Promise<Record<string, unknown>> {
    return request(this.fetch, this.baseUrl, this.apiKey, "GET", "/api/openapi.json");
  }
}
