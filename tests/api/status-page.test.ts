import { describe, expect, it, vi } from "vitest";

function makeChain(result: unknown): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "where", "limit"]) {
    chain[m] = vi.fn(() => chain);
  }
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return chain;
}

vi.mock("../../src/store/db.js", () => ({
  db: { select: vi.fn(() => makeChain([])) },
}));
vi.mock("../../src/store/uptime.js", () => ({
  getMonitors: vi.fn(async () => []),
  getUptimePercentages: vi.fn(async () => new Map()),
  getChecks: vi.fn(async () => ({ checks: [] })),
}));

const { statusPagePlugin } = await import("../../src/api/status-page.js");

describe("GET /api/status/:slug", () => {
  it("returns 404 for an unknown slug", async () => {
    const res = await statusPagePlugin.handle(new Request("http://localhost/api/status/missing"));
    expect(res.status).toBe(404);
  });
});
