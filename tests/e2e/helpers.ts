/**
 * E2E test helpers — HTTP-only utilities for end-to-end API testing.
 *
 * These tests require a running server, PostgreSQL, and Redis.
 * Skipped by default. Set INTEGRATION=1 to enable.
 */

import { db } from "../../src/store/db.js";
import { projects, events, issues, traces, uptimeMonitors, uptimeChecks, alerts, alertHistory, logs, containerStats, hostStats } from "../../src/store/schema.js";
import { eq } from "drizzle-orm";

export const BASE_URL = process.env.HIAI_OBSERVE_URL || "http://localhost:8001";
export const MASTER_KEY = process.env.HIAI_OBSERVE_API_KEY || "dev-key-local-testing";

/**
 * Authenticated fetch against the API.
 */
export async function apiFetch(
  path: string,
  options: RequestInit & { apiKey?: string } = {},
): Promise<Response> {
  const { apiKey, ...init } = options;
  const key = apiKey ?? MASTER_KEY;
  const url = `${BASE_URL}${path}`;

  const headers = new Headers(init.headers);
  if (key) {
    headers.set("Authorization", `Bearer ${key}`);
  }
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(url, { ...init, headers, signal: AbortSignal.timeout(15_000) });
}

/**
 * Create a project via API and return its id + apiKey.
 */
export async function createTestProjectViaApi(name = "e2e-test-project"): Promise<{ id: string; apiKey: string }> {
  const res = await apiFetch("/api/projects", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`Failed to create project: ${res.status} ${await res.text()}`);
  const data = await res.json() as { project: { id: string }; apiKey: string };
  return { id: data.project.id, apiKey: data.apiKey };
}

/**
 * Delete a project and all related data directly via DB (cleanup).
 */
export async function cleanupProject(projectId: string): Promise<void> {
  // Delete in FK order
  await db.delete(alertHistory).where(eq(alertHistory.alertId, projectId));
  await db.delete(events).where(eq(events.projectId, projectId));
  await db.delete(traces).where(eq(traces.projectId, projectId));
  await db.delete(logs).where(eq(logs.containerId, ""));
  await db.delete(containerStats);
  await db.delete(hostStats);
  await db.delete(uptimeChecks);
  await db.delete(uptimeMonitors).where(eq(uptimeMonitors.projectId, projectId));
  await db.delete(alerts).where(eq(alerts.projectId, projectId));
  await db.delete(issues).where(eq(issues.projectId, projectId));
  await db.delete(projects).where(eq(projects.id, projectId));
}

/**
 * Minimal Sentry exception event payload.
 */
export function sentryExceptionPayload(overrides?: Record<string, unknown>) {
  return {
    event_id: crypto.randomUUID().replace(/-/g, "").slice(0, 32),
    timestamp: new Date().toISOString(),
    level: "error",
    logger: "test",
    platform: "node",
    release: "e2e@1.0.0",
    environment: "test",
    message: "E2E test error",
    exception: {
      values: [
        {
          type: "Error",
          value: "E2E test error",
          stacktrace: {
            frames: [
              { filename: "app.ts", function: "main", lineno: 42, in_app: true },
              { filename: "node_modules/elysia/src/index.ts", function: "handle", lineno: 312, in_app: false },
            ],
          },
        },
      ],
    },
    tags: { test: "e2e", environment: "test" },
    user: { id: "e2e-user-1", email: "e2e@test.local" },
    breadcrumbs: [
      { category: "console", message: "E2E test started", timestamp: Date.now() / 1000 },
    ],
    ...overrides,
  };
}

/**
 * Minimal OTLP trace payload with one span.
 */
export function otlpTracePayload(_projectId: string) {
  const traceId = crypto.randomUUID().replace(/-/g, "").slice(0, 32);
  const spanId = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const now = Date.now();
  const startNs = String(now * 1_000_000);
  const endNs = String((now + 500) * 1_000_000);

  return {
    resourceSpans: [
      {
        resource: {
          attributes: [
            { key: "service.name", value: { stringValue: "e2e-test-service" } },
          ],
        },
        scopeSpans: [
          {
            scope: { name: "e2e-test", version: "1.0.0" },
            spans: [
              {
                traceId,
                spanId,
                name: "e2e-test-span",
                kind: "SPAN_KIND_INTERNAL",
                startTimeUnixNano: startNs,
                endTimeUnixNano: endNs,
                attributes: [
                  { key: "mastra.workflow", value: { stringValue: "e2e-workflow" } },
                  { key: "mastra.tool", value: { stringValue: "e2e-tool" } },
                ],
                status: { code: "STATUS_CODE_OK" },
              },
            ],
          },
        ],
      },
    ],
  };
}

/**
 * Poll until condition is true or timeout.
 */
export async function waitFor<T>(
  fn: () => Promise<T | null | undefined>,
  timeoutMs = 10_000,
  intervalMs = 500,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await fn();
    if (result) return result;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Condition not met within ${timeoutMs}ms`);
}
