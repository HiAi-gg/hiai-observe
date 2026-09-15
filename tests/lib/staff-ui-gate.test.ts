import { afterEach, describe, expect, it, vi } from "vitest";

async function loadStaffUiGate(staffAuth: unknown) {
  vi.resetModules();
  vi.doMock("../../src/lib/better-auth.js", () => ({ staffAuth }));
  return import("../../src/lib/staff-ui-gate.js");
}

describe("isStaffUiPath", () => {
  it.each(["/", "/issues", "/releases", "/settings", "/logs"])(
    "gates staff page %s",
    async (path) => {
      const { isStaffUiPath } = await loadStaffUiGate(null);
      expect(isStaffUiPath(path)).toBe(true);
    },
  );

  it.each([
    "/login",
    "/login/",
    "/api/health",
    "/api/auth/get-session",
    "/api/dashboard",
    "/status",
    "/status/acme",
    "/embed/dashboard",
    "/v1/traces",
    "/health",
    "/_app/immutable/entry.js",
    "/favicon.ico",
  ])("skips %s", async (path) => {
    const { isStaffUiPath } = await loadStaffUiGate(null);
    expect(isStaffUiPath(path)).toBe(false);
  });
});

describe("gateStaffUi", () => {
  async function loadGate(staffAuth: unknown) {
    const { gateStaffUi } = await loadStaffUiGate(staffAuth);
    return gateStaffUi;
  }

  afterEach(() => {
    vi.resetModules();
  });

  it.each(["GET", "HEAD"])(
    "returns a same-origin relative login redirect when auth is disabled (%s)",
    async (method) => {
      const gateStaffUi = await loadGate(null);
      const response = await gateStaffUi(new Request("http://observe.internal/issues", { method }));

      expect(response?.status).toBe(302);
      expect(response?.headers.get("location")).toBe("/login");
    },
  );

  it.each(["GET", "HEAD"])(
    "returns a relative login redirect for an unauthenticated session (%s)",
    async (method) => {
      const gated = await loadGate({ api: { getSession: vi.fn().mockResolvedValue(null) } });

      const response = await gated(new Request("http://observe.internal/issues", { method }));

      expect(response?.status).toBe(302);
      expect(response?.headers.get("location")).toBe("/login");
    },
  );

  it.each(["/api/health", "/login", "/favicon.ico"])(
    "leaves excluded path %s unchanged",
    async (path) => {
      const gateStaffUi = await loadGate(null);
      expect(await gateStaffUi(new Request(`http://observe.internal${path}`))).toBeUndefined();
    },
  );

  it("leaves authenticated staff requests unchanged", async () => {
    const gated = await loadGate({
      api: { getSession: vi.fn().mockResolvedValue({ user: { id: "staff-1" } }) },
    });

    expect(await gated(new Request("http://observe.internal/issues"))).toBeUndefined();
  });
});
