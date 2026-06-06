/**
 * End-to-end API tests for HiAi Observe.
 *
 * Tests the full request lifecycle against a running server.
 * Requires: INTEGRATION=1, running server on localhost:8001, PostgreSQL, Redis.
 *
 * Run: INTEGRATION=1 bun run test tests/e2e/api-e2e.test.ts
 */

import { describe, it, expect, } from "vitest";
import {
  apiFetch,
  createTestProjectViaApi,
  cleanupProject,
  sentryExceptionPayload,
  otlpTracePayload,
  waitFor,
  BASE_URL,
  MASTER_KEY,
} from "./helpers.js";

const enabled = !!process.env.INTEGRATION;

describe.skipIf(!enabled)("E2E API — Full Lifecycle", () => {
  let projectId: string;
  let projectApiKey: string;
  let issueId: string;
  let alertId: string;
  let monitorId: string;

  // ── Step 0: Server health ────────────────────────────────────────────────

  it("1. health check returns ok", async () => {
    const res = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(5000) });
    expect(res.status).toBe(200);
    const body = await res.json() as { status: string };
    expect(body.status).toBe("ok");
  });

  // ── Step 1: Create project ───────────────────────────────────────────────

  it("2. create project via API", async () => {
    const project = await createTestProjectViaApi("e2e-lifecycle-test");
    projectId = project.id;
    projectApiKey = project.apiKey;
    expect(projectId).toBeTruthy();
    expect(projectApiKey).toBeTruthy();
    expect(projectApiKey).toMatch(/^ho_/);
  });

  // ── Step 2: Sentry ingestion ─────────────────────────────────────────────

  it("3. ingest Sentry exception event", async () => {
    const payload = sentryExceptionPayload({ message: "E2E lifecycle test error" });
    const res = await apiFetch(`/api/${projectId}/store`, {
      method: "POST",
      body: JSON.stringify(payload),
      apiKey: projectApiKey,
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { id: string };
    expect(body.id).toBeTruthy();
  });

  // ── Step 3: Issue created ────────────────────────────────────────────────

  it("4. issue was created from Sentry event", async () => {
    const result = await waitFor(async () => {
      const res = await apiFetch(`/api/issues?projectId=${projectId}`, { apiKey: MASTER_KEY });
      const body = await res.json() as { data: Array<{ id: string; title: string }> };
      return body.data.length > 0 ? body.data[0] : null;
    });
    issueId = result?.id;
    expect(result?.title).toContain("E2E lifecycle test error");
  });

  // ── Step 4: Event stored ─────────────────────────────────────────────────

  it("5. event stored with stack trace", async () => {
    const res = await apiFetch(`/api/events?issueId=${issueId}`, { apiKey: MASTER_KEY });
    expect(res.status).toBe(200);
    const body = await res.json() as { data: Array<{ stackTrace: string | null }> };
    expect(body.data.length).toBeGreaterThan(0);
    // Stack trace should be JSON stringified array of frames
    if (body.data[0]?.stackTrace) {
      const frames = JSON.parse(body.data[0]?.stackTrace);
      expect(Array.isArray(frames)).toBe(true);
    }
  });

  // ── Step 5: Create uptime monitor ────────────────────────────────────────

  it("6. create uptime monitor", async () => {
    const res = await apiFetch("/api/monitors", {
      method: "POST",
      body: JSON.stringify({
        name: "E2E Test Monitor",
        url: "https://httpbin.org/status/200",
        interval_seconds: 300,
        project_id: projectId,
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { monitor: { id: string; name: string } };
    monitorId = body.monitor.id;
    expect(body.monitor.name).toBe("E2E Test Monitor");
  });

  // ── Step 6: Monitor listed ───────────────────────────────────────────────

  it("7. monitor appears in list", async () => {
    const res = await apiFetch("/api/monitors");
    expect(res.status).toBe(200);
    const body = await res.json() as { monitors: Array<{ id: string }> };
    const found = body.monitors.find((m) => m.id === monitorId);
    expect(found).toBeTruthy();
  });

  // ── Step 7: Create alert rule ────────────────────────────────────────────

  it("8. create alert rule", async () => {
    const res = await apiFetch("/api/alerts", {
      method: "POST",
      body: JSON.stringify({
        name: "E2E High Error Rate",
        projectId,
        condition: {
          type: "error_rate",
          operator: "gt",
          threshold: 10,
          duration: 300,
        },
        channels: [{ type: "telegram", target: "123456789" }],
        cooldownSeconds: 300,
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { id: string; name: string };
    alertId = body.id;
    expect(body.name).toBe("E2E High Error Rate");
  });

  // ── Step 8: Alert listed ─────────────────────────────────────────────────

  it("9. alert appears in list", async () => {
    const res = await apiFetch("/api/alerts");
    expect(res.status).toBe(200);
    const body = await res.json() as { items: Array<{ id: string }> };
    const found = body.items.find((a) => a.id === alertId);
    expect(found).toBeTruthy();
  });

  // ── Step 9: Test alert ───────────────────────────────────────────────────

  it("10. test alert endpoint works", async () => {
    const res = await apiFetch(`/api/alerts/${alertId}/test`, { method: "POST" });
    // May return 200 even if notification fails (channels not configured)
    expect(res.status).toBeLessThan(500);
    const body = await res.json() as { ok?: boolean; channels?: unknown[] };
    expect(body).toBeTruthy();
  });

  // ── Step 10: Dashboard ───────────────────────────────────────────────────

  it("11. dashboard returns aggregated data", async () => {
    const res = await apiFetch("/api/dashboard");
    expect(res.status).toBe(200);
    const body = await res.json() as {
      errorCount24h: number;
      uptimePercent: number;
      activeContainers: number;
      traceCount24h: number;
      recentIssues: unknown[];
      monitorStatuses: unknown[];
    };
    expect(typeof body.errorCount24h).toBe("number");
    expect(typeof body.uptimePercent).toBe("number");
    expect(typeof body.traceCount24h).toBe("number");
    expect(Array.isArray(body.recentIssues)).toBe(true);
    expect(Array.isArray(body.monitorStatuses)).toBe(true);
    // We ingested at least 1 error
    expect(body.errorCount24h).toBeGreaterThanOrEqual(1);
  });

  // ── Step 11: Export ──────────────────────────────────────────────────────

  it("12. export issues as JSON", async () => {
    const res = await apiFetch("/api/export/issues");
    expect(res.status).toBe(200);
    const body = await res.json() as { data: unknown[]; count: number };
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(1);
  });

  it("12b. export issues as CSV", async () => {
    const res = await apiFetch("/api/export/issues?format=csv");
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("id,title,type,status");
    expect(text).toContain("E2E lifecycle test error");
  });

  // ── Step 12: OTLP traces ────────────────────────────────────────────────

  it("13. ingest OTLP trace", async () => {
    const payload = otlpTracePayload(projectId);
    const res = await apiFetch("/v1/traces", {
      method: "POST",
      body: JSON.stringify(payload),
      apiKey: projectApiKey,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({});
  });

  it("13b. trace is queryable", async () => {
    const result = await waitFor(async () => {
      const res = await apiFetch(`/api/traces?workflowName=e2e-workflow`, { apiKey: MASTER_KEY });
      const body = await res.json() as { data: Array<{ name: string }>; total: number };
      return body.total > 0 ? body.data[0] : null;
    });
    expect(result?.name).toBe("e2e-test-span");
  });

  // ── Step 13: Cleanup ─────────────────────────────────────────────────────

  it("14. cleanup: delete project and all related data", async () => {
    // Delete via API
    const res = await apiFetch(`/api/monitors/${monitorId}`, { method: "DELETE" });
    expect(res.status).toBe(200);

    const res2 = await apiFetch(`/api/alerts/${alertId}`, { method: "DELETE" });
    expect(res2.status).toBe(200);

    // Delete project via DB cleanup (API delete cascades in future)
    await cleanupProject(projectId);

    // Verify project is gone
    const checkRes = await apiFetch(`/api/projects`);
    const body = await checkRes.json() as { projects: Array<{ id: string }> };
    const found = body.projects.find((p) => p.id === projectId);
    expect(found).toBeUndefined();
  });
});
