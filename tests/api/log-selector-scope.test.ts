import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { Elysia } from "elysia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const PROJECT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const PROJECT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const captured = vi.hoisted(() => ({
  where: [] as Array<SQL | undefined>,
}));

type QueryChain = {
  from: () => QueryChain;
  orderBy: () => QueryChain;
  limit: () => QueryChain;
  offset: () => QueryChain;
  groupBy: () => QueryChain;
  where: (condition: SQL | undefined) => QueryChain;
  returning: () => Promise<unknown[]>;
  then: (
    resolve: (value: unknown[]) => unknown,
    reject?: (error: unknown) => unknown,
  ) => Promise<unknown>;
};

function chain(result: unknown[] = []): QueryChain {
  const value = {} as QueryChain;
  for (const method of ["from", "orderBy", "limit", "offset", "groupBy"]) {
    value[method] = vi.fn(() => value);
  }
  value.where = vi.fn((condition: SQL | undefined) => {
    captured.where.push(condition);
    return value;
  });
  value.returning = vi.fn(async () => result);
  value.then = (resolve: (value: unknown[]) => unknown, reject?: (error: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return value;
}

const dbMock = {
  select: vi.fn(() => chain()),
  delete: vi.fn(() => chain()),
};

vi.mock("../../src/store/db.js", () => ({ db: dbMock }));
vi.mock("../../src/store/redis.js", () => ({ redis: {} }));
vi.mock("../../src/lib/admin-auth.js", () => ({
  adminKeyFromRequest: (request: Request) =>
    request.headers.get("authorization") === "Bearer admin-key"
      ? { ok: true as const }
      : { ok: false as const, status: 401, error: "Missing admin API key" },
}));
vi.mock("../../src/lib/auth.js", () => ({
  resolveApiKey: (header?: string) =>
    header === "Bearer project-key" ? { apiKey: "project-key" } : null,
  lookupProject: async (key: string) => (key === "project-key" ? { projectId: PROJECT_A } : null),
}));
vi.mock("../../src/lib/staff-session-scope.js", () => ({
  resolveStaffSessionScope: async () => ({ kind: "anonymous" }),
}));

const { logsPlugin } = await import("../../src/api/logs.js");
const { authGuard } = await import("../../src/middleware/auth.js");
const app = new Elysia().onBeforeHandle({ as: "global" }, authGuard).use(logsPlugin);

function sqlParams(): unknown[] {
  return captured.where.flatMap((condition) =>
    condition ? new PgDialect().sqlToQuery(condition).params : [],
  );
}

beforeEach(() => {
  captured.where = [];
  dbMock.select.mockClear();
  dbMock.delete.mockClear();
});

describe("log selector schemas", () => {
  it.each(["projectId", "project_id"])(
    "honors an instance-admin %s selector on GET /api/logs/",
    async (selector) => {
      const response = await app.handle(
        new Request(`http://localhost/api/logs/?${selector}=${PROJECT_A}`, {
          headers: { authorization: "Bearer admin-key" },
        }),
      );

      expect(response.status).toBe(200);
      expect(sqlParams()).toContain(PROJECT_A);
    },
  );

  it.each(["projectId", "project_id"])(
    "rejects a foreign %s selector on DELETE /api/logs/",
    async (selector) => {
      const response = await app.handle(
        new Request(`http://localhost/api/logs/?${selector}=${PROJECT_B}&confirm=true`, {
          method: "DELETE",
          headers: { authorization: "Bearer project-key" },
        }),
      );

      expect(response.status).toBe(403);
      expect(dbMock.delete).not.toHaveBeenCalled();
    },
  );

  it.each(["projectId", "project_id"])(
    "rejects a foreign %s selector on the authenticated log stream",
    async (selector) => {
      const response = await app.handle(
        new Request(`http://localhost/api/logs/stream?${selector}=${PROJECT_B}`, {
          headers: { authorization: "Bearer project-key" },
        }),
      );

      expect(response.status).toBe(403);
    },
  );
});
