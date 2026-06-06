/**
 * Sentry SDK Integration Test
 *
 * Tests real Sentry SDK compatibility by sending events to HiAi Observe
 * ingestion endpoint and verifying they are stored correctly.
 *
 * Requires: running HiAi Observe server + PostgreSQL database.
 * Skip in CI by default — run with INTEGRATION=1 bun test tests/integration/
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createTestProject,
  cleanupTestData,
  waitForCondition,
  apiFetch,
  isServerReachable,
  TEST_BASE_URL,
} from "./helpers.js";
import { db } from "../../src/store/db.js";
import { issues, events } from "../../src/store/schema.js";
import { eq, and } from "drizzle-orm";

const SKIP = !(process.env.INTEGRATION === "1");

describe.skipIf(SKIP)("Sentry SDK Integration", () => {
  let projectId: string;
  let serverOk: boolean;

  beforeAll(async () => {
    serverOk = await isServerReachable();
    if (!serverOk) return;
    projectId = await createTestProject();
  });

  afterAll(async () => {
    if (serverOk) await cleanupTestData();
  });

  it("server is reachable", async () => {
    if (!serverOk) {
      console.warn("Skipping: HiAi Observe server not reachable at", TEST_BASE_URL);
      return;
    }
    expect(serverOk).toBe(true);
  });

  it("accepts a Sentry exception event via store endpoint", async () => {
    if (!serverOk) return;

    const sentryEvent = {
      event_id: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
      exception: {
        values: [
          {
            type: "TypeError",
            value: "Cannot read property 'map' of undefined",
            stacktrace: {
              frames: [
                {
                  filename: "node_modules/app/index.js",
                  function: "processData",
                  lineno: 42,
                  colno: 15,
                  in_app: true,
                },
                {
                  filename: "node_modules/app/utils.js",
                  function: "transform",
                  lineno: 10,
                  colno: 3,
                  in_app: false,
                },
              ],
            },
          },
        ],
      },
      message: "TypeError in processData",
      level: "error",
      tags: { environment: "production", region: "us-east-1" },
      sdk: { name: "sentry.javascript.node", version: "8.0.0" },
      release: "app@2.1.0",
      environment: "production",
      timestamp: Date.now() / 1000,
    };

    const res = await apiFetch(`/api/${projectId}/store`, {
      method: "POST",
      body: JSON.stringify(sentryEvent),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("id");

    // Verify event was stored
    await waitForCondition(async () => {
      const stored = await db
        .select()
        .from(events)
        .where(eq(events.projectId, projectId))
        .limit(1);
      return stored.length > 0 ? stored : null;
    }, 5000);

    const storedEvents = await db
      .select()
      .from(events)
      .where(eq(events.projectId, projectId));

    expect(storedEvents.length).toBeGreaterThanOrEqual(1);
    expect(storedEvents[0].exceptionType).toBe("TypeError");
    expect(storedEvents[0].level).toBe("error");
  });

  it("accepts a Sentry message event", async () => {
    if (!serverOk) return;

    const messageEvent = {
      event_id: "b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7",
      message: "User login failed: invalid credentials",
      level: "warning",
      tags: { service: "auth" },
      sdk: { name: "sentry.javascript.node", version: "8.0.0" },
    };

    const res = await apiFetch(`/api/${projectId}/store`, {
      method: "POST",
      body: JSON.stringify(messageEvent),
    });

    expect(res.status).toBe(200);
  });

  it("groups duplicate exceptions into the same issue", async () => {
    if (!serverOk) return;

    const exceptionPayload = {
      exception: {
        values: [
          {
            type: "RangeError",
            value: "Maximum call stack size exceeded",
            stacktrace: {
              frames: [
                {
                  filename: "src/recursive.ts",
                  function: "recurse",
                  lineno: 10,
                  in_app: true,
                },
              ],
            },
          },
        ],
      },
      sdk: { name: "sentry.javascript.node", version: "8.0.0" },
    };

    // Send same exception 3 times
    for (let i = 0; i < 3; i++) {
      await apiFetch(`/api/${projectId}/store`, {
        method: "POST",
        body: JSON.stringify(exceptionPayload),
      });
    }

    // Wait for all events to be processed
    await waitForCondition(async () => {
      const count = await db
        .select()
        .from(events)
        .where(
          and(
            eq(events.projectId, projectId),
            eq(events.exceptionType, "RangeError"),
          ),
        );
      return count.length >= 3 ? count : null;
    }, 5000);

    // Check that exactly one issue was created for this exception type
    const issueList = await db
      .select()
      .from(issues)
      .where(eq(issues.projectId, projectId));

    const rangeErrorIssues = issueList.filter(
      (i) => i.title?.includes("RangeError"),
    );

    expect(rangeErrorIssues.length).toBe(1);
    expect(rangeErrorIssues[0].count).toBeGreaterThanOrEqual(3);
  });

  it("preserves breadcrumbs and user context", async () => {
    if (!serverOk) return;

    const eventWithContext = {
      event_id: "c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8",
      exception: {
        values: [
          {
            type: "Error",
            value: "Something went wrong",
            stacktrace: {
              frames: [
                {
                  filename: "app.ts",
                  function: "handleAction",
                  lineno: 55,
                  in_app: true,
                },
              ],
            },
          },
        ],
      },
      breadcrumbs: {
        values: [
          {
            type: "navigation",
            category: "navigation",
            message: "Navigated to /dashboard",
            timestamp: Date.now() / 1000 - 10,
          },
          {
            type: "http",
            category: "fetch",
            message: "GET /api/users",
            data: { status_code: 200, method: "GET" },
            timestamp: Date.now() / 1000 - 5,
          },
        ],
      },
      user: {
        id: "user-123",
        email: "test@example.com",
        username: "testuser",
      },
      tags: { environment: "staging", feature: "dashboard" },
      sdk: { name: "sentry.javascript.node", version: "8.0.0" },
    };

    const res = await apiFetch(`/api/${projectId}/store`, {
      method: "POST",
      body: JSON.stringify(eventWithContext),
    });

    expect(res.status).toBe(200);

    // Verify the event context was stored
    await waitForCondition(async () => {
      const stored = await db
        .select()
        .from(events)
        .where(
          and(
            eq(events.projectId, projectId),
            eq(events.exceptionType, "Error"),
          ),
        )
        .limit(1);
      return stored.length > 0 ? stored : null;
    }, 5000);

    const storedEvents = await db
      .select()
      .from(events)
      .where(
        and(
          eq(events.projectId, projectId),
          eq(events.exceptionType, "Error"),
        ),
      )
      .limit(1);

    expect(storedEvents.length).toBe(1);
    const ctx = storedEvents[0].context as Record<string, unknown>;
    expect(ctx).toBeDefined();
    expect(ctx?.breadcrumbs).toBeDefined();
    expect(ctx?.user).toBeDefined();
  });

  it("rejects unauthenticated requests", async () => {
    if (!serverOk) return;

    const res = await fetch(`${TEST_BASE_URL}/api/${projectId}/store`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "test" }),
    });

    expect(res.status).toBe(401);
  });

  it("rejects requests with wrong project ID", async () => {
    if (!serverOk) return;

    const fakeProjectId = "00000000-0000-0000-0000-000000000000";
    const res = await apiFetch(`/api/${fakeProjectId}/store`, {
      method: "POST",
      body: JSON.stringify({ message: "test" }),
    });

    expect(res.status).toBe(401);
  });
});
