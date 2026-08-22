import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/store/db.js", () => ({
  db: { select: vi.fn() },
}));
vi.mock("../../src/lib/admin-auth.js", () => ({
  adminKeyFromRequest: vi.fn(() => ({
    ok: false,
    status: 401,
    error: "Missing admin API key",
  })),
}));

const { tenantHealthPlugin } = await import("../../src/api/tenant-health.js");

describe("GET /api/tenant/:tenantId/health", () => {
  it("rejects callers without ADMIN_API_KEY", async () => {
    const res = await tenantHealthPlugin.handle(
      new Request("http://localhost/api/tenant/acme/health"),
    );
    expect(res.status).toBe(401);
  });
});
