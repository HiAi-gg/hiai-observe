import { describe, expect, it } from "vitest";
import { parseOTLPLogs } from "../../src/ingestion/otlp-parser.js";

const PROJECT = "550e8400-e29b-41d4-a716-446655440000";

describe("parseOTLPLogs — log vs trace correlation", () => {
  it("copies OTLP log record traceId/spanId onto first-class fields", () => {
    const rows = parseOTLPLogs(
      [
        {
          resource: {
            attributes: [{ key: "service.name", value: { stringValue: "api" } }],
          },
          scopeLogs: [
            {
              logRecords: [
                {
                  timeUnixNano: "1700000000000000000",
                  severityText: "INFO",
                  body: { stringValue: "handled request" },
                  traceId: "abc123def456abc123def456abc123de",
                  spanId: "0011223344556677",
                },
              ],
            },
          ],
        },
      ],
      PROJECT,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.traceId).toBe("abc123def456abc123def456abc123de");
    expect(rows[0]?.spanId).toBe("0011223344556677");
    expect(rows[0]?.stream).toBe("otel");
    expect(rows[0]?.projectId).toBe(PROJECT);
    const raw = rows[0]?.raw as { traceId?: string; spanId?: string };
    expect(raw.traceId).toBe("abc123def456abc123def456abc123de");
    expect(raw.spanId).toBe("0011223344556677");
  });

  it("leaves correlation ids unset when the log record has none", () => {
    const rows = parseOTLPLogs(
      [
        {
          scopeLogs: [
            {
              logRecords: [
                {
                  timeUnixNano: "1700000000000000000",
                  body: { stringValue: "no trace" },
                },
              ],
            },
          ],
        },
      ],
      PROJECT,
    );

    expect(rows[0]?.traceId).toBeUndefined();
    expect(rows[0]?.spanId).toBeUndefined();
  });
});
