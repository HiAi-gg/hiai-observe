/**
 * @hiai/observe-sdk — lightweight HiAi Observe client.
 *
 * Provides typed access to the most-used read endpoints (issues, dashboard,
 * releases, team) plus issue creation and a single-monitor uptime check.
 * All requests send `Authorization: Bearer <apiKey>`, time out via
 * `AbortController`, and surface non-2xx responses as `HiAiObserveError`.
 *
 * @example
 * ```ts
 * import { HiAiObserve } from "@hiai/observe-sdk";
 *
 * const client = new HiAiObserve({
 *   baseUrl: "http://localhost:8001",
 *   apiKey: "ho_abc123",
 *   projectId: "550e8400-e29b-41d4-a716-446655440000",
 *   timeoutMs: 5000,
 * });
 *
 * const { data: issues } = await client.getIssues({ status: "unresolved" });
 * const dashboard = await client.getDashboard();
 * const result = await client.checkUptime("monitor-id");
 * ```
 */

import type {
  DashboardData,
  HiAiObserveOptions,
  Issue,
  IssueCreate,
  MonitorResult,
  PaginatedResponse,
  Release,
  TeamMember,
} from "./types.js";

export type {
  DashboardData,
  HiAiObserveOptions,
  Issue,
  IssueCreate,
  MonitorResult,
  PaginatedResponse,
  Release,
  TeamMember,
} from "./types.js";

export class HiAiObserveError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "HiAiObserveError";
  }
}

export interface GetIssuesParams {
  status?: string;
  search?: string;
  environment?: string;
  level?: string;
  limit?: number;
  offset?: number;
}

export class HiAiObserve {
  private readonly fetch: typeof globalThis.fetch;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly projectId: string | undefined;
  private readonly timeoutMs: number;

  constructor(opts: HiAiObserveOptions) {
    if (!opts.baseUrl) throw new Error("HiAiObserve: baseUrl is required");
    if (!opts.apiKey) throw new Error("HiAiObserve: apiKey is required");
    this.fetch = opts.fetch ?? globalThis.fetch;
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.apiKey = opts.apiKey;
    this.projectId = opts.projectId;
    this.timeoutMs = opts.timeoutMs ?? 10_000;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string | number | undefined>,
  ): Promise<T> {
    const url = new URL(path, this.baseUrl);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: "application/json",
    };

    const init: RequestInit & { signal: AbortSignal } = {
      method,
      headers,
      signal: AbortSignal.timeout(this.timeoutMs),
    };

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }

    let response: Response;
    try {
      response = await this.fetch(url.toString(), init);
    } catch (err) {
      if (err instanceof DOMException && err.name === "TimeoutError") {
        throw new HiAiObserveError(`Request to ${url.pathname} timed out after ${this.timeoutMs}ms`, 0);
      }
      if (err instanceof Error && err.name === "AbortError") {
        throw new HiAiObserveError(`Request to ${url.pathname} was aborted`, 0);
      }
      throw new HiAiObserveError(
        `Network error contacting ${url.pathname}: ${err instanceof Error ? err.message : String(err)}`,
        0,
      );
    }

    if (!response.ok) {
      let parsed: unknown;
      try {
        parsed = await response.json();
      } catch {
        try {
          parsed = await response.text();
        } catch {
          parsed = undefined;
        }
      }
      const message =
        typeof parsed === "object" && parsed !== null && "error" in parsed
          ? String((parsed as { error: unknown }).error)
          : `HTTP ${response.status} ${response.statusText}`;
      throw new HiAiObserveError(message, response.status, parsed);
    }

    return (await response.json()) as T;
  }

  getIssues(params?: GetIssuesParams): Promise<PaginatedResponse<Issue>> {
    const query: Record<string, string | number | undefined> = { ...params };
    if (this.projectId && !query.projectId) query.projectId = this.projectId;
    return this.request<PaginatedResponse<Issue>>("GET", "/api/issues", undefined, query);
  }

  createIssue(issue: IssueCreate): Promise<Issue> {
    if (!issue.projectId && !this.projectId) {
      throw new Error("HiAiObserve.createIssue: projectId is required (set in options or pass on input)");
    }
    return this.request<Issue>("POST", "/api/issues", { ...issue, projectId: issue.projectId ?? this.projectId });
  }

  async checkUptime(monitorId: string): Promise<MonitorResult> {
    if (!monitorId) throw new Error("HiAiObserve.checkUptime: monitorId is required");
    const path = `/api/monitors/${encodeURIComponent(monitorId)}/checks`;
    const query: Record<string, string | number | undefined> = { limit: 1 };
    if (this.projectId) query.project_id = this.projectId;

    const result = await this.request<{
      checks: Array<{ success: boolean; responseTimeMs?: number | null; statusCode?: number | null; error?: string | null; checkedAt: string }>;
      total: number;
    }>("GET", path, undefined, query);

    const latest = result.checks[0];
    if (!latest) {
      return {
        monitorId,
        isUp: false,
        errorMessage: "No checks recorded yet",
        checkedAt: new Date().toISOString(),
      };
    }
    return {
      monitorId,
      isUp: latest.success,
      responseTimeMs: latest.responseTimeMs ?? undefined,
      statusCode: latest.statusCode ?? undefined,
      errorMessage: latest.error ?? undefined,
      checkedAt: latest.checkedAt,
    };
  }

  getDashboard(): Promise<DashboardData> {
    return this.request<DashboardData>("GET", "/api/dashboard", undefined, this.projectId ? { projectId: this.projectId } : undefined);
  }

  getReleases(projectId?: string): Promise<PaginatedResponse<Release>> {
    const pid = projectId ?? this.projectId;
    if (!pid) throw new Error("HiAiObserve.getReleases: projectId is required (set in options or pass as argument)");
    return this.request<PaginatedResponse<Release>>("GET", "/api/releases", undefined, { projectId: pid });
  }

  getTeamMembers(projectId?: string): Promise<PaginatedResponse<TeamMember>> {
    const pid = projectId ?? this.projectId;
    if (!pid) throw new Error("HiAiObserve.getTeamMembers: projectId is required (set in options or pass as argument)");
    return this.request<PaginatedResponse<TeamMember>>("GET", "/api/team", undefined, { projectId: pid });
  }
}
