import { beforeEach, describe, expect, it, vi } from "vitest";

function makeChain(result: unknown): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "where", "orderBy", "limit", "returning", "values"]) {
    chain[m] = vi.fn(() => chain);
  }
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return chain;
}

let queue: unknown[] = [];
vi.mock("../../src/store/db.js", () => ({
  db: {
    select: vi.fn(() => makeChain(queue.shift() ?? [])),
    insert: vi.fn(() => makeChain([])),
    delete: vi.fn(() => makeChain([])),
  },
}));

const { savedSearchesPlugin } = await import("../../src/api/saved-searches.js");

describe("GET /api/saved-searches", () => {
  beforeEach(() => {
    queue = [];
  });

  it("returns data array", async () => {
    queue = [[{ id: "s1", name: "errors", query: "status:unresolved" }]];
    const res = await savedSearchesPlugin.handle(
      new Request("http://localhost/api/saved-searches"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe("errors");
  });
});
