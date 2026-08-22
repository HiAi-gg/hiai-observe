import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/store/db.js", () => ({
  db: {
    select: vi.fn(() => {
      const chain: Record<string, unknown> = {};
      for (const m of ["from", "where", "orderBy", "limit", "innerJoin", "leftJoin"]) {
        chain[m] = vi.fn(() => chain);
      }
      chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve([]).then(resolve);
      return chain;
    }),
  },
}));

const { searchRoutes } = await import("../../src/api/search.js");

describe("GET /api/search", () => {
  it("returns empty collections for a short query", async () => {
    const res = await searchRoutes.handle(new Request("http://localhost/api/search?q=a"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.issues).toEqual([]);
    expect(body.events).toEqual([]);
    expect(body.traces).toEqual([]);
  });
});
