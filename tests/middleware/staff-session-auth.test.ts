import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveStaffSessionScope = vi.fn();
const isStaffSessionReadablePath = vi.fn(() => true);
const resolveApiKey = vi.fn(() => null);
const lookupProject = vi.fn();
const checkWriteAccess = vi.fn().mockResolvedValue(true);
const adminKeyFromRequest = vi.fn(() => ({ ok: false }));

vi.mock("../../src/lib/staff-session-scope.js", () => ({
  resolveStaffSessionScope,
  isStaffSessionReadablePath,
}));
vi.mock("../../src/lib/auth.js", () => ({ resolveApiKey, lookupProject }));
vi.mock("../../src/lib/rbac.js", () => ({ checkWriteAccess }));
vi.mock("../../src/lib/admin-auth.js", () => ({ adminKeyFromRequest }));

const { authGuard } = await import("../../src/middleware/auth.js");

function req(method: string, projectId?: string): Request {
  const query = projectId ? `?projectId=${projectId}` : "";
  return new Request(`https://observe.test/api/projects${query}`, { method });
}

describe("authGuard staff session bridge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminKeyFromRequest.mockReturnValue({ ok: false });
    resolveApiKey.mockReturnValue(null);
    resolveStaffSessionScope.mockResolvedValue({ kind: "anonymous" });
    isStaffSessionReadablePath.mockReturnValue(true);
    checkWriteAccess.mockResolvedValue(true);
  });

  it("allows a membership-backed staff session to read", async () => {
    resolveStaffSessionScope.mockResolvedValue({
      kind: "allowed",
      projectId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    });
    const set: { status?: number | string } = {};

    await expect(authGuard({ request: req("GET"), set } as never)).resolves.toBeUndefined();
  });

  it("denies writes even for a membership-backed staff session", async () => {
    resolveStaffSessionScope.mockResolvedValue({
      kind: "allowed",
      projectId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    });
    const set: { status?: number | string } = {};

    const response = await authGuard({ request: req("POST"), set } as never);
    expect(response).toBeInstanceOf(Response);
    expect(response?.status).toBe(403);
    expect(set.status).toBe(403);
  });

  it("keeps users without a membership at 401", async () => {
    resolveStaffSessionScope.mockResolvedValue({ kind: "denied" });
    const set: { status?: number | string } = {};

    const response = await authGuard({ request: req("GET"), set } as never);
    expect(response?.status).toBe(401);
    expect(set.status).toBe(401);
  });

  it("keeps a wrong project at 403", async () => {
    resolveStaffSessionScope.mockResolvedValue({ kind: "forbidden", reason: "project_mismatch" });
    const set: { status?: number | string } = {};

    const response = await authGuard({
      request: req("GET", "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"),
      set,
    } as never);
    expect(response?.status).toBe(403);
    expect(set.status).toBe(403);
  });

  it.each([
    "/api/infrastructure/host",
    "/api/infrastructure/containers",
    "/api/infrastructure/hosts",
    "/api/health/details",
  ])("denies a staff session on unscoped GET %s", async (path) => {
    resolveStaffSessionScope.mockResolvedValue({
      kind: "allowed",
      projectId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      projectIds: ["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"],
    });
    isStaffSessionReadablePath.mockReturnValue(false);
    const set: { status?: number | string } = {};

    const response = await authGuard({
      request: new Request(`https://observe.test${path}`),
      set,
    } as never);
    expect(response?.status).toBe(403);
    expect(set.status).toBe(403);
  });

  it("does not consult the session bridge for a valid API key", async () => {
    resolveApiKey.mockReturnValue({ apiKey: "project-key" });
    lookupProject.mockResolvedValue({ projectId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" });
    const set: { status?: number | string } = {};

    await expect(authGuard({ request: req("GET"), set } as never)).resolves.toBeUndefined();
    expect(resolveStaffSessionScope).not.toHaveBeenCalled();
  });

  it("does not consult the session bridge for the instance admin key", async () => {
    adminKeyFromRequest.mockReturnValue({ ok: true });
    const set: { status?: number | string } = {};

    await expect(authGuard({ request: req("POST"), set } as never)).resolves.toBeUndefined();
    expect(resolveStaffSessionScope).not.toHaveBeenCalled();
  });
});
