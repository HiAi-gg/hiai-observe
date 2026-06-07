import { describe, it, expect } from "vitest";
import { runGrpcCheck } from "../../src/monitoring/checks/grpc-check.js";

describe("gRPC health check", () => {
  it("reports down for unreachable host", async () => {
    const r = await runGrpcCheck({ host: "127.0.0.1", port: 19999, timeout: 2000, serviceName: "", tls: false });
    expect(r.isUp).toBe(false);
  });

  it("reports error on connection refused", async () => {
    const r = await runGrpcCheck({ host: "127.0.0.1", port: 1, timeout: 2000, serviceName: "", tls: false });
    expect(r.isUp).toBe(false);
    expect(r.error).toBeDefined();
  });

  it("times out correctly", async () => {
    const r = await runGrpcCheck({ host: "10.255.255.1", port: 50051, timeout: 1000, serviceName: "", tls: false });
    expect(r.isUp).toBe(false);
    expect(r.responseTime).toBeLessThanOrEqual(1500);
  });
});
