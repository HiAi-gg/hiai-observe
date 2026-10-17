import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveStaffSessionScope = vi.fn();
const resolveApiKey = vi.fn(() => null);
const lookupProject = vi.fn();
const adminKeyFromRequest = vi.fn(() => ({ ok: false }));

vi.mock("../../src/lib/staff-session-scope.js", () => ({ resolveStaffSessionScope }));
vi.mock("../../src/lib/auth.js", () => ({ resolveApiKey, lookupProject }));
vi.mock("../../src/lib/admin-auth.js", () => ({ adminKeyFromRequest }));

const { applyScope } = await import("../../src/lib/project-scope.js");

const PROJECT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function request(method: string, cookie = "better-auth.session_token=opaque"): Request {
  return new Request("https://observe.test/api/projects", {
    method,
    headers: cookie ? { cookie } : undefined,
  });
}

describe("applyScope staff session bridge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveApiKey.mockReturnValue(null);
    adminKeyFromRequest.mockReturnValue({ ok: false });
    resolveStaffSessionScope.mockResolvedValue({ kind: "anonymous" });
  });

  it("returns a project-bound read scope for a staff session", async () => {
    resolveStaffSessionScope.mockResolvedValue({
      kind: "allowed",
      projectId: PROJECT_A,
      projectIds: [PROJECT_A],
    });
    const set: { status?: number | string } = {};

    await expect(applyScope({ request: request("GET"), set })).resolves.toEqual({
      projectId: PROJECT_A,
      projectIds: [PROJECT_A],
      admin: false,
      session: true,
    });
  });

  it("rejects staff-session writes even when called without the global guard", async () => {
    resolveStaffSessionScope.mockResolvedValue({
      kind: "allowed",
      projectId: PROJECT_A,
      projectIds: [PROJECT_A],
    });
    const set: { status?: number | string } = {};

    await expect(applyScope({ request: request("POST"), set })).resolves.toEqual({
      error: "Forbidden: staff sessions are read-only",
    });
    expect(set.status).toBe(403);
  });

  it("does not turn a failed cookie session into the test-only admin fixture", async () => {
    resolveStaffSessionScope.mockResolvedValue({ kind: "denied" });
    const set: { status?: number | string } = {};

    await expect(applyScope({ request: request("GET"), set })).resolves.toEqual({
      error: "Unauthorized",
    });
    expect(set.status).toBe(401);
  });
});
