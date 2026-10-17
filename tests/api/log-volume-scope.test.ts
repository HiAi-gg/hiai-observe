import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
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

import { getLogVolume } from "../../src/store/logs.js";

describe("log volume project isolation", () => {
  beforeEach(() => {
    captured.where = undefined;
  });

  it("binds aggregation to the requested authenticated project", async () => {
    await getLogVolume({ projectId: "project-a" });
    const query = new PgDialect().sqlToQuery(captured.where!);
    expect(query.sql).toContain('"logs"."project_id" =');
    expect(query.params).toContain("project-a");
    expect(query.params).not.toContain("project-b");
  });

  it("fails closed when no authorized scope is supplied", async () => {
    await getLogVolume({});
    const query = new PgDialect().sqlToQuery(captured.where!);
    expect(query.sql).toContain("false");
  });

  it("retains explicit instance-admin aggregation", async () => {
    await getLogVolume({ includeHostLogs: true });
    const query = new PgDialect().sqlToQuery(captured.where!);
    expect(query.sql).not.toContain("false");
    expect(query.sql).not.toContain('"project_id"');
  });

  it("does not let host-log permission override a selected project", async () => {
    await getLogVolume({ projectId: "project-a", includeHostLogs: true });
    const query = new PgDialect().sqlToQuery(captured.where!);
    expect(query.sql).toContain('"logs"."project_id" =');
    expect(query.params).toContain("project-a");
  });
});
