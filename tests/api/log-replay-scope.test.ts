import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/store/redis.js", () => ({
  redis: {
    lrange: async () => [
      JSON.stringify({ projectId: "project-a", message: "A" }),
      JSON.stringify({ projectId: "project-b", message: "B" }),
      JSON.stringify({ message: "host" }),
      "invalid-json",
    ],
  },
}));

import { getRecentLogs } from "../../src/store/log-pubsub.js";

describe("recent log replay isolation", () => {
  it("returns only the authenticated project's buffered logs", async () => {
    const rows = await getRecentLogs("shared-container", 100, { projectId: "project-a" });
    expect(rows.map((row) => row.message)).toEqual(["A"]);
  });

  it("does not expose buffered logs without an explicit scope", async () => {
    expect(await getRecentLogs("shared-container", 100)).toEqual([]);
  });

  it("retains explicitly authorized global replay", async () => {
    const rows = await getRecentLogs("shared-container", 100, { admin: true });
    expect(rows.map((row) => row.message)).toEqual(["A", "B", "host"]);
  });

  it("honors selected project even with admin permission", async () => {
    const rows = await getRecentLogs("shared-container", 100, {
      projectId: "project-b",
      admin: true,
    });
    expect(rows.map((row) => row.message)).toEqual(["B"]);
  });
});
