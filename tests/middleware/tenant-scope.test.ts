/**
 * Live tenantId → projectId resolution.
 *
 * No top-level store/db or plugin import: skipIf runs before any Postgres
 * client is created. Insert/delete run only when liveTenantFixture() is true
 * (TENANT_SCOPE_LIVE_DB=1 + isolated DSN). Fail hard when the suite is on.
 *
 * Always-on mocked coverage: tests/middleware/tenant-scope-resolve.test.ts
 */

import { randomUUID } from "node:crypto";
import { Elysia } from "elysia";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isIsolatedObserveFixture, liveTenantFixture } from "../lib/isolated-db.js";

const live = liveTenantFixture();

describe.skipIf(!live)("tenantScopePlugin — tenantId → projectId resolution (live DB)", () => {
  const TENANT_ID = `test-tenant-${randomUUID().slice(0, 8)}`;
  const tenantProjectId = randomUUID();
  let tenantScopePlugin: typeof import("../../src/middleware/tenant-scope.js").tenantScopePlugin;

  function makeApp() {
    return new Elysia()
      .use(tenantScopePlugin)
      .get("/probe-all", ({ query }) => ({ query: { ...query } }))
      .get("/probe-derived", ({ tenantProjectId, resolvedProjectId }) => ({
        tenantProjectId,
        resolvedProjectId,
      }));
  }

  beforeAll(async () => {
    if (!isIsolatedObserveFixture(process.env.DATABASE_URL)) {
      throw new Error(
        "TENANT_SCOPE_LIVE_DB=1 requires isolated DATABASE_URL (CI observe@localhost/hiai_observe or local observe_test@*/hiai_observe_test)",
      );
    }
    ({ tenantScopePlugin } = await import("../../src/middleware/tenant-scope.js"));
    const { db } = await import("../../src/store/db.js");
    const { projects } = await import("../../src/store/schema.js");
    await db.insert(projects).values({
      id: tenantProjectId,
      name: "Tenant Scope Test",
      slug: `t-${randomUUID().slice(0, 8)}`,
      tenantId: TENANT_ID,
    });
  });

  afterAll(async () => {
    const { eq } = await import("drizzle-orm");
    const { db } = await import("../../src/store/db.js");
    const { projects } = await import("../../src/store/schema.js");
    await db.delete(projects).where(eq(projects.id, tenantProjectId));
  });

  it("resolves a known tenant id to its bound project uuid", async () => {
    const app = makeApp();
    const res = await app.handle(new Request(`http://localhost/probe-all?tenantId=${TENANT_ID}`));
    const body = await res.json();
    expect(body.query.project_id).toBe(tenantProjectId);
    expect(body.query.projectId).toBe(tenantProjectId);
  });

  it("resolves snake ?tenant_id= the same way", async () => {
    const app = makeApp();
    const res = await app.handle(new Request(`http://localhost/probe-all?tenant_id=${TENANT_ID}`));
    const body = await res.json();
    expect(body.query.project_id).toBe(tenantProjectId);
    expect(body.query.projectId).toBe(tenantProjectId);
  });

  it("exposes the raw tenant id on tenantProjectId and the resolved uuid on resolvedProjectId", async () => {
    const app = makeApp();
    const res = await app.handle(
      new Request(`http://localhost/probe-derived?tenantId=${TENANT_ID}`),
    );
    const body = await res.json();
    expect(body.tenantProjectId).toBe(TENANT_ID);
    expect(body.resolvedProjectId).toBe(tenantProjectId);
  });
});
