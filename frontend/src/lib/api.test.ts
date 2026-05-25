import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the stores module before importing api
vi.mock("./stores.svelte", () => ({
  apiKey: { current: "" },
  currentProject: { current: "" },
}));

import {
  getDashboard,
  getIssues,
  getIssue,
  updateIssue,
  getEvents,
  getMonitors,
  getContainerStats,
  getHostStats,
  getLogs,
  getLogStats,
  getLogVolume,
  getSavedSearches,
  createSavedSearch,
  deleteSavedSearch,
  getLogsDownloadUrl,
  getTraces,
  getTrace,
  getAlerts,
  createAlert,
  deleteAlert,
  testAlert,
  testAllAlerts,
  getNotificationChannels,
  getProjects,
  createProject,
  deleteProject,
  rotateApiKey,
  getAlertHistory,
  getReleases,
  createRelease,
  getReleaseHealth,
  deleteRelease,
  getTeamMembers,
  createTeamMember,
  updateTeamMember,
  deleteTeamMember,
  getIssueComments,
  createIssueComment,
  deleteIssueComment,
  searchAll,
  getStorage,
  getRetention,
  updateRetention,
} from "./api";
import { apiKey, currentProject } from "./stores.svelte";

// Helper to create a mock Response
function mockResponse(body: unknown, init?: { ok?: boolean; status?: number; statusText?: string }) {
  const ok = init?.ok ?? true;
  const status = init?.status ?? 200;
  return {
    ok,
    status,
    statusText: init?.statusText ?? "OK",
    json: () => Promise.resolve(body),
  } as Response;
}

// Helper to create an error Response
function errorResponse(status: number, statusText: string, body?: unknown) {
  return {
    ok: false,
    status,
    statusText,
    json: () => Promise.resolve(body ?? { error: statusText }),
  } as Response;
}

describe("API client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    apiKey.current = "";
    currentProject.current = "";
    // Mock window.location.origin
    vi.stubGlobal("window", { location: { origin: "http://localhost:8001" } });
  });

  // --- Auth header injection ---

  describe("auth header injection", () => {
    it("includes Authorization header when apiKey is set", async () => {
      apiKey.current = "test-key-123";
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse({}));

      await getDashboard();

      const [, init] = fetchSpy.mock.calls[0]!;
      const headers = init?.headers as Headers;
      expect(headers.get("Authorization")).toBe("Bearer test-key-123");
    });

    it("does not include Authorization header when apiKey is empty", async () => {
      apiKey.current = "";
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse({}));

      await getDashboard();

      const [, init] = fetchSpy.mock.calls[0]!;
      const headers = init?.headers as Headers;
      expect(headers.get("Authorization")).toBeNull();
    });

    it("sets Content-Type to application/json when body is present", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse({ id: "1" }));

      await updateIssue("1", { status: "resolved" });

      const [, init] = fetchSpy.mock.calls[0]!;
      const headers = init?.headers as Headers;
      expect(headers.get("Content-Type")).toBe("application/json");
    });
  });

  // --- Error handling ---

  describe("error handling", () => {
    it("throws with error message from JSON response on non-200", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(errorResponse(404, "Not Found", { error: "Issue not found" }));

      await expect(getIssue("missing-id")).rejects.toThrow("Issue not found");
    });

    it("throws with HTTP status fallback when JSON body has no error field", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(errorResponse(500, "Internal Server Error", {}));

      await expect(getDashboard()).rejects.toThrow("HTTP 500");
    });

    it("throws with statusText when JSON parsing fails", async () => {
      const res = {
        ok: false,
        status: 502,
        statusText: "Bad Gateway",
        json: () => Promise.reject(new Error("invalid json")),
      } as unknown as Response;
      vi.spyOn(globalThis, "fetch").mockResolvedValue(res);

      await expect(getDashboard()).rejects.toThrow("Bad Gateway");
    });

    it("propagates network errors", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));

      await expect(getDashboard()).rejects.toThrow("Failed to fetch");
    });
  });

  // --- Request timeout ---

  describe("request timeout", () => {
    it("aborts request after default timeout", async () => {
      let capturedSignal: AbortSignal | undefined;
      vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
        capturedSignal = init?.signal as AbortSignal;
        return new Promise((_resolve, reject) => {
          // Never resolve — simulates a hanging request
          capturedSignal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        });
      });

      // Use fake timers to trigger the timeout
      vi.useFakeTimers();
      const promise = getDashboard();
      // Prevent unhandled rejection warning — we assert on it below
      promise.catch(() => {});

      // Advance past default 10s timeout
      await vi.advanceTimersByTimeAsync(10_001);

      await expect(promise).rejects.toThrow();
      expect(capturedSignal?.aborted).toBe(true);
      vi.useRealTimers();
    });
  });

  // --- Query parameter construction ---

  describe("query parameters", () => {
    it("includes projectId from store in dashboard request", async () => {
      currentProject.current = "proj-abc";
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse({}));

      await getDashboard();

      const url = fetchSpy.mock.calls[0]![0] as string;
      expect(url).toContain("projectId=proj-abc");
    });

    it("does not include projectId when store is empty", async () => {
      currentProject.current = "";
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse({}));

      await getDashboard();

      const url = fetchSpy.mock.calls[0]![0] as string;
      expect(url).not.toContain("projectId");
    });

    it("builds issue query params correctly", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse({ issues: [], total: 0 }));

      await getIssues({ status: "unresolved", search: "TypeError", limit: 25, offset: 50 });

      const url = fetchSpy.mock.calls[0]![0] as string;
      expect(url).toContain("status=unresolved");
      expect(url).toContain("search=TypeError");
      expect(url).toContain("limit=25");
      expect(url).toContain("offset=50");
    });

    it("builds log query params correctly", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse({ data: { logs: [], total: 0 } }));

      await getLogs({ container: "nginx", level: "error", limit: 100 });

      const url = fetchSpy.mock.calls[0]![0] as string;
      expect(url).toContain("container=nginx");
      expect(url).toContain("level=error");
      expect(url).toContain("limit=100");
    });

    it("omits undefined params in getIssues", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse({ issues: [], total: 0 }));

      await getIssues({ status: "resolved" });

      const url = fetchSpy.mock.calls[0]![0] as string;
      expect(url).toContain("status=resolved");
      expect(url).not.toContain("search=");
      expect(url).not.toContain("environment=");
    });

    it("builds trace query params correctly", async () => {
      currentProject.current = "p1";
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse({ traces: [], total: 0 }));

      await getTraces({ workflow: "my-workflow", agent: "coder", limit: 10 });

      const url = fetchSpy.mock.calls[0]![0] as string;
      expect(url).toContain("workflow=my-workflow");
      expect(url).toContain("agent=coder");
      expect(url).toContain("limit=10");
      expect(url).toContain("projectId=p1");
    });
  });

  // --- Individual API functions ---

  describe("getDashboard", () => {
    it("fetches /api/dashboard", async () => {
      const data = { errorCount24h: 5, uptimePercent: 99.9 };
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(data));

      const result = await getDashboard();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy.mock.calls[0]![0]).toContain("/api/dashboard");
      expect(result).toEqual(data);
    });
  });

  describe("getIssues", () => {
    it("fetches /api/issues with pagination", async () => {
      const data = { issues: [{ id: "1", title: "Test" }], total: 1 };
      vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(data));

      const result = await getIssues({ limit: 10, offset: 0 });

      expect(result).toEqual(data);
    });
  });

  describe("getIssue", () => {
    it("fetches /api/issues/:id", async () => {
      const data = { id: "123", title: "Error in main" };
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(data));

      const result = await getIssue("123");

      expect(fetchSpy.mock.calls[0]![0]).toContain("/api/issues/123");
      expect(result).toEqual(data);
    });
  });

  describe("updateIssue", () => {
    it("sends PATCH with body", async () => {
      const data = { id: "1", status: "resolved" };
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(data));

      await updateIssue("1", { status: "resolved" });

      const [, init] = fetchSpy.mock.calls[0]!;
      expect(init?.method).toBe("PATCH");
      expect(init?.body).toBe(JSON.stringify({ status: "resolved" }));
    });
  });

  describe("getEvents", () => {
    it("fetches /api/events with params", async () => {
      const data = { data: [], total: 0 };
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(data));

      await getEvents({ issueId: "i1", limit: "50" });

      const url = fetchSpy.mock.calls[0]![0] as string;
      expect(url).toContain("issueId=i1");
      expect(url).toContain("limit=50");
    });
  });

  describe("getMonitors", () => {
    it("fetches /api/monitors", async () => {
      const data = { monitors: [] };
      vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(data));

      const result = await getMonitors();

      expect(result).toEqual(data);
    });

    it("includes project_id from store", async () => {
      currentProject.current = "proj-1";
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse({ monitors: [] }));

      await getMonitors();

      const url = fetchSpy.mock.calls[0]![0] as string;
      expect(url).toContain("project_id=proj-1");
    });
  });

  describe("getContainerStats", () => {
    it("fetches /api/infrastructure/containers", async () => {
      const data = { containers: [] };
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(data));

      const result = await getContainerStats();

      expect(fetchSpy.mock.calls[0]![0]).toContain("/api/infrastructure/containers");
      expect(result).toEqual(data);
    });
  });

  describe("getHostStats", () => {
    it("fetches /api/infrastructure/host", async () => {
      const data = { cpu_percent: 45, memory_used_mb: 2048 };
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(data));

      const result = await getHostStats();

      expect(fetchSpy.mock.calls[0]![0]).toContain("/api/infrastructure/host");
      expect(result).toEqual(data);
    });
  });

  describe("getLogs", () => {
    it("fetches /api/logs with all params", async () => {
      const data = { data: { logs: [], total: 0 } };
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(data));

      await getLogs({ container: "app", level: "warn", search: "timeout", regex: "^err", limit: 50, offset: 10 });

      const url = fetchSpy.mock.calls[0]![0] as string;
      expect(url).toContain("container=app");
      expect(url).toContain("level=warn");
      expect(url).toContain("search=timeout");
      expect(url).toContain("regex=%5Eerr"); // URL encoded ^
      expect(url).toContain("limit=50");
      expect(url).toContain("offset=10");
    });
  });

  describe("getLogStats", () => {
    it("fetches /api/logs/stats", async () => {
      const data = { total24h: 100, byLevel: { error: 10 }, byContainer: [], byHour: [] };
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(data));

      const result = await getLogStats();

      expect(fetchSpy.mock.calls[0]![0]).toContain("/api/logs/stats");
      expect(result).toEqual(data);
    });
  });

  describe("getLogVolume", () => {
    it("fetches /api/logs/volume with params", async () => {
      const data = { data: [] };
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(data));

      await getLogVolume({ interval: "1h", containerId: "c1" });

      const url = fetchSpy.mock.calls[0]![0] as string;
      expect(url).toContain("interval=1h");
      expect(url).toContain("containerId=c1");
    });
  });

  describe("saved searches", () => {
    it("getSavedSearches fetches /api/saved-searches", async () => {
      const data = { data: [] };
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(data));

      await getSavedSearches("proj-1");

      const url = fetchSpy.mock.calls[0]![0] as string;
      expect(url).toContain("/api/saved-searches");
      expect(url).toContain("projectId=proj-1");
    });

    it("createSavedSearch sends POST with body", async () => {
      const data = { data: { id: "1", name: "test", query: "error", createdAt: "2026-01-01" } };
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(data));

      await createSavedSearch({ name: "test", query: "error" });

      const [, init] = fetchSpy.mock.calls[0]!;
      expect(init?.method).toBe("POST");
      expect(init?.body).toBe(JSON.stringify({ name: "test", query: "error" }));
    });

    it("deleteSavedSearch sends DELETE", async () => {
      const data = { data: { id: "1" } };
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(data));

      await deleteSavedSearch("1");

      const [, init] = fetchSpy.mock.calls[0]!;
      expect(init?.method).toBe("DELETE");
      expect(fetchSpy.mock.calls[0]![0]).toContain("/api/saved-searches/1");
    });
  });

  describe("getLogsDownloadUrl", () => {
    it("returns URL with default csv format", () => {
      const url = getLogsDownloadUrl({});
      expect(url).toContain("/api/export/logs");
      expect(url).toContain("format=csv");
    });

    it("includes container and level params", () => {
      const url = getLogsDownloadUrl({ container: "web", level: "error", format: "json" });
      expect(url).toContain("container=web");
      expect(url).toContain("level=error");
      expect(url).toContain("format=json");
    });
  });

  describe("traces", () => {
    it("getTrace fetches /api/traces/:id", async () => {
      const data = { id: "t1", trace_id: "abc", name: "test", spans: [] };
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(data));

      const result = await getTrace("t1");

      expect(fetchSpy.mock.calls[0]![0]).toContain("/api/traces/t1");
      expect(result).toEqual(data);
    });
  });

  describe("alerts", () => {
    it("getAlerts fetches /api/alerts with project", async () => {
      currentProject.current = "p1";
      const data = { alerts: [] };
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(data));

      await getAlerts();

      const url = fetchSpy.mock.calls[0]![0] as string;
      expect(url).toContain("/api/alerts");
      expect(url).toContain("projectId=p1");
    });

    it("createAlert sends POST", async () => {
      const alertData = {
        project_id: "p1",
        name: "High errors",
        condition: { metric: "error_count", operator: ">", threshold: 10, duration_seconds: 300 },
        channels: [{ type: "telegram" as const, target: "123" }],
        is_active: true,
        cooldown_seconds: 600,
        created_at: "2026-01-01",
      };
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse({ id: "a1", ...alertData }));

      await createAlert(alertData);

      const [, init] = fetchSpy.mock.calls[0]!;
      expect(init?.method).toBe("POST");
    });

    it("deleteAlert sends DELETE", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(undefined));

      await deleteAlert("a1");

      const [, init] = fetchSpy.mock.calls[0]!;
      expect(init?.method).toBe("DELETE");
      expect(fetchSpy.mock.calls[0]![0]).toContain("/api/alerts/a1");
    });

    it("testAlert sends POST to test endpoint", async () => {
      const data = { ok: true, channels: [] };
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(data));

      await testAlert("a1");

      const [, init] = fetchSpy.mock.calls[0]!;
      expect(init?.method).toBe("POST");
      expect(fetchSpy.mock.calls[0]![0]).toContain("/api/alerts/a1/test");
    });

    it("testAllAlerts sends POST to test-all endpoint", async () => {
      const data = { message: "ok", results: [] };
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(data));

      await testAllAlerts();

      const [, init] = fetchSpy.mock.calls[0]!;
      expect(init?.method).toBe("POST");
      expect(fetchSpy.mock.calls[0]![0]).toContain("/api/alerts/test-all");
    });

    it("getNotificationChannels fetches /api/alerts/channels", async () => {
      const data = { channels: [] };
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(data));

      await getNotificationChannels();

      expect(fetchSpy.mock.calls[0]![0]).toContain("/api/alerts/channels");
    });

    it("getAlertHistory fetches /api/alerts/history with params", async () => {
      currentProject.current = "p1";
      const data = { items: [], total: 0, limit: 20, offset: 0 };
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(data));

      await getAlertHistory({ alertId: "a1", limit: 20 });

      const url = fetchSpy.mock.calls[0]![0] as string;
      expect(url).toContain("/api/alerts/history");
      expect(url).toContain("alertId=a1");
      expect(url).toContain("limit=20");
      expect(url).toContain("projectId=p1");
    });
  });

  describe("projects", () => {
    it("getProjects fetches /api/projects", async () => {
      const data = { projects: [] };
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(data));

      await getProjects();

      expect(fetchSpy.mock.calls[0]![0]).toContain("/api/projects");
    });

    it("createProject sends POST with name", async () => {
      const data = { project: { id: "p1", name: "Test" }, apiKey: "key" };
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(data));

      await createProject("Test");

      const [, init] = fetchSpy.mock.calls[0]!;
      expect(init?.method).toBe("POST");
      expect(init?.body).toBe(JSON.stringify({ name: "Test" }));
    });

    it("deleteProject sends DELETE", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(undefined));

      await deleteProject("p1");

      const [, init] = fetchSpy.mock.calls[0]!;
      expect(init?.method).toBe("DELETE");
      expect(fetchSpy.mock.calls[0]![0]).toContain("/api/projects/p1");
    });

    it("rotateApiKey sends POST", async () => {
      const data = { apiKey: "new-key" };
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(data));

      await rotateApiKey("p1");

      const [, init] = fetchSpy.mock.calls[0]!;
      expect(init?.method).toBe("POST");
      expect(fetchSpy.mock.calls[0]![0]).toContain("/api/projects/p1/rotate-key");
    });
  });

  describe("releases", () => {
    it("getReleases fetches /api/releases with params", async () => {
      const data = { data: [], total: 0 };
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(data));

      await getReleases({ projectId: "p1", environment: "production", limit: 10 });

      const url = fetchSpy.mock.calls[0]![0] as string;
      expect(url).toContain("/api/releases");
      expect(url).toContain("projectId=p1");
      expect(url).toContain("environment=production");
      expect(url).toContain("limit=10");
    });

    it("createRelease sends POST", async () => {
      const data = { id: "r1", version: "1.0.0" };
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(data));

      await createRelease({ projectId: "p1", version: "1.0.0" });

      const [, init] = fetchSpy.mock.calls[0]!;
      expect(init?.method).toBe("POST");
    });

    it("getReleaseHealth fetches health endpoint", async () => {
      const data = { releaseId: "r1", healthScore: "green" };
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(data));

      await getReleaseHealth("r1");

      expect(fetchSpy.mock.calls[0]![0]).toContain("/api/releases/r1/health");
    });

    it("deleteRelease sends DELETE", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(undefined));

      await deleteRelease("r1");

      const [, init] = fetchSpy.mock.calls[0]!;
      expect(init?.method).toBe("DELETE");
    });
  });

  describe("team", () => {
    it("getTeamMembers fetches /api/team with params", async () => {
      const data = { data: [], total: 0 };
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(data));

      await getTeamMembers({ projectId: "p1", limit: 50 });

      const url = fetchSpy.mock.calls[0]![0] as string;
      expect(url).toContain("/api/team");
      expect(url).toContain("projectId=p1");
      expect(url).toContain("limit=50");
    });

    it("createTeamMember sends POST", async () => {
      const data = { id: "m1", name: "Alice" };
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(data));

      await createTeamMember({ projectId: "p1", name: "Alice", email: "a@b.com" });

      const [, init] = fetchSpy.mock.calls[0]!;
      expect(init?.method).toBe("POST");
      expect(init?.body).toBe(JSON.stringify({ projectId: "p1", name: "Alice", email: "a@b.com" }));
    });

    it("updateTeamMember sends PUT", async () => {
      const data = { id: "m1", name: "Bob" };
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(data));

      await updateTeamMember("m1", { name: "Bob" });

      const [, init] = fetchSpy.mock.calls[0]!;
      expect(init?.method).toBe("PUT");
      expect(fetchSpy.mock.calls[0]![0]).toContain("/api/team/m1");
    });

    it("deleteTeamMember sends DELETE", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(undefined));

      await deleteTeamMember("m1");

      const [, init] = fetchSpy.mock.calls[0]!;
      expect(init?.method).toBe("DELETE");
    });
  });

  describe("comments", () => {
    it("getIssueComments fetches comments for an issue", async () => {
      const data = { data: [], total: 0 };
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(data));

      await getIssueComments("i1", { limit: 10 });

      const url = fetchSpy.mock.calls[0]![0] as string;
      expect(url).toContain("/api/issues/i1/comments");
      expect(url).toContain("limit=10");
    });

    it("createIssueComment sends POST", async () => {
      const data = { id: "c1", body: "Looks good" };
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(data));

      await createIssueComment("i1", { authorName: "Alice", body: "Looks good" });

      const [, init] = fetchSpy.mock.calls[0]!;
      expect(init?.method).toBe("POST");
    });

    it("deleteIssueComment sends DELETE", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(undefined));

      await deleteIssueComment("c1");

      const [, init] = fetchSpy.mock.calls[0]!;
      expect(init?.method).toBe("DELETE");
      expect(fetchSpy.mock.calls[0]![0]).toContain("/api/comments/c1");
    });
  });

  describe("searchAll", () => {
    it("fetches /api/search with query", async () => {
      const data = { issues: [], events: [], traces: [] };
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(data));

      await searchAll("TypeError", "p1");

      const url = fetchSpy.mock.calls[0]![0] as string;
      expect(url).toContain("/api/search");
      expect(url).toContain("q=TypeError");
      expect(url).toContain("projectId=p1");
    });
  });

  describe("admin", () => {
    it("getStorage uses custom admin key header", async () => {
      const data = { totalBytes: 1024, totalHuman: "1 KB", tables: [] };
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(data));

      await getStorage("admin-secret");

      const [, init] = fetchSpy.mock.calls[0]!;
      const headers = init?.headers as Headers;
      expect(headers.get("Authorization")).toBe("Bearer admin-secret");
      expect(fetchSpy.mock.calls[0]![0]).toContain("/api/admin/storage");
    });

    it("getRetention uses custom admin key header", async () => {
      const data = { defaultDays: 30, tables: [] };
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(data));

      await getRetention("admin-secret");

      const [, init] = fetchSpy.mock.calls[0]!;
      const headers = init?.headers as Headers;
      expect(headers.get("Authorization")).toBe("Bearer admin-secret");
    });

    it("updateRetention sends PUT with body", async () => {
      const data = { tableName: "events", retentionDays: 60 };
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(data));

      await updateRetention("admin-secret", "events", 60);

      const [, init] = fetchSpy.mock.calls[0]!;
      expect(init?.method).toBe("PUT");
      expect(init?.body).toBe(JSON.stringify({ retentionDays: 60 }));
      expect(fetchSpy.mock.calls[0]![0]).toContain("/api/admin/retention/events");
    });
  });
});
