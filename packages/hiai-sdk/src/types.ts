/**
 * @hiai/observe-sdk — public type contracts.
 *
 * Only the minimal surface area called out by the E.2 brief is exported here:
 * options, issues (read + create), and monitor check results. The runtime
 * client lives in `./index.ts`.
 */

export interface HiAiObserveOptions {
  baseUrl: string;
  apiKey: string;
  projectId?: string;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
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

export interface IssueCreate {
  projectId: string;
  title: string;
  type: string;
  fingerprint: string;
  message?: string;
  level?: string;
  environment?: string;
  stackTrace?: string;
  tags?: Record<string, string>;
}

export interface MonitorResult {
  monitorId: string;
  isUp: boolean;
  responseTimeMs?: number;
  statusCode?: number;
  errorMessage?: string;
  checkedAt: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface DashboardData {
  errorCount24h: number;
  uptimePercent: number;
  activeContainers: number;
  traceCount24h: number;
  recentIssues: Issue[];
  alertCount: number;
}

export interface Release {
  id: string;
  projectId: string;
  version: string;
  environment: string;
  deployedAt?: string | null;
  createdAt: string;
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
