/**
 * Integration test helpers — shared utilities for integration tests.
 *
 * These tests require a running server and database. They are skipped by default
 * in unit test runs. Use `bun test --integration` or set INTEGRATION=1 to enable.
 */

import { eq } from "drizzle-orm";
import { db } from "../../src/store/db.js";
import { events, issues, projects, traces } from "../../src/store/schema.js";

export const TEST_PROJECT_NAME = "integration-test-project";
export const TEST_PROJECT_SLUG = "integration-test-project";
/** Live-binding: overwritten by createTestProject() with the plaintext key from POST /api/projects. */
export let TEST_API_KEY = "hiai-integration-test-key-12345";
export const TEST_BASE_URL = process.env.HIAI_OBSERVE_URL || "http://localhost:8001";

let createdProjectId: string | null = null;

/**
 * Create a test project via the admin API so the server hashes the key.
 * Vitest runs in a Node environment, so we cannot call Bun.password here.
 * Pass a unique `name` when suites run in parallel (slug is derived from name).
 */
export async function createTestProject(name = TEST_PROJECT_NAME): Promise<string> {
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) {
    throw new Error("ADMIN_API_KEY is required for integration tests");
  }

  const res = await fetch(`${TEST_BASE_URL}/api/projects`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminKey}`,
    },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    throw new Error(`Failed to create test project: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { project: { id: string }; apiKey: string };
  TEST_API_KEY = data.apiKey;
  createdProjectId = data.project.id;
  return data.project.id;
}

/**
 * Delete all test data created during integration tests.
 * Call this in afterAll/afterEach hooks.
 */
export async function cleanupTestData(): Promise<void> {
  const projectId = createdProjectId;
  createdProjectId = null;
  if (!projectId) return;

  // Delete in FK order
  await db.delete(events).where(eq(events.projectId, projectId));
  await db.delete(traces).where(eq(traces.projectId, projectId));
  await db.delete(issues).where(eq(issues.projectId, projectId));
  await db.delete(projects).where(eq(projects.id, projectId));
}

/**
 * Poll a condition function until it returns true or timeout is reached.
 * Returns the result of the condition function if truthy, or throws on timeout.
 */
export async function waitForCondition<T>(
  fn: () => Promise<T | null | undefined>,
  timeoutMs = 5000,
  intervalMs = 200,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const result = await fn();
    if (result) return result;
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error(`Condition not met within ${timeoutMs}ms`);
}

/**
 * Make an authenticated fetch request to the HiAi Observe API.
 */
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const url = `${TEST_BASE_URL}${path}`;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${TEST_API_KEY}`,
    ...options.headers,
  };

  return fetch(url, { ...options, headers });
}

/**
 * Check if the test server is reachable. Skip test if not.
 */
export async function isServerReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${TEST_BASE_URL}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
