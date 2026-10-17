import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { Elysia } from "elysia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({ where: undefined as SQL | undefined }));
vi.mock("../../src/store/db.js", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (condition: SQL) => {
          captured.where = condition;
          return { groupBy: () => ({ orderBy: async () => [] }) };
        },
      }),
    }),
  },
}));
vi.mock("../../src/lib/auth.js", () => ({
  resolveApiKey: (header?: string) => (header === "Bearer key-a" ? { apiKey: "key-a" } : null),
  lookupProject: async (key: string) =>
    key === "key-a" ? { projectId: "project-a", apiRole: "viewer" } : null,
}));
vi.mock("../../src/lib/admin-auth.js", () => ({
  adminKeyFromRequest: () => ({ ok: false }),
}));
vi.mock("../../src/lib/staff-session-scope.js", () => ({
  resolveStaffSessionScope: async () => ({ kind: "anonymous" }),
  isStaffSessionReadablePath: () => false,
}));

import { logsPlugin } from "../../src/api/logs.js";
import { authGuard } from "../../src/middleware/auth.js";

const app = new Elysia().onBeforeHandle({ as: "global" }, authGuard).use(logsPlugin);

describe("log volume HTTP authorization", () => {
  beforeEach(() => {
    captured.where = undefined;
  });

  it("passes authenticated project identity into the actual aggregation query", async () => {
    const response = await app.handle(
      new Request("http://localhost/api/logs/volume", {
        headers: { authorization: "Bearer key-a" },
      }),
    );
    expect(response.status).toBe(200);
    if (!captured.where) throw new Error("aggregation query missing");
    expect(new PgDialect().sqlToQuery(captured.where).params).toContain("project-a");
  });

  it.each(["projectId", "project_id"])(
    "rejects a foreign %s selector before aggregation",
    async (selector) => {
      const response = await app.handle(
        new Request(`http://localhost/api/logs/volume?${selector}=project-b`, {
          headers: { authorization: "Bearer key-a" },
        }),
      );
      expect(response.status).toBe(403);
      expect(captured.where).toBeUndefined();
    },
  );

  it("rejects anonymous aggregate reads", async () => {
    const response = await app.handle(new Request("http://localhost/api/logs/volume"));
    expect(response.status).toBe(401);
    expect(captured.where).toBeUndefined();
  });
});
