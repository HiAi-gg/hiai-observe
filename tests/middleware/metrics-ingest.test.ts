import { describe, expect, it } from "vitest";
import {
  recordOtlpAccepted,
  recordRetentionDeleted,
  resetOperationalCountersForTests,
} from "../../src/middleware/metrics.js";

describe("operational ingest/retention counters", () => {
  it("exposes OTLP accepted and retention deleted counters on /metrics", async () => {
    resetOperationalCountersForTests();
    recordOtlpAccepted("logs", 3);
    recordOtlpAccepted("traces", 2);
    recordOtlpAccepted("metrics", 1);
    recordRetentionDeleted(9);

    const { metricsPlugin } = await import("../../src/middleware/metrics.js");
    const res = await metricsPlugin.handle(new Request("http://localhost/metrics"));
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toMatch(/hiai_observe_otlp_accepted_total\{signal="logs"\} 3/);
    expect(body).toMatch(/hiai_observe_otlp_accepted_total\{signal="traces"\} 2/);
    expect(body).toMatch(/hiai_observe_otlp_accepted_total\{signal="metrics"\} 1/);
    expect(body).toMatch(/hiai_observe_retention_deleted_total 9/);
  });
});
