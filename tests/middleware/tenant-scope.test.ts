/**
 * Tests for tenantScopePlugin (OBS2.3b acceptance).
 *
 * The plugin:
 *   1. Derives `tenantProjectId` from ?tenantId= / ?tenant_id= / ?project_id= / ?projectId=
 *   2. Resolves `tenantId` / `tenant_id` aliases to a bound project UUID via
 *      `lookupProjectByTenantId` (so non-UUID tenant slugs become the
 *      projectId that the DB filter expects)
 *   3. Normalizes the parsed `query` so handlers reading either snake
 *      (query.project_id) or camel (query.projectId) form see the value
 *   4. Strips the tenant-style alias keys from `query`
 *   5. Lets canonical values win when caller passes both alias and canonical
 *
 * These tests mount the plugin on a minimal Elysia app and exercise
 * downstream routes that read both snake and camel query keys.
 */

import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tenantScopePlugin } from "../../src/middleware/tenant-scope.js";
import { db } from "../../src/store/db.js";
import { projects } from "../../src/store/schema.js";

function makeApp() {
  return new Elysia()
    .use(tenantScopePlugin)
    .get("/probe-snake", ({ query }) => ({ project_id: query.project_id }))
    .get("/probe-camel", ({ query }) => ({ projectId: query.projectId }))
    .get("/probe-derived", ({ tenantProjectId, resolvedProjectId }) => ({
      tenantProjectId,
      resolvedProjectId,
    }))
    .get("/probe-all", ({ query }) => ({ query: { ...query } }));
}

describe("tenantScopePlugin — alias resolution", () => {
  const app = makeApp();

  it("derives tenantProjectId from ?tenantId=", async () => {
    const res = await app.handle(new Request("http://localhost/probe-derived?tenantId=abc-123"));
    const body = await res.json();
    expect(body).toEqual({ tenantProjectId: "abc-123", resolvedProjectId: undefined });
  });

  it("derives tenantProjectId from ?tenant_id=", async () => {
    const res = await app.handle(new Request("http://localhost/probe-derived?tenant_id=abc-123"));
    const body = await res.json();
    expect(body).toEqual({ tenantProjectId: "abc-123", resolvedProjectId: undefined });
  });

  it("derives tenantProjectId from ?project_id=", async () => {
    const res = await app.handle(new Request("http://localhost/probe-derived?project_id=canon"));
    const body = await res.json();
    expect(body).toEqual({ tenantProjectId: "canon", resolvedProjectId: undefined });
  });

  it("canonical ?project_id wins over tenant alias", async () => {
    const res = await app.handle(
      new Request("http://localhost/probe-derived?project_id=canon&tenantId=alias"),
    );
    const body = await res.json();
    expect(body).toEqual({ tenantProjectId: "canon", resolvedProjectId: undefined });
  });

  it("canonical ?projectId wins over ?tenant_id alias", async () => {
    const res = await app.handle(
      new Request("http://localhost/probe-derived?projectId=canon&tenant_id=alias"),
    );
    const body = await res.json();
    expect(body).toEqual({ tenantProjectId: "canon", resolvedProjectId: undefined });
  });

  it("returns undefined when no scope alias is present", async () => {
    const res = await app.handle(new Request("http://localhost/probe-derived?status=open"));
    const body = await res.json();
    expect(body).toEqual({ tenantProjectId: undefined, resolvedProjectId: undefined });
  });
});

describe("tenantScopePlugin — query normalization", () => {
  const app = makeApp();

  it("fills snake query.project_id from ?tenantId=", async () => {
    const res = await app.handle(new Request("http://localhost/probe-snake?tenantId=xyz"));
    const body = await res.json();
    expect(body).toEqual({ project_id: "xyz" });
  });

  it("fills camel query.projectId from ?tenant_id=", async () => {
    const res = await app.handle(new Request("http://localhost/probe-camel?tenant_id=xyz"));
    const body = await res.json();
    expect(body).toEqual({ projectId: "xyz" });
  });

  it("fills both canonical forms when caller used a tenant alias", async () => {
    const res = await app.handle(new Request("http://localhost/probe-all?tenant_id=both"));
    const body = await res.json();
    expect(body.query.project_id).toBe("both");
    expect(body.query.projectId).toBe("both");
  });

  it("strips tenant-style alias keys from query", async () => {
    const res = await app.handle(new Request("http://localhost/probe-all?tenantId=xyz"));
    const body = await res.json();
    expect("tenantId" in body.query).toBe(false);
    expect("tenant_id" in body.query).toBe(false);
  });

  it("preserves non-scope query params during normalization", async () => {
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
    const res = await app.handle(
      new Request("http://localhost/probe-all?project_id=canon&tenantId=alias"),
    );
    const body = await res.json();
    expect(body.query.project_id).toBe("canon");
  });

  it("does not overwrite explicit canonical projectId with tenant alias", async () => {
    const res = await app.handle(
      new Request("http://localhost/probe-camel?projectId=canon&tenant_id=alias"),
    );
    const body = await res.json();
    expect(body).toEqual({ projectId: "canon" });
  });
});

describe("tenantScopePlugin — tenantId → projectId resolution", () => {
  // Insert a real project bound to a known tenantId so the lookup actually
  // hits the database and returns a real UUID. Cleanup happens in afterAll.
  const TENANT_ID = `test-tenant-${randomUUID().slice(0, 8)}`;
  const tenantProjectId = randomUUID();

  beforeAll(async () => {
    await db.insert(projects).values({
      id: tenantProjectId,
      name: "Tenant Scope Test",
      slug: `t-${randomUUID().slice(0, 8)}`,
      tenantId: TENANT_ID,
    });
  });

  afterAll(async () => {
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

  it("leaves resolvedProjectId undefined when tenant has no bound project", async () => {
    const app = makeApp();
    const res = await app.handle(
      new Request("http://localhost/probe-derived?tenantId=does-not-exist-tenant"),
    );
    const body = await res.json();
    expect(body.tenantProjectId).toBe("does-not-exist-tenant");
    expect(body.resolvedProjectId).toBeUndefined();
  });

  it("skips tenant resolution when caller passed a canonical projectId", async () => {
    const app = makeApp();
    const res = await app.handle(
      new Request(`http://localhost/probe-derived?projectId=canon-uuid&tenantId=${TENANT_ID}`),
    );
    const body = await res.json();
    expect(body.tenantProjectId).toBe("canon-uuid");
    expect(body.resolvedProjectId).toBeUndefined();
  });
});
