import { beforeEach, describe, expect, it, vi } from "vitest";

function makeChain(result: unknown): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "where", "limit", "orderBy"]) {
    chain[m] = vi.fn(() => chain);
  }
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return chain;
}

let queue: unknown[] = [];
vi.mock("../../src/store/db.js", () => ({
  db: {
    select: vi.fn(() => makeChain(queue.shift() ?? [])),
  },
}));

const { badgesRoutes } = await import("../../src/api/badges.js");

describe("GET /api/badges/:slug/status", () => {
  beforeEach(() => {
    queue = [];
  });

  it("returns SVG for an unknown slug", async () => {
    queue = [[], []];
    const res = await badgesRoutes.handle(
      new Request("http://localhost/api/badges/missing/status"),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("image/svg+xml");
    const body = await res.text();
    expect(body).toContain("<svg");
    expect(body).not.toContain("<script");
  });
});
