import { beforeEach, describe, expect, it, vi } from "vitest";

const values = vi.fn().mockResolvedValue(undefined);
const insert = vi.fn(() => ({ values }));

vi.mock("../../src/store/db.js", () => ({
  db: { insert },
}));

const { insertLogs } = await import("../../src/store/logs.js");

describe("insertLogs redaction", () => {
  beforeEach(() => {
    values.mockClear();
    insert.mockClear();
  });

  it("redacts secrets in message and raw before insert", async () => {
    await insertLogs([
      {
        projectId: "550e8400-e29b-41d4-a716-446655440000",
        containerId: "otlp",
        containerName: "api",
        stream: "otel",
        message: "auth Authorization: Bearer ho_deadbeefcafebabe",
        timestamp: new Date("2026-09-14T00:00:00.000Z"),
        raw: { body: "password=hunter2" },
      },
    ]);

    expect(insert).toHaveBeenCalled();
    expect(values).toHaveBeenCalledTimes(1);
    const rows = values.mock.calls[0]?.[0] as Array<{ message: string; raw: { body: string } }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.message).toContain("[redacted]");
    expect(rows[0]?.message).not.toContain("ho_deadbeefcafebabe");
    expect(rows[0]?.raw.body).toContain("[redacted]");
    expect(rows[0]?.raw.body).not.toContain("hunter2");
  });
});
