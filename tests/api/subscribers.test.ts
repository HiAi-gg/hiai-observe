import { beforeEach, describe, expect, it, vi } from "vitest";

function makeChain(result: unknown): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "where", "limit", "returning", "values"]) {
    chain[m] = vi.fn(() => chain);
  }
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return chain;
}

let queue: unknown[] = [];
const dbMock = {
  select: vi.fn(() => makeChain(queue.shift() ?? [])),
  insert: vi.fn(() => makeChain([])),
};
vi.mock("../../src/store/db.js", () => ({ db: dbMock }));

const { subscribersPlugin } = await import("../../src/api/subscribers.js");

describe("POST /api/subscribers/public", () => {
  beforeEach(() => {
    queue = [];
    dbMock.insert.mockClear();
  });

  it("subscribes by project slug, not UUID", async () => {
    const project = { id: "660e8400-e29b-41d4-a716-446655440001", slug: "acme" };
    queue = [[project], []];
    dbMock.insert.mockReturnValueOnce(makeChain([{ id: "sub-1", projectId: project.id }]));

    const res = await subscribersPlugin.handle(
      new Request("http://localhost/api/subscribers/public", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: "acme", email: "ops@example.com" }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subscribed).toBe(true);
    expect(body.id).toBe("sub-1");
  });

  it("rejects projectId-only bodies", async () => {
    const res = await subscribersPlugin.handle(
      new Request("http://localhost/api/subscribers/public", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: "660e8400-e29b-41d4-a716-446655440001",
          email: "ops@example.com",
        }),
      }),
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
