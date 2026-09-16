import { describe, expect, it } from "vitest";
import { resolveStaffTrustedOrigins } from "../../src/lib/staff-trusted-origins.js";

describe("resolveStaffTrustedOrigins", () => {
  it("keeps production to BETTER_AUTH_URL plus extras", () => {
    expect(
      resolveStaffTrustedOrigins({
        betterAuthUrl: "https://infra-01.example:8449",
        extra: "https://observe.example",
        nodeEnv: "production",
      }),
    ).toEqual(["https://infra-01.example:8449", "https://observe.example"]);
  });

  it("allows LAN Vite :5197 outside production so staff sign-in is not Invalid origin", () => {
    const origins = resolveStaffTrustedOrigins({
      betterAuthUrl: "http://127.0.0.1:8001",
      nodeEnv: "development",
    });
    expect(origins).toContain("http://127.0.0.1:8001");
    expect(origins).toContain("http://127.0.0.1:5197");
    expect(origins).toContain("http://localhost:5197");
  });

  it("does not duplicate an extra that already lists the LAN Vite origin", () => {
    const origins = resolveStaffTrustedOrigins({
      betterAuthUrl: "http://127.0.0.1:8001",
      extra: "http://127.0.0.1:5197",
      nodeEnv: "test",
    });
    expect(origins.filter((o) => o === "http://127.0.0.1:5197")).toHaveLength(1);
  });
});
