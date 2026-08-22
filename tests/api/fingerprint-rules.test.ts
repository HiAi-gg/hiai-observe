import { beforeEach, describe, expect, it, vi } from "vitest";

function makeChain(result: unknown): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "where", "orderBy", "limit", "offset"]) {
    chain[m] = vi.fn(() => chain);
  }
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return chain;
}

let queue: unknown[] = [];
vi.mock("../../src/store/db.js", () => ({
  db: { select: vi.fn(() => makeChain(queue.shift() ?? [])) },
}));

const { fingerprintRulesPlugin } = await import("../../src/api/fingerprint-rules.js");

describe("GET /api/fingerprint-rules", () => {
  beforeEach(() => {
    queue = [];
  });

  it("returns total from count query, not page length", async () => {
    const rows = [{ id: "r1", name: "a", projectId: "p1" }];
    queue = [rows, [{ value: 42 }]];
    const res = await fingerprintRulesPlugin.handle(
      new Request("http://localhost/api/fingerprint-rules?limit=1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.total).toBe(42);
  });
});
