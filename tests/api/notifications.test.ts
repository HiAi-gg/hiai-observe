import { beforeEach, describe, expect, it, vi } from "vitest";

function makeChain(result: unknown): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "where", "limit", "returning", "set", "values"]) {
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
    update: vi.fn(() => makeChain([])),
    delete: vi.fn(() => makeChain([])),
  },
}));

const { notificationsRoutes } = await import("../../src/api/notifications.js");

describe("GET /api/notifications", () => {
  beforeEach(() => {
    queue = [];
  });

  it("returns masked notification configs", async () => {
    queue = [
      [
        {
          id: "n1",
          projectId: "p1",
          channel: "telegram",
          config: { botToken: "1234567890abcdef", chatId: "1" },
          enabled: true,
          createdAt: new Date(),
          updatedAt: null,
        },
      ],
    ];
    const res = await notificationsRoutes.handle(new Request("http://localhost/api/notifications"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.notifications).toHaveLength(1);
    expect(String(body.notifications[0].config.botToken)).not.toBe("1234567890abcdef");
  });
});
