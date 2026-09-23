/**
 * HIAI-OBSERVE-T01: unauthorized / cross-project access is rejected.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const lookupProject = vi.fn();
const resolveApiKey = vi.fn();
const adminKeyFromRequest = vi.fn();

vi.mock("../../src/lib/auth.js", () => ({
  lookupProject: (apiKey: string) => lookupProject(apiKey),
  resolveApiKey: (header?: string) => resolveApiKey(header),
}));

vi.mock("../../src/lib/admin-auth.js", () => ({
  adminKeyFromRequest: (request: Request) => adminKeyFromRequest(request),
}));

const { applyScope } = await import("../../src/lib/project-scope.js");

const A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

beforeEach(() => {
  lookupProject.mockReset();
  resolveApiKey.mockReset();
  adminKeyFromRequest.mockReset();
  adminKeyFromRequest.mockReturnValue({ ok: false, status: 401, error: "no" });
});

describe("applyScope", () => {
  it("rejects a presented key that does not resolve to a project (401)", async () => {
    resolveApiKey.mockReturnValue({ apiKey: "bad-key" });
    lookupProject.mockResolvedValue(null);
    const set: { status?: number | string } = {};

    const result = await applyScope({
      request: new Request("http://localhost/api/issues", {
        headers: { authorization: "Bearer bad-key" },
      }),
      query: {},
      set,
    });

    expect(result).toEqual({ error: "Unauthorized" });
    expect(set.status).toBe(401);
  });

  it("rejects a project key asking for a different project (403)", async () => {
    resolveApiKey.mockReturnValue({ apiKey: "ho_project_a" });
    lookupProject.mockResolvedValue({ projectId: A });
    const set: { status?: number | string } = {};

    const result = await applyScope({
      request: new Request("http://localhost/api/issues?projectId=" + B, {
        headers: { authorization: "Bearer ho_project_a" },
      }),
      query: { projectId: B },
      set,
    });

    expect(result).toEqual({ error: "Forbidden: project mismatch" });
    expect(set.status).toBe(403);
  });

  it("allows a project key when the requested project matches", async () => {
    resolveApiKey.mockReturnValue({ apiKey: "ho_project_a" });
    lookupProject.mockResolvedValue({ projectId: A });
    const set: { status?: number | string } = {};

    const result = await applyScope({
      request: new Request("http://localhost/api/issues?projectId=" + A, {
        headers: { authorization: "Bearer ho_project_a" },
      }),
      query: { projectId: A },
      set,
    });

    expect(result).toEqual({ projectId: A, admin: false });
    expect(set.status).toBeUndefined();
  });
});
