import { describe, expect, it, vi } from "vitest";

const PROJECT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const PROJECT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const getSession = vi.fn();
const where = vi.fn();

vi.mock("../../src/lib/better-auth.js", () => ({
  staffAuth: { api: { getSession } },
}));

vi.mock("../../src/store/db.js", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where,
      })),
    })),
  },
}));

const { isStaffSessionReadablePath, resolveStaffSessionScope } = await import(
  "../../src/lib/staff-session-scope.js"
);

function request(projectId?: string, path = "/api/projects"): Request {
  const query = projectId ? `?projectId=${projectId}` : "";
  return new Request(`https://observe.test${path}${query}`, {
    headers: { cookie: "better-auth.session_token=opaque" },
  });
}

describe("resolveStaffSessionScope", () => {
  it("denies an anonymous request", async () => {
    getSession.mockResolvedValueOnce(null);

    await expect(resolveStaffSessionScope(request(undefined, "/api/traces"))).resolves.toEqual({
      kind: "anonymous",
    });
  });

  it("denies a verified session without a membership", async () => {
    getSession.mockResolvedValueOnce({
      user: { id: "user-1", email: "operator@example.com", emailVerified: true },
      session: { expiresAt: new Date(Date.now() + 60_000) },
    });
    where.mockResolvedValueOnce([]);

    await expect(resolveStaffSessionScope(request())).resolves.toEqual({
      kind: "denied",
    });
  });

  it("does not grant access from a verified email without an explicit user binding", async () => {
    getSession.mockResolvedValueOnce({
      user: { id: "user-1", email: "operator@example.com", emailVerified: true },
      session: { expiresAt: new Date(Date.now() + 60_000) },
    });
    where.mockResolvedValueOnce([{ projectId: PROJECT_A, staffUserId: null }]);

    await expect(resolveStaffSessionScope(request())).resolves.toEqual({
      kind: "denied",
    });
  });

  it("requires an explicit project for multiple memberships", async () => {
    getSession.mockResolvedValueOnce({
      user: { id: "user-1", email: "operator@example.com", emailVerified: true },
      session: { expiresAt: new Date(Date.now() + 60_000) },
    });
    where.mockResolvedValueOnce([
      { projectId: PROJECT_A, staffUserId: "user-1" },
      { projectId: PROJECT_B, staffUserId: "user-1" },
    ]);

    await expect(resolveStaffSessionScope(request(undefined, "/api/traces"))).resolves.toEqual({
      kind: "forbidden",
      reason: "project_required",
    });
    getSession.mockResolvedValueOnce({
      user: { id: "user-1", email: "operator@example.com", emailVerified: true },
      session: { expiresAt: new Date(Date.now() + 60_000) },
    });
    where.mockResolvedValueOnce([
      { projectId: PROJECT_A, staffUserId: "user-1" },
      { projectId: PROJECT_B, staffUserId: "user-1" },
    ]);
    await expect(resolveStaffSessionScope(request(PROJECT_B))).resolves.toEqual({
      kind: "allowed",
      projectId: PROJECT_B,
      projectIds: [PROJECT_A, PROJECT_B],
    });
  });

  it("returns the allowlisted project set for the projects bootstrap list", async () => {
    getSession.mockResolvedValueOnce({
      user: { id: "user-1", email: "operator@example.com", emailVerified: true },
      session: { expiresAt: new Date(Date.now() + 60_000) },
    });
    where.mockResolvedValueOnce([
      { projectId: PROJECT_A, staffUserId: "user-1" },
      { projectId: PROJECT_B, staffUserId: "user-1" },
    ]);

    const listRequest = new Request("https://observe.test/api/projects", {
      headers: { cookie: "better-auth.session_token=opaque" },
    });
    await expect(resolveStaffSessionScope(listRequest)).resolves.toEqual({
      kind: "allowed",
      projectIds: [PROJECT_A, PROJECT_B],
    });
  });

  it("rejects an expired session and an unverified account", async () => {
    getSession.mockResolvedValueOnce({
      user: { id: "user-1", email: "operator@example.com", emailVerified: true },
      session: { expiresAt: new Date(Date.now() - 1) },
    });
    await expect(resolveStaffSessionScope(request())).resolves.toEqual({ kind: "anonymous" });

    getSession.mockResolvedValueOnce({
      user: { id: "user-1", email: "operator@example.com", emailVerified: false },
      session: { expiresAt: new Date(Date.now() + 60_000) },
    });
    where.mockResolvedValueOnce([{ projectId: PROJECT_A, staffUserId: null }]);
    await expect(resolveStaffSessionScope(request())).resolves.toEqual({ kind: "denied" });
  });

  it("uses an immutable user binding even when the account email is unverified", async () => {
    getSession.mockResolvedValueOnce({
      user: { id: "user-1", email: "new-address@example.com", emailVerified: false },
      session: { expiresAt: new Date(Date.now() + 60_000) },
    });
    where.mockResolvedValueOnce([{ projectId: PROJECT_A, staffUserId: "user-1" }]);

    await expect(resolveStaffSessionScope(request())).resolves.toEqual({
      kind: "allowed",
      projectId: PROJECT_A,
      projectIds: [PROJECT_A],
    });
  });

  it("never trusts an email supplied in the request", async () => {
    getSession.mockResolvedValueOnce({
      user: { id: "user-1", email: "verified@example.com", emailVerified: true },
      session: { expiresAt: new Date(Date.now() + 60_000) },
    });
    where.mockResolvedValueOnce([{ projectId: PROJECT_A, staffUserId: null }]);

    const spoofed = new Request(
      `https://observe.test/api/projects?projectId=${PROJECT_A}&email=operator@example.com`,
      { headers: { cookie: "better-auth.session_token=opaque" } },
    );
    await expect(resolveStaffSessionScope(spoofed)).resolves.toEqual({
      kind: "denied",
    });
    expect(where).toHaveBeenCalled();
  });
});

describe("isStaffSessionReadablePath", () => {
  it.each(["/api/infrastructure/host", "/api/infrastructure/containers", "/api/alerts/channels"])(
    "rejects unscoped GET %s",
    (path) => expect(isStaffSessionReadablePath(path)).toBe(false),
  );

  it.each(["/api/dashboard", "/api/traces/trace-1", "/api/projects/", "/api/logs/volume"])(
    "allows project-scoped GET %s",
    (path) => expect(isStaffSessionReadablePath(path)).toBe(true),
  );
});
