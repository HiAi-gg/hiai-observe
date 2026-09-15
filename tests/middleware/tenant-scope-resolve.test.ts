/**
 * Always-on tenantId → projectId assertions (mocked lookup).
 *
 * Live Postgres coverage lives in tenant-scope.test.ts behind
 * TENANT_SCOPE_LIVE_DB=1 + isIsolatedObserveFixture (CI: observe@localhost/hiai_observe
 * when GITHUB_ACTIONS=true; local: observe_test at 127.0.0.1/hiai_observe_test).
 */

import { Elysia } from "elysia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const lookupProjectByTenantId = vi.fn();

vi.mock("../../src/lib/auth.js", () => ({
  lookupProjectByTenantId: (tenantId: string | null | undefined) =>
    lookupProjectByTenantId(tenantId),
}));

const { tenantScopePlugin } = await import("../../src/middleware/tenant-scope.js");

const BOUND = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function makeApp() {
  return new Elysia()
    .use(tenantScopePlugin)
    .get("/probe-all", ({ query }) => ({ query: { ...query } }))
    .get("/probe-snake", ({ query }) => ({ project_id: query.project_id }))
    .get("/probe-camel", ({ query }) => ({ projectId: query.projectId }))
    .get("/probe-derived", ({ tenantProjectId, resolvedProjectId }) => ({
      tenantProjectId,
      resolvedProjectId,
    }));
}

describe("tenantScopePlugin — mocked tenantId → projectId", () => {
  beforeEach(() => {
    lookupProjectByTenantId.mockReset();
  });

  it("resolves a known tenant id to its bound project uuid", async () => {
    lookupProjectByTenantId.mockResolvedValue({ projectId: BOUND });
    const app = makeApp();
    const res = await app.handle(new Request("http://localhost/probe-all?tenantId=acme-tenant"));
    const body = await res.json();
    expect(lookupProjectByTenantId).toHaveBeenCalledWith("acme-tenant");
    expect(body.query.project_id).toBe(BOUND);
    expect(body.query.projectId).toBe(BOUND);
  });

  it("resolves snake ?tenant_id= the same way", async () => {
    lookupProjectByTenantId.mockResolvedValue({ projectId: BOUND });
    const app = makeApp();
    const res = await app.handle(new Request("http://localhost/probe-all?tenant_id=acme-tenant"));
    const body = await res.json();
    expect(lookupProjectByTenantId).toHaveBeenCalledWith("acme-tenant");
    expect(body.query.project_id).toBe(BOUND);
    expect(body.query.projectId).toBe(BOUND);
  });

  it("exposes the raw tenant id on tenantProjectId and the resolved uuid on resolvedProjectId", async () => {
    lookupProjectByTenantId.mockResolvedValue({ projectId: BOUND });
    const app = makeApp();
    const res = await app.handle(
      new Request("http://localhost/probe-derived?tenantId=acme-tenant"),
    );
    const body = await res.json();
    expect(body.tenantProjectId).toBe("acme-tenant");
    expect(body.resolvedProjectId).toBe(BOUND);
  });

  it("leaves resolvedProjectId undefined when lookup returns no project", async () => {
    lookupProjectByTenantId.mockResolvedValue(null);
    const app = makeApp();
    const res = await app.handle(
      new Request("http://localhost/probe-derived?tenantId=does-not-exist-tenant"),
    );
    const body = await res.json();
    expect(body.tenantProjectId).toBe("does-not-exist-tenant");
    expect(body.resolvedProjectId).toBeUndefined();
  });

  it("skips tenant resolution when caller passed a canonical projectId", async () => {
    lookupProjectByTenantId.mockResolvedValue({ projectId: BOUND });
    const app = makeApp();
    const res = await app.handle(
      new Request("http://localhost/probe-derived?projectId=canon-uuid&tenantId=acme-tenant"),
    );
    const body = await res.json();
    expect(lookupProjectByTenantId).not.toHaveBeenCalled();
    expect(body.tenantProjectId).toBe("canon-uuid");
    expect(body.resolvedProjectId).toBeUndefined();
  });

  it("fills snake query.project_id from ?tenantId=", async () => {
    lookupProjectByTenantId.mockResolvedValue(null);
    const app = makeApp();
    const res = await app.handle(new Request("http://localhost/probe-snake?tenantId=xyz"));
    const body = await res.json();
    expect(body).toEqual({ project_id: "xyz" });
  });

  it("fills camel query.projectId from ?tenant_id=", async () => {
    lookupProjectByTenantId.mockResolvedValue(null);
    const app = makeApp();
    const res = await app.handle(new Request("http://localhost/probe-camel?tenant_id=xyz"));
    const body = await res.json();
    expect(body).toEqual({ projectId: "xyz" });
  });

  it("strips tenant-style alias keys from query", async () => {
    lookupProjectByTenantId.mockResolvedValue(null);
    const app = makeApp();
    const res = await app.handle(new Request("http://localhost/probe-all?tenantId=xyz"));
    const body = await res.json();
    expect("tenantId" in body.query).toBe(false);
    expect("tenant_id" in body.query).toBe(false);
  });

  it("preserves non-scope query params during normalization", async () => {
    lookupProjectByTenantId.mockResolvedValue(null);
    const app = makeApp();
    const res = await app.handle(
      new Request("http://localhost/probe-all?tenantId=xyz&status=open&limit=50"),
    );
    const body = await res.json();
    expect(body.query.project_id).toBe("xyz");
    expect(body.query.projectId).toBe("xyz");
    expect(body.query.status).toBe("open");
    expect(body.query.limit).toBe("50");
  });

  it("does not overwrite explicit canonical project_id with tenant alias", async () => {
    lookupProjectByTenantId.mockResolvedValue({ projectId: BOUND });
    const app = makeApp();
    const res = await app.handle(
      new Request("http://localhost/probe-all?project_id=canon&tenantId=alias"),
    );
    const body = await res.json();
    expect(lookupProjectByTenantId).not.toHaveBeenCalled();
    expect(body.query.project_id).toBe("canon");
  });
});
