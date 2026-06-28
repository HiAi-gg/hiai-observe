import { apiKey, currentProject } from "./stores.svelte";

const BASE_URL = typeof window !== "undefined" ? window.location.origin : "http://localhost:8001";
const DEFAULT_TIMEOUT = 10_000;

async function fetchWithAuth(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  const key = apiKey.current;
  if (key) {
    headers.set("Authorization", `Bearer ${key}`);
  }
  if (init?.body) {
    headers.set("Content-Type", "application/json");
  }
  return fetchWithTimeout(path, { ...init, headers });
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetchWithAuth(path, init);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/** Append projectId from store to search params when set */
function withProject(qs: URLSearchParams): URLSearchParams {
  const pid = currentProject.current;
  if (pid) qs.set("projectId", pid);
  return qs;
}

async function fetchWithTimeout(
  path: string,
  init?: RequestInit,
  timeout = DEFAULT_TIMEOUT,
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(`${BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(id);
  }
}

export async function getDashboard() {
  const qs = withProject(new URLSearchParams());
  return apiFetch<DashboardData>(`/api/dashboard?${qs}`);
}

export async function getIssues(params?: {
  status?: string;
  search?: string;
  environment?: string;
  level?: string;
  limit?: number;
  offset?: number;
}) {
  const qs = withProject(new URLSearchParams());
  if (params?.status) qs.set("status", params.status);
  if (params?.search) qs.set("search", params.search);
  if (params?.environment) qs.set("environment", params.environment);
  if (params?.level) qs.set("level", params.level);
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.offset) qs.set("offset", String(params.offset));
  // Server returns { data, total }; normalize to { issues } for callers.
  const res = await apiFetch<{ data: Issue[]; total: number }>(`/api/issues?${qs}`);
  return { issues: res.data ?? [], total: res.total ?? 0 };
}

export async function getIssue(id: string) {
  return apiFetch<Issue>(`/api/issues/${id}`);
}

export async function updateIssue(id: string, data: { status?: string; assignedTo?: string }) {
  return apiFetch<Issue>(`/api/issues/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function getEvents(params?: {
  issueId?: string;
  projectId?: string;
  limit?: string;
  offset?: string;
}) {
  const qs = new URLSearchParams();
  if (params?.issueId) qs.set("issueId", params.issueId);
  if (params?.projectId) qs.set("projectId", params.projectId);
  if (params?.limit) qs.set("limit", params.limit);
  if (params?.offset) qs.set("offset", params.offset);
  const pid = currentProject.current;
  if (pid) qs.set("projectId", pid);
  return apiFetch<{ data: IssueEvent[]; total: number }>(`/api/events?${qs}`);
}

export async function getMonitors(params?: { hours?: number; group?: string }) {
  const pid = currentProject.current;
  const qs = new URLSearchParams();
  if (pid) qs.set("project_id", pid);
  if (params?.hours) qs.set("hours", String(params.hours));
  if (params?.group) qs.set("group", params.group);
  return apiFetch<{ monitors: Monitor[] }>(`/api/monitors?${qs}`);
}

export async function getMonitorGroups() {
  return apiFetch<{ groups: Array<{ group: string; count: number }> }>(`/api/monitors/groups`);
}

export async function getMonitorChecks(monitorId: string, limit = 48) {
  return apiFetch<{
    checks: Array<{
      responseTimeMs?: number;
      response_time_ms?: number;
    }>;
  }>(`/api/monitors/${monitorId}/checks?limit=${limit}`);
}

export async function getContainerStats() {
  return apiFetch<{ containers: ContainerStats[] }>("/api/infrastructure/containers");
}

/** A stored container_stats row (camelCase, as the history endpoint returns it). */
export interface ContainerHistoryRow {
  collectedAt: string;
  name: string;
  image: string;
  status: string;
  cpuPercent: number;
  memoryPercent: number;
  networkRxBytes: number;
  networkTxBytes: number;
  blockReadBytes: number;
  blockWriteBytes: number;
}

export async function getContainerDetail(id: string, params?: { from?: string; to?: string }) {
  const qs = new URLSearchParams();
  if (params?.from) qs.set("from", params.from);
  if (params?.to) qs.set("to", params.to);
  return apiFetch<{
    containerId: string;
    data: ContainerHistoryRow[];
    count: number;
  }>(`/api/infrastructure/containers/${id}?${qs}`);
}

export async function getHostStats() {
  return apiFetch<HostStats>("/api/infrastructure/host");
}

export async function getGpuStats() {
  return apiFetch<{ gpus: GpuStat[]; count: number }>("/api/infrastructure/gpu");
}

export async function getLogs(params?: {
  container?: string;
  level?: string;
  search?: string;
  regex?: string;
  limit?: number;
  offset?: number;
}) {
  const qs = new URLSearchParams();
  if (params?.container) qs.set("container", params.container);
  if (params?.level) qs.set("level", params.level);
  if (params?.search) qs.set("search", params.search);
  if (params?.regex) qs.set("regex", params.regex);
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.offset) qs.set("offset", String(params.offset));
  return apiFetch<{
    data: { logs: LogEntry[]; total: number };
    error?: string;
  }>(`/api/logs?${qs}`);
}

export interface LogStats {
  total24h: number;
  byLevel: Record<string, number>;
  byContainer: Array<{ name: string; count: number }>;
  byHour: Array<{ hour: string; count: number }>;
}

export async function getLogStats() {
  return apiFetch<LogStats>("/api/logs/stats");
}

export interface LogVolumeBucket {
  time: string;
  count: number;
}

export async function getLogVolume(params?: {
  interval?: string;
  containerId?: string;
  from?: string;
  to?: string;
}) {
  const qs = new URLSearchParams();
  if (params?.interval) qs.set("interval", params.interval);
  if (params?.containerId) qs.set("containerId", params.containerId);
  if (params?.from) qs.set("from", params.from);
  if (params?.to) qs.set("to", params.to);
  return apiFetch<{ data: LogVolumeBucket[] }>("/api/logs/volume?" + qs);
}

export interface SavedSearch {
  id: string;
  name: string;
  query: string;
  filters?: Record<string, unknown> | null;
  projectId?: string | null;
  createdAt: string;
}

export async function getSavedSearches(projectId?: string) {
  const qs = new URLSearchParams();
  if (projectId) qs.set("projectId", projectId);
  return apiFetch<{ data: SavedSearch[] }>(`/api/saved-searches?${qs}`);
}

export async function createSavedSearch(data: {
  name: string;
  query: string;
  filters?: Record<string, unknown>;
  projectId?: string;
}) {
  return apiFetch<{ data: SavedSearch }>("/api/saved-searches", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function deleteSavedSearch(id: string) {
  return apiFetch<{ data: SavedSearch }>(`/api/saved-searches/${id}`, {
    method: "DELETE",
  });
}

export function getLogsDownloadUrl(params: {
  container?: string;
  level?: string;
  format?: string;
}): string {
  const qs = new URLSearchParams();
  qs.set("format", params.format ?? "csv");
  if (params.container) qs.set("container", params.container);
  if (params.level) qs.set("level", params.level);
  return `${BASE_URL}/api/export/logs?${qs}`;
}

export async function getTraces(params?: {
  workflow?: string;
  agent?: string;
  limit?: number;
  offset?: number;
  from?: string;
  to?: string;
}) {
  const qs = withProject(new URLSearchParams());
  if (params?.workflow) qs.set("workflow", params.workflow);
  if (params?.agent) qs.set("agent", params.agent);
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.offset) qs.set("offset", String(params.offset));
  if (params?.from) qs.set("from", params.from);
  if (params?.to) qs.set("to", params.to);
  // Server returns raw rows (camelCase + attributes); normalize to the flat,
  // snake_case Trace shape the pages render.
  type RawTrace = {
    id: string;
    traceId?: string;
    name?: string;
    status?: string;
    durationMs?: number;
    startTime?: string;
    createdAt?: string;
    attributes?: Record<string, unknown> | null;
  };
  const res = await apiFetch<{ data: RawTrace[]; total: number }>(`/api/traces?${qs}`);
  const traces: Trace[] = (res.data ?? []).map((t) => {
    const a = t.attributes ?? {};
    const tokens = Number(a["gen_ai.usage.total_tokens"]);
    return {
      id: t.id,
      trace_id: t.traceId ?? t.id ?? "",
      name: t.name ?? "",
      workflow: (a["mastra.workflow"] as string) ?? undefined,
      agent: (a["mastra.agent"] as string) ?? undefined,
      duration_ms: t.durationMs ?? 0,
      status: t.status ?? "ok",
      tokens_used: Number.isFinite(tokens) && tokens > 0 ? tokens : undefined,
      start_time: t.startTime ?? t.createdAt ?? "",
    };
  });
  return { traces, total: res.total ?? 0 };
}

export async function getTrace(id: string) {
  return apiFetch<TraceDetail>(`/api/traces/${id}`);
}

export async function getAlerts() {
  const qs = withProject(new URLSearchParams());
  // Server returns { items, total }; normalize to { alerts } for callers.
  const res = await apiFetch<{ items: AlertRule[]; total: number }>(`/api/alerts?${qs}`);
  return { alerts: res.items ?? [], total: res.total ?? 0 };
}

export async function createAlert(data: Omit<AlertRule, "id" | "created_at">) {
  return apiFetch<AlertRule>("/api/alerts", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function deleteAlert(id: string) {
  return apiFetch<void>(`/api/alerts/${id}`, { method: "DELETE" });
}

export async function testAlert(id: string) {
  return apiFetch<{
    ok: boolean;
    channels: Array<{
      type: string;
      target: string;
      ok: boolean;
      error?: string;
    }>;
  }>(`/api/alerts/${id}/test`, { method: "POST" });
}

export async function testAllAlerts() {
  return apiFetch<{
    message: string;
    results: Array<{ alertId: string; name: string; ok: boolean }>;
  }>("/api/alerts/test-all", { method: "POST" });
}

export async function getNotificationChannels() {
  return apiFetch<{
    channels: Array<{
      type: string;
      name: string;
      description: string;
      configFields: Array<{
        key: string;
        label: string;
        envVar: string;
        required: boolean;
      }>;
      configured: boolean;
    }>;
  }>("/api/alerts/channels");
}

// --- Projects ---

export async function getProjects() {
  return apiFetch<{ projects: Project[] }>("/api/projects");
}

export async function createProject(name: string) {
  return apiFetch<{ project: Project; apiKey: string }>("/api/projects", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function deleteProject(id: string) {
  return apiFetch<void>(`/api/projects/${id}`, { method: "DELETE" });
}

export async function rotateApiKey(id: string) {
  return apiFetch<{ apiKey: string }>(`/api/projects/${id}/rotate-key`, {
    method: "POST",
  });
}

// --- Alert History ---

export async function getAlertHistory(params?: {
  alertId?: string;
  limit?: number;
  offset?: number;
}) {
  const qs = withProject(new URLSearchParams());
  if (params?.alertId) qs.set("alertId", params.alertId);
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.offset) qs.set("offset", String(params.offset));
  return apiFetch<{
    items: AlertHistoryEntry[];
    total: number;
    limit: number;
    offset: number;
  }>(`/api/alerts/history?${qs}`);
}

// ---

export interface HourlyBucket {
  hour: string;
  count: number;
}

export interface DashboardData {
  errorCount24h: number;
  uptimePercent: number;
  activeContainers: number;
  traceCount24h: number;
  recentIssues: Issue[];
  monitorStatuses: {
    id: string;
    name: string;
    url: string;
    active: boolean;
    isUp: boolean;
  }[];
  alertCount: number;
  errorBuckets: HourlyBucket[];
  traceBuckets: HourlyBucket[];
}

export interface IssueEvent {
  id: string;
  message?: string;
  exceptionType?: string;
  stackTrace?: string;
  level?: string;
  tags?: Record<string, string>;
  context?: Record<string, unknown>;
  sdk?: string;
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
  tags?: Record<string, string>;
  sdk?: string;
  metadata?: Record<string, unknown>;
  events?: IssueEvent[];
}

/**
 * Monitor — matches the camelCase shape returned by `GET /api/monitors`
 * and `GET /api/monitors/{id}` (see `src/store/uptime.ts` + `src/api/monitors.ts`).
 * The list endpoint also adds `uptime24h` (computed by the API).
 * The single-monitor endpoint also adds `latestCheck` (latest uptime check).
 */
export interface Monitor {
  id: string;
  projectId?: string;
  name: string;
  url: string;
  type: string;
  monitorGroup?: string | null;
  intervalSeconds: number;
  active: boolean;
  method: string;
  headers?: Record<string, string> | null;
  body?: string | null;
  authType?: string | null;
  authValue?: string | null;
  ignoreSsl: boolean;
  maxRedirects: number;
  keyword?: string | null;
  keywordNot?: string | null;
  dnsRecordType?: string | null;
  dnsExpectedValue?: string | null;
  dnsResolver?: string | null;
  host?: string | null;
  port?: number | null;
  tls?: boolean;
  serviceName?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  uptime24h?: number;
  /** Latest check — only present on the single-monitor endpoint. */
  latestCheck?: {
    id: string;
    statusCode: number | null;
    responseTimeMs: number;
    success: boolean;
    error?: string | null;
    certExpiry?: string | null;
    checkedAt: string;
  };
}

export interface ContainerStats {
  id: string;
  name: string;
  image: string;
  cpu_percent: number;
  memory_usage_mb: number;
  memory_limit_mb: number;
  memory_percent: number;
  network_rx_bytes: number;
  network_tx_bytes: number;
  network_rx_rate: number;
  network_tx_rate: number;
  block_read_bytes: number;
  block_write_bytes: number;
  status: string;
  uptime_seconds: number;
  restart_count: number;
  health_status: string | null;
}

export interface HostStats {
  cpu_percent: number;
  cpu_cores?: Array<{ core: number; percent: number }>;
  memory_used_mb: number;
  memory_total_mb: number;
  memory_available_mb: number;
  swap_used_mb?: number;
  swap_total_mb?: number;
  disk_used_gb: number;
  disk_total_gb: number;
  disks?: Array<{ mount: string; usedGb: number; totalGb: number }>;
  load_avg_1m: number;
  load_avg_5m: number;
  load_avg_15m: number;
  network_rx_bytes: number;
  network_tx_bytes: number;
}

export interface GpuStat {
  hostId: string;
  gpuIndex: number;
  utilizationPercent: number;
  memoryUsedMb: number;
  memoryTotalMb: number;
  temperatureC: number | null;
  collectedAt: string;
}

export interface LogEntry {
  id: string;
  container: string;
  level: "info" | "warn" | "error" | "debug";
  message: string;
  timestamp: string;
}

export interface Trace {
  id: string;
  trace_id: string;
  name: string;
  agent?: string;
  workflow?: string;
  duration_ms: number;
  status: string;
  tokens_used?: number;
  start_time: string;
}

export interface TraceDetail extends Trace {
  spans: TraceSpan[];
}

export interface TraceSpan {
  span_id: string;
  parent_span_id?: string;
  name: string;
  kind: string;
  start_time: string;
  end_time: string;
  attributes: Record<string, unknown>;
  status: string;
  events?: {
    name: string;
    timestamp: string;
    attributes: Record<string, unknown>;
  }[];
}

export interface AlertRule {
  id: string;
  project_id: string;
  name: string;
  condition: {
    metric: string;
    operator: string;
    threshold: number;
    duration_seconds: number;
  };
  channels: { type: "telegram" | "discord" | "email"; target: string }[];
  is_active: boolean;
  cooldown_seconds: number;
  last_triggered?: string;
  created_at: string;
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}

export interface AlertHistoryEntry {
  id: string;
  alertId: string;
  alertName?: string;
  triggeredAt: string;
  resolvedAt?: string;
  context?: Record<string, unknown>;
}

// --- Releases ---

export interface Release {
  id: string;
  projectId: string;
  version: string;
  environment: string;
  deployedAt: string | null;
  createdAt: string;
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

export async function getReleases(params?: {
  projectId?: string;
  environment?: string;
  limit?: number;
  offset?: number;
}) {
  const qs = new URLSearchParams();
  if (params?.projectId) qs.set("projectId", params.projectId);
  if (params?.environment) qs.set("environment", params.environment);
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.offset) qs.set("offset", String(params.offset));
  return apiFetch<{ data: Release[]; total: number }>(`/api/releases?${qs}`);
}

export async function createRelease(data: {
  projectId: string;
  version: string;
  environment?: string;
  deployedAt?: string;
}) {
  return apiFetch<Release>("/api/releases", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getReleaseHealth(id: string) {
  return apiFetch<ReleaseHealth>(`/api/releases/${id}/health`);
}

export async function deleteRelease(id: string) {
  return apiFetch<void>(`/api/releases/${id}`, { method: "DELETE" });
}

// --- Team ---

export interface TeamMember {
  id: string;
  projectId: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
  updatedAt?: string | null;
}

export async function getTeamMembers(params?: {
  projectId?: string;
  limit?: number;
  offset?: number;
}) {
  const qs = new URLSearchParams();
  if (params?.projectId) qs.set("projectId", params.projectId);
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.offset) qs.set("offset", String(params.offset));
  return apiFetch<{ data: TeamMember[]; total: number }>(`/api/team?${qs}`);
}

export async function createTeamMember(data: {
  projectId: string;
  name: string;
  email: string;
  role?: string;
}) {
  return apiFetch<TeamMember>("/api/team", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateTeamMember(
  id: string,
  data: { name?: string; email?: string; role?: string },
) {
  return apiFetch<TeamMember>(`/api/team/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteTeamMember(id: string) {
  return apiFetch<void>(`/api/team/${id}`, { method: "DELETE" });
}

// --- Comments ---

export interface IssueComment {
  id: string;
  issueId: string;
  authorName: string;
  body: string;
  createdAt: string;
}

export async function getIssueComments(
  issueId: string,
  params?: { limit?: number; offset?: number },
) {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.offset) qs.set("offset", String(params.offset));
  return apiFetch<{ data: IssueComment[]; total: number }>(`/api/issues/${issueId}/comments?${qs}`);
}

export async function createIssueComment(
  issueId: string,
  data: { authorName: string; body: string },
) {
  return apiFetch<IssueComment>(`/api/issues/${issueId}/comments`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function deleteIssueComment(id: string) {
  return apiFetch<void>(`/api/comments/${id}`, { method: "DELETE" });
}

// --- Search ---

export interface SearchResult {
  issues: Array<{
    id: string;
    title: string;
    type: string;
    status: string;
    count: number;
    projectId: string;
    lastSeen: string;
    projectName: string;
  }>;
  events: Array<{
    id: string;
    message: string | null;
    exceptionType: string | null;
    level: string | null;
    projectId: string;
    createdAt: string;
    projectName: string;
  }>;
  traces: Array<{
    id: string;
    name: string;
    agent: string | null;
    workflow: string | null;
    durationMs: number | null;
    status: string;
    projectId: string;
    startTime: string;
    projectName: string;
  }>;
}

export async function searchAll(q: string, projectId?: string) {
  const qs = new URLSearchParams({ q });
  if (projectId) qs.set("projectId", projectId);
  return apiFetch<SearchResult>(`/api/search?${qs}`);
}

// --- Admin ---

export interface StorageTable {
  tableName: string;
  sizeBytes: number;
  sizeHuman: string;
}

export interface RetentionTable {
  tableName: string;
  retentionDays: number;
}

export async function getStorage(adminKey: string) {
  return apiFetch<{
    totalBytes: number;
    totalHuman: string;
    tables: StorageTable[];
  }>("/api/admin/storage", {
    headers: { Authorization: `Bearer ${adminKey}` },
  });
}

export async function getRetention(adminKey: string) {
  return apiFetch<{ defaultDays: number; tables: RetentionTable[] }>("/api/admin/retention", {
    headers: { Authorization: `Bearer ${adminKey}` },
  });
}

export async function updateRetention(adminKey: string, table: string, retentionDays: number) {
  return apiFetch<{ tableName: string; retentionDays: number }>(`/api/admin/retention/${table}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${adminKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ retentionDays }),
  });
}

export interface StatusPageData {
  project: { id: string; name: string; slug: string };
  overall: "operational" | "degraded" | "down";
  monitors: Array<{
    id: string;
    name: string;
    url: string;
    active: boolean;
    uptime24h: number;
    lastCheck: {
      status_code: number;
      response_time_ms: number;
      checked_at: string;
      success: boolean;
    } | null;
  }>;
  incidents?: Incident[];
}

export interface StatusPageHistory {
  history: Array<{
    monitorId: string;
    name: string;
    uptimePercent: number;
  }>;
}

export interface Incident {
  id: string;
  projectId: string;
  monitorId?: string | null;
  title: string;
  status: "investigating" | "identified" | "monitoring" | "resolved";
  severity: "minor" | "major" | "critical";
  description?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  resolvedAt?: string | null;
}

export interface Subscriber {
  id: string;
  projectId: string;
  email: string;
  isVerified: boolean;
  createdAt: string;
}

export async function getStatusPage(slug: string) {
  return apiFetch<StatusPageData>(`/api/status/${slug}`);
}

export async function getStatusPageHistory(slug: string, days?: number) {
  const qs = new URLSearchParams();
  if (days !== undefined) qs.set("days", String(days));
  return apiFetch<StatusPageHistory>(`/api/status/${slug}/history?${qs}`);
}

export async function createSubscriber(projectId: string, email: string, autoVerify = true) {
  return apiFetch<Subscriber>("/api/subscribers", {
    method: "POST",
    body: JSON.stringify({ projectId, email, autoVerify }),
  });
}

export async function createPublicSubscriber(projectId: string, email: string) {
  return apiFetch<Subscriber>("/api/subscribers/public", {
    method: "POST",
    body: JSON.stringify({ projectId, email }),
  });
}

export async function getIncidents(params?: {
  projectId?: string;
  status?: string;
  limit?: number;
  offset?: number;
}) {
  const qs = new URLSearchParams();
  if (params?.projectId) qs.set("projectId", params.projectId);
  if (params?.status) qs.set("status", params.status);
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.offset) qs.set("offset", String(params.offset));
  return apiFetch<{
    items: Incident[];
    total: number;
    limit: number;
    offset: number;
  }>(`/api/incidents?${qs}`);
}

export async function getActiveIncidents(projectId?: string) {
  const qs = new URLSearchParams();
  if (projectId) qs.set("projectId", projectId);
  return apiFetch<{ items: Incident[] }>(`/api/incidents/active?${qs}`);
}

export async function createIncident(data: {
  projectId: string;
  title: string;
  status?: string;
  monitorId?: string;
  severity?: "minor" | "major" | "critical";
  description?: string;
}) {
  return apiFetch<Incident>("/api/incidents", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateIncident(
  id: string,
  data: {
    title?: string;
    status?: string;
    monitorId?: string;
    severity?: "minor" | "major" | "critical";
    description?: string;
  },
) {
  return apiFetch<Incident>(`/api/incidents/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteIncident(id: string) {
  return apiFetch<{ deleted: boolean }>(`/api/incidents/${id}`, {
    method: "DELETE",
  });
}

// --- Releases (Single & Update) ---

export async function getRelease(id: string) {
  return apiFetch<Release>(`/api/releases/${id}`);
}

export async function updateRelease(
  id: string,
  data: { version?: string; environment?: string; deployedAt?: string },
) {
  return apiFetch<Release>(`/api/releases/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

// --- Fingerprint Rules ---

export interface FingerprintRule {
  id: string;
  projectId: string;
  name: string;
  pattern: string;
  groupBy: "message" | "stack" | "type";
  isActive: boolean;
  createdAt: string;
  updatedAt?: string | null;
}

export async function getFingerprintRules(params?: {
  projectId?: string;
  limit?: number;
  offset?: number;
}) {
  const qs = new URLSearchParams();
  if (params?.projectId) qs.set("projectId", params.projectId);
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.offset) qs.set("offset", String(params.offset));
  return apiFetch<{
    data: FingerprintRule[];
    total: number;
    limit: number;
    offset: number;
  }>(`/api/fingerprint-rules?${qs}`);
}

export async function getFingerprintRule(id: string) {
  return apiFetch<FingerprintRule>(`/api/fingerprint-rules/${id}`);
}

export async function createFingerprintRule(data: {
  projectId: string;
  name: string;
  pattern: string;
  groupBy?: "message" | "stack" | "type";
  isActive?: boolean;
}) {
  return apiFetch<FingerprintRule>("/api/fingerprint-rules", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateFingerprintRule(
  id: string,
  data: {
    name?: string;
    pattern?: string;
    groupBy?: "message" | "stack" | "type";
    isActive?: boolean;
  },
) {
  return apiFetch<FingerprintRule>(`/api/fingerprint-rules/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteFingerprintRule(id: string) {
  return apiFetch<{ ok: boolean }>(`/api/fingerprint-rules/${id}`, {
    method: "DELETE",
  });
}

// --- Notification Configurations ---

export interface NotificationConfig {
  id: string;
  projectId: string;
  channel: string;
  config: Record<string, string>;
  enabled: boolean;
  configured: boolean;
  createdAt: string;
  updatedAt?: string | null;
  source?: "db" | "env";
}

export async function getNotificationConfigs(projectId?: string) {
  const qs = new URLSearchParams();
  if (projectId) qs.set("projectId", projectId);
  return apiFetch<{ notifications: NotificationConfig[] }>(`/api/notifications?${qs}`);
}

export async function getNotificationConfig(channel: string, projectId?: string) {
  const qs = new URLSearchParams();
  if (projectId) qs.set("projectId", projectId);
  return apiFetch<NotificationConfig & { source?: "db" | "env" }>(
    `/api/notifications/${channel}?${qs}`,
  );
}

export async function updateNotificationConfig(
  channel: string,
  data: {
    projectId: string;
    config: Record<string, string>;
    enabled?: boolean;
  },
) {
  return apiFetch<{
    id: string;
    channel: string;
    created?: boolean;
    updated?: boolean;
  }>(`/api/notifications/${channel}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteNotificationConfig(channel: string, projectId?: string) {
  const qs = new URLSearchParams();
  if (projectId) qs.set("projectId", projectId);
  return apiFetch<{ deleted: boolean }>(`/api/notifications/${channel}?${qs}`, {
    method: "DELETE",
  });
}

export async function testNotificationChannel(channel: string, projectId?: string) {
  const qs = new URLSearchParams();
  if (projectId) qs.set("projectId", projectId);
  return apiFetch<{ ok: boolean; error?: string }>(`/api/notifications/${channel}/test?${qs}`, {
    method: "POST",
  });
}

export async function getHostHistory(hostId?: string, from?: string, to?: string, limit?: number) {
  const qs = new URLSearchParams();
  if (hostId) qs.set("hostId", hostId);
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  if (limit) qs.set("limit", String(limit));
  return apiFetch<{ data: HostStats[]; count: number }>(`/api/infrastructure/host/history?${qs}`);
}

export async function getMonitor(id: string) {
  return apiFetch<{ monitor: Monitor & { uptime24h: number } }>(`/api/monitors/${id}`);
}

export async function createMonitor(data: {
  name: string;
  url: string;
  type?: string;
  group?: string;
  interval_seconds?: number;
  project_id: string;
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
}) {
  return apiFetch<{ monitor: Monitor }>("/api/monitors", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateMonitor(
  id: string,
  data: {
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
  },
) {
  return apiFetch<{ monitor: Monitor }>(`/api/monitors/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteMonitor(id: string) {
  return apiFetch<{ deleted: boolean }>(`/api/monitors/${id}`, {
    method: "DELETE",
  });
}
