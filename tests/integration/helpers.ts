/**
 * Integration test helpers — shared utilities for integration tests.
 *
 * These tests require a running server and database. They are skipped by default
 * in unit test runs. Use `bun test --integration` or set INTEGRATION=1 to enable.
 */

import { db } from "../../src/store/db.js";
import { projects, events, issues, traces } from "../../src/store/schema.js";
import { eq } from "drizzle-orm";

export const TEST_PROJECT_NAME = "integration-test-project";
export const TEST_PROJECT_SLUG = "integration-test";
export const TEST_API_KEY = "hiai-integration-test-key-12345";
export const TEST_BASE_URL = process.env.HIAI_OBSERVE_URL || "http://localhost:8001";

/**
 * Create a test project in the database and return its ID.
 * If the project already exists, return its ID.
 */
export async function createTestProject(): Promise<string> {
  const existing = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.slug, TEST_PROJECT_SLUG))
    .limit(1);

  if (existing[0]) return existing[0].id;

  const [created] = await db
    .insert(projects)
    .values({
      name: TEST_PROJECT_NAME,
      slug: TEST_PROJECT_SLUG,
      apiKey: TEST_API_KEY,
    })
    .returning({ id: projects.id });

  return created.id;
}

/**
 * Delete all test data created during integration tests.
 * Call this in afterAll/afterEach hooks.
 */
export async function cleanupTestData(): Promise<void> {
  const existing = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.slug, TEST_PROJECT_SLUG))
    .limit(1);

  if (!existing[0]) return;

  const projectId = existing[0].id;

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
export async function apiFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
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
