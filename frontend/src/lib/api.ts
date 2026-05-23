import { apiKey } from "./stores.svelte";

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

async function fetchWithTimeout(path: string, init?: RequestInit, timeout = DEFAULT_TIMEOUT): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(`${BASE_URL}${path}`, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

export async function getDashboard() {
  return apiFetch<DashboardData>("/api/dashboard");
}

export async function getIssues(params?: { status?: string; search?: string; limit?: number; offset?: number }) {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.search) qs.set("search", params.search);
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.offset) qs.set("offset", String(params.offset));
  return apiFetch<{ issues: Issue[]; total: number }>(`/api/issues?${qs}`);
}

export async function getIssue(id: string) {
  return apiFetch<Issue>(`/api/issues/${id}`);
}

export async function updateIssue(id: string, data: { status: string }) {
  return apiFetch<Issue>(`/api/issues/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

export async function getMonitors() {
  return apiFetch<{ monitors: Monitor[] }>("/api/monitors");
}

export async function getContainerStats() {
  return apiFetch<{ containers: ContainerStats[] }>("/api/infrastructure/containers");
}

export async function getHostStats() {
  return apiFetch<HostStats>("/api/infrastructure/host");
}

export async function getLogs(params?: { container?: string; level?: string; search?: string; limit?: number }) {
  const qs = new URLSearchParams();
  if (params?.container) qs.set("container", params.container);
  if (params?.level) qs.set("level", params.level);
  if (params?.search) qs.set("search", params.search);
  if (params?.limit) qs.set("limit", String(params.limit));
  return apiFetch<{ logs: LogEntry[] }>(`/api/logs?${qs}`);
}

export async function getTraces(params?: { workflow?: string; agent?: string; limit?: number; offset?: number }) {
  const qs = new URLSearchParams();
  if (params?.workflow) qs.set("workflow", params.workflow);
  if (params?.agent) qs.set("agent", params.agent);
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.offset) qs.set("offset", String(params.offset));
  return apiFetch<{ traces: Trace[]; total: number }>(`/api/traces?${qs}`);
}

export async function getTrace(id: string) {
  return apiFetch<TraceDetail>(`/api/traces/${id}`);
}

export async function getAlerts() {
  return apiFetch<{ alerts: AlertRule[] }>("/api/alerts");
}

export async function createAlert(data: Omit<AlertRule, "id" | "created_at">) {
  return apiFetch<AlertRule>("/api/alerts", { method: "POST", body: JSON.stringify(data) });
}

export async function deleteAlert(id: string) {
  return apiFetch<void>(`/api/alerts/${id}`, { method: "DELETE" });
}

export async function testAlert(id: string) {
  return apiFetch<{ ok: boolean; channels: Array<{ type: string; target: string; ok: boolean; error?: string }> }>(
    `/api/alerts/${id}/test`, { method: "POST" }
  );
}

export async function testAllAlerts() {
  return apiFetch<{ message: string; results: Array<{ alertId: string; name: string; ok: boolean }> }>(
    "/api/alerts/test-all", { method: "POST" }
  );
}

export async function getNotificationChannels() {
  return apiFetch<{
    channels: Array<{
      type: string;
      name: string;
      description: string;
      configFields: Array<{ key: string; label: string; envVar: string; required: boolean }>;
      configured: boolean;
    }>;
  }>("/api/alerts/channels");
}

// ---

export interface DashboardData {
  errorCount24h: number;
  uptimePercent: number;
  activeContainers: number;
  traceCount24h: number;
  recentIssues: Issue[];
  monitorStatuses: { id: string; name: string; url: string; active: boolean; isUp: boolean }[];
  alertCount: number;
}

export interface Issue {
  id: string;
  project_id: string;
  title: string;
  type: string;
  fingerprint: string;
  status: "unresolved" | "resolved" | "ignored";
  count: number;
  first_seen: string;
  last_seen: string;
  tags?: Record<string, string>;
  sdk?: string;
  metadata?: Record<string, unknown>;
}

export interface Monitor {
  id: string;
  name: string;
  url: string;
  interval_seconds: number;
  is_active: boolean;
  uptime_percent?: number;
  last_check?: { status_code: number; response_time_ms: number; checked_at: string };
}

export interface ContainerStats {
  id: string;
  name: string;
  image: string;
  cpu_percent: number;
  memory_usage_mb: number;
  memory_limit_mb: number;
  network_rx_bytes: number;
  network_tx_bytes: number;
  status: string;
}

export interface HostStats {
  cpu_percent: number;
  memory_used_mb: number;
  memory_total_mb: number;
  memory_available_mb: number;
  disk_used_gb: number;
  disk_total_gb: number;
  load_avg_1m: number;
  load_avg_5m: number;
  load_avg_15m: number;
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
  events?: { name: string; timestamp: string; attributes: Record<string, unknown> }[];
}

export interface AlertRule {
  id: string;
  project_id: string;
  name: string;
  condition: { metric: string; operator: string; threshold: number; duration_seconds: number };
  channels: { type: "telegram" | "discord" | "email"; target: string }[];
  is_active: boolean;
  cooldown_seconds: number;
  last_triggered?: string;
  created_at: string;
}
