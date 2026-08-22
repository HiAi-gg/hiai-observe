import { describe, expect, it } from "vitest";
import {
  assertResourceProject,
  requestedProjectIdFromQuery,
  resolveScope,
  ScopeError,
} from "../../src/lib/project-scope.js";

const A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

describe("resolveScope", () => {
  it("tenant key without query uses authenticated project", () => {
    expect(resolveScope({ authProjectId: A, admin: false })).toEqual({
      projectId: A,
      admin: false,
    });
  });

  it("tenant key with matching query is ok", () => {
    expect(resolveScope({ authProjectId: A, admin: false, requestedProjectId: A })).toEqual({
      projectId: A,
      admin: false,
    });
  });

  it("tenant key with other project is 403", () => {
    try {
      resolveScope({ authProjectId: A, admin: false, requestedProjectId: B });
      expect.fail("expected ScopeError");
    } catch (err) {
      expect(err).toBeInstanceOf(ScopeError);
      expect((err as ScopeError).status).toBe(403);
    }
  });

  it("tenant key without auth project is 401", () => {
    try {
      resolveScope({ authProjectId: undefined, admin: false });
      expect.fail("expected ScopeError");
    } catch (err) {
      expect(err).toBeInstanceOf(ScopeError);
      expect((err as ScopeError).status).toBe(401);
    }
  });

  it("admin without query is unscoped", () => {
    expect(resolveScope({ authProjectId: undefined, admin: true })).toEqual({
      projectId: undefined,
      admin: true,
    });
  });

  it("admin with query is that project only", () => {
    expect(resolveScope({ authProjectId: undefined, admin: true, requestedProjectId: B })).toEqual({
      projectId: B,
      admin: true,
    });
  });
});

describe("assertResourceProject", () => {
  it("allows admin unscoped any row", () => {
    expect(assertResourceProject(A, undefined, true)).toBe(true);
  });

  it("rejects tenant mismatch", () => {
    expect(assertResourceProject(B, A, false)).toBe(false);
  });

  it("allows tenant match", () => {
    expect(assertResourceProject(A, A, false)).toBe(true);
  });
});

describe("requestedProjectIdFromQuery", () => {
  it("reads projectId then project_id", () => {
    expect(requestedProjectIdFromQuery({ projectId: A })).toBe(A);
    expect(requestedProjectIdFromQuery({ project_id: B })).toBe(B);
  });
});
