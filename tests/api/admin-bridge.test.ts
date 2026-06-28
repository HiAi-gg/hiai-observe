/**
 * Tests for admin-bridge (OBS2.3c): server-to-server API used by
 * hiai-admin-proxy to manage per-tenant observe projects.
 *
 * Covers:
 *   - POST   /api/admin/projects (mint key, idempotent on tenantId)
 *   - GET    /api/admin/projects (list)
 *   - POST   /api/admin/projects/:id/rotate-key
 *   - GET    /api/admin/tenants/:tenantId (tenant → project resolution)
 *   - All endpoints require ADMIN_API_KEY via requireAdminKey()
 *
 * See docs/AUTH_BRIDGE.md §"Observe-side implementation" for the
 * design that motivates these tests.
 */

import { Elysia } from "elysia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Admin key setup ────────────────────────────────────────────────────
// Set before module imports. requireAdminKey() reads from env on first
// call (cached in frozen config object). We reset modules in beforeEach
// to pick up env changes per test.
process.env.ADMIN_API_KEY = "test-admin-key-1234567890";

// ── Drizzle chain mocks ───────────────────────────────────────────────
// Each call to db.select()/db.insert()/db.update() pulls the next
// thenable chain from the queue so we can stage return values.
type Chain = {
  from: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  orderBy: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  values: ReturnType<typeof vi.fn>;
  returning: ReturnType<typeof vi.fn>;
  then: <T>(resolve: (value: unknown) => T, reject?: (reason: unknown) => T) => Promise<T>;
};

function makeChain(result: unknown): Chain {
  const chain: Partial<Chain> = {};
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.orderBy = vi.fn(() => chain);
  chain.set = vi.fn(() => chain);
  chain.values = vi.fn(() => chain);
  chain.returning = vi.fn(() => chain);
  chain.then = (resolve, reject) =>
    Promise.resolve(result).then(resolve, reject ?? ((v) => v as never));
  return chain as Chain;
}

let selectCalls: unknown[][] = [];
let insertCalls: Array<{ result: unknown; args: unknown }> = [];
let updateCalls: Array<{ result: unknown; args: unknown }> = [];

const dbMock = {
  select: vi.fn(() => {
    const next = selectCalls.shift() ?? [];
    return makeChain(next);
  }),
  insert: vi.fn((values: unknown) => {
    const slot = insertCalls.shift() ?? { result: [], args: values };
    return makeChain(slot.result);
  }),
  update: vi.fn((values: unknown) => {
    const slot = updateCalls.shift() ?? { result: [], args: values };
    return makeChain(slot.result);
  }),
};

vi.mock("../../src/store/db.js", () => ({ db: dbMock }));

// bcrypt hashing is non-deterministic — stub it so we can assert on prefix/hash
const hashApiKeyMock = vi.fn(async (key: string) => ({
  hash: `hashed-${key}`,
  prefix: key.slice(0, 8),
}));
vi.mock("../../src/lib/auth.js", () => ({
  hashApiKey: hashApiKeyMock,
  maskApiKey: (k: string) => (k.length <= 8 ? k : `${k.slice(0, 8)}...`),
}));

// Logger is noisy in tests; silence it.
vi.mock("../../src/lib/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const ADMIN_KEY = "test-admin-key-1234567890";
const AUTH = { Authorization: `Bearer ${ADMIN_KEY}` };

let app: Elysia;

async function buildApp(): Promise<Elysia> {
  // Reset module cache so each test re-evaluates requireAdminKey() with the
  // current process.env.ADMIN_API_KEY. Same pattern as retention.test.ts.
  vi.resetModules();
  // Re-prime the mock implementations after vi.resetModules() — vi.mock
  // factories are re-evaluated, but our `dbMock`/`hashApiKeyMock` are
  // module-level constants that the new module instances read from.
  selectCalls = [];
  insertCalls = [];
  updateCalls = [];
  dbMock.select.mockClear();
  dbMock.insert.mockClear();
  dbMock.update.mockClear();
  hashApiKeyMock.mockClear();
  const mod = await import("../../src/api/admin-bridge.js");
  app = new Elysia().use(mod.adminBridgeRoutes);
  return app;
}

beforeEach(async () => {
  process.env.ADMIN_API_KEY = ADMIN_KEY;
  await buildApp();
});

afterEach(() => {
  delete process.env.ADMIN_API_KEY;
});

// ── POST /api/admin/projects ───────────────────────────────────────────
describe("POST /api/admin/projects", () => {
  it("creates a new project and returns the apiKey once", async () => {
    // No existing project for this tenantId
    selectCalls = [[]];
    const createdRow = {
      id: "proj-uuid-1",
      name: "Acme",
      slug: "acme",
      keyPrefix: "ho_abcd12",
      tenantId: "tenant-X",
      apiRole: "admin",
      customDomain: null,
      logoUrl: null,
      description: null,
      autoResolveOnDeploy: false,
      createdAt: new Date(),
    };
    insertCalls = [{ result: [createdRow], args: undefined }];

    const res = await app.handle(
      new Request("http://localhost/api/admin/projects", {
        method: "POST",
        headers: { ...AUTH, "content-type": "application/json" },
        body: JSON.stringify({ name: "Acme", tenantId: "tenant-X" }),
      }),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.project.id).toBe("proj-uuid-1");
    expect(body.project.tenantId).toBe("tenant-X");
    expect(body.apiKey).toMatch(/^ho_/);
    expect(body.rotated).toBe(false);
    expect(hashApiKeyMock).toHaveBeenCalledTimes(1);
  });

  it("is idempotent: existing tenant → rotates key, returns rotated=true", async () => {
    const existing = {
      id: "proj-uuid-1",
      name: "Acme",
      slug: "acme",
      keyPrefix: "ho_oldpre",
      tenantId: "tenant-X",
      apiRole: "admin",
      customDomain: null,
      logoUrl: null,
      description: null,
      autoResolveOnDeploy: false,
      createdAt: new Date(),
    };
    // After rotation the new prefix is derived from the freshly-minted key
    // (see hashApiKeyMock), so we don't hardcode it here — just assert it
    // changed from the original.
    selectCalls = [[existing]];
    updateCalls = [{ result: [], args: undefined }];

    const res = await app.handle(
      new Request("http://localhost/api/admin/projects", {
        method: "POST",
        headers: { ...AUTH, "content-type": "application/json" },
        body: JSON.stringify({ name: "Acme", tenantId: "tenant-X" }),
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rotated).toBe(true);
    expect(body.apiKey).toMatch(/^ho_/);
    expect(body.apiKey.slice(0, 8)).not.toBe("ho_oldpre");
  });

  it("rejects request without admin auth (401)", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/admin/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Acme" }),
      }),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/admin API key/i);
  });

  it("rejects with wrong admin key (401)", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/admin/projects", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer wrong-key-1234567890",
        },
        body: JSON.stringify({ name: "Acme" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("rejects when ADMIN_API_KEY is unset (403, fail closed)", async () => {
    delete process.env.ADMIN_API_KEY;
    vi.resetModules();
    const mod = await import("../../src/api/admin-bridge.js");
    const freshApp = new Elysia().use(mod.adminBridgeRoutes);

    const res = await freshApp.handle(
      new Request("http://localhost/api/admin/projects", {
        method: "POST",
        headers: { ...AUTH, "content-type": "application/json" },
        body: JSON.stringify({ name: "Acme" }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("validates name is required (Elysia 422)", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/admin/projects", {
        method: "POST",
        headers: { ...AUTH, "content-type": "application/json" },
        body: JSON.stringify({ tenantId: "tenant-X" }),
      }),
    );
    expect(res.status).toBe(422);
  });
});

// ── GET /api/admin/projects ────────────────────────────────────────────
describe("GET /api/admin/projects", () => {
  it("lists all projects (without apiKeyHash)", async () => {
    const rows = [
      {
        id: "p1",
        name: "A",
        slug: "a",
        keyPrefix: "ho_pre1",
        tenantId: "t1",
        apiRole: "admin",
        customDomain: null,
        logoUrl: null,
        description: null,
        autoResolveOnDeploy: false,
        createdAt: new Date(),
      },
      {
        id: "p2",
        name: "B",
        slug: "b",
        keyPrefix: null,
        tenantId: null,
        apiRole: "readonly",
        customDomain: null,
        logoUrl: null,
        description: null,
        autoResolveOnDeploy: false,
        createdAt: new Date(),
      },
    ];
    selectCalls = [rows];

    const res = await app.handle(
      new Request("http://localhost/api/admin/projects", { headers: AUTH }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.projects).toHaveLength(2);
    // Public projection must not include apiKeyHash / apiKey plaintext
    for (const p of body.projects) {
      expect(p).not.toHaveProperty("apiKeyHash");
      expect(p).not.toHaveProperty("apiKey");
    }
    // keyPrefix is masked into apiKeyPreview
    expect(body.projects[0].apiKeyPreview).toBe("ho_pre1...");
    expect(body.projects[1].apiKeyPreview).toBeNull();
  });

  it("rejects without admin auth (401)", async () => {
    const res = await app.handle(new Request("http://localhost/api/admin/projects"));
    expect(res.status).toBe(401);
  });
});

// ── POST /api/admin/projects/:id/rotate-key ────────────────────────────
describe("POST /api/admin/projects/:id/rotate-key", () => {
  const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

  it("rotates the key and returns new plaintext once", async () => {
    const updatedRow = {
      id: VALID_UUID,
      name: "Acme",
      slug: "acme",
      keyPrefix: "ho_rotat",
      tenantId: "tenant-X",
      apiRole: "admin",
      customDomain: null,
      logoUrl: null,
      description: null,
      autoResolveOnDeploy: false,
      createdAt: new Date(),
    };
    updateCalls = [{ result: [updatedRow], args: undefined }];

    const res = await app.handle(
      new Request(`http://localhost/api/admin/projects/${VALID_UUID}/rotate-key`, {
        method: "POST",
        headers: AUTH,
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.project.id).toBe(VALID_UUID);
    expect(body.apiKey).toMatch(/^ho_/);
    expect(body.apiKeyPreview).toMatch(/^ho_/);
  });

  it("returns 404 when project not found", async () => {
    updateCalls = [{ result: [], args: undefined }];

    const res = await app.handle(
      new Request(`http://localhost/api/admin/projects/${VALID_UUID}/rotate-key`, {
        method: "POST",
        headers: AUTH,
      }),
    );
    expect(res.status).toBe(404);
  });

  it("rejects non-UUID id with 422 (param validation)", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/admin/projects/not-a-uuid/rotate-key", {
        method: "POST",
        headers: AUTH,
      }),
    );
    expect(res.status).toBe(422);
  });
});

// ── GET /api/admin/tenants/:tenantId ───────────────────────────────────
describe("GET /api/admin/tenants/:tenantId", () => {
  it("resolves a tenant to its project (admin-proxy lookup path)", async () => {
    const project = {
      id: "proj-uuid-1",
      name: "Acme",
      slug: "acme",
      keyPrefix: "ho_abcd12",
      tenantId: "tenant-X",
      apiRole: "admin",
      customDomain: null,
      logoUrl: null,
      description: null,
      autoResolveOnDeploy: false,
      createdAt: new Date(),
    };
    selectCalls = [[project]];

    const res = await app.handle(
      new Request("http://localhost/api/admin/tenants/tenant-X", { headers: AUTH }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tenantId).toBe("tenant-X");
    expect(body.project.id).toBe("proj-uuid-1");
    // Hash / plaintext apiKey must never appear
    expect(body.project).not.toHaveProperty("apiKeyHash");
    expect(body.project).not.toHaveProperty("apiKey");
    expect(body.project.apiKeyPreview).toBe("ho_abcd12...");
  });

  it("returns 404 when tenant is not provisioned", async () => {
    selectCalls = [[]];

    const res = await app.handle(
      new Request("http://localhost/api/admin/tenants/unknown-tenant", {
        headers: AUTH,
      }),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not provisioned/i);
    expect(body.tenantId).toBe("unknown-tenant");
  });

  it("rejects without admin auth (401)", async () => {
    const res = await app.handle(new Request("http://localhost/api/admin/tenants/tenant-X"));
    expect(res.status).toBe(401);
  });
});

// ── Public path exposure ──────────────────────────────────────────────
// Without this fix, the global authGuard would 401 every /api/admin/*
// request because it tries to resolveProjectId() against a project API
// key (not the ADMIN_API_KEY shared secret).
describe("public path classification", () => {
  it("/api/admin is treated as public by the global authGuard (handler-level auth)", async () => {
    const { isPublicPath } = await import("../../src/middleware/auth.js");
    expect(isPublicPath("/api/admin/projects")).toBe(true);
    expect(isPublicPath("/api/admin/tenants/tenant-X")).toBe(true);
    expect(isPublicPath("/api/admin/cleanup")).toBe(true);
  });
});
