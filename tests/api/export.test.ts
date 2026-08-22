import { beforeEach, describe, expect, it, vi } from "vitest";

function makeChain(result: unknown): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "where", "orderBy", "limit"]) {
    chain[m] = vi.fn(() => chain);
  }
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return chain;
}

let queue: unknown[] = [];
vi.mock("../../src/store/db.js", () => ({
  db: { select: vi.fn(() => makeChain(queue.shift() ?? [])) },
}));

const { exportRoutes } = await import("../../src/api/export.js");

describe("GET /api/export/issues", () => {
  beforeEach(() => {
    queue = [];
  });

  it("returns JSON rows when scoped in test mode", async () => {
    queue = [
      [
        {
          id: "1",
          title: "boom",
          type: "error",
          status: "unresolved",
          count: 1,
          firstSeen: new Date(),
          lastSeen: new Date(),
          projectId: "p1",
        },
      ],
    ];
    const res = await exportRoutes.handle(new Request("http://localhost/api/export/issues"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data) || Array.isArray(body)).toBe(true);
  });
});
