import { describe, expect, it } from "vitest";
import { resolveConnectionString } from "../../src/store/connection-string.js";

describe("resolveConnectionString", () => {
  it("uses DATABASE_URL when set", () => {
    expect(
      resolveConnectionString({
        databaseUrl: "postgresql://observe_test:x@127.0.0.1:5432/hiai_observe_test",
        nodeEnv: "test",
      }),
    ).toBe("postgresql://observe_test:x@127.0.0.1:5432/hiai_observe_test");
  });

  it("refuses the shared default URL in test when DATABASE_URL is missing", () => {
    const url = resolveConnectionString({ nodeEnv: "test" });
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/hiai_observe_test");
    expect(parsed.pathname).not.toBe("/hiai_observe");
    expect(parsed.hostname).toBe("127.0.0.1");
    expect(parsed.port).toBe("1");
    expect(url).not.toContain("app_hiai_observe");
  });

  it("throws in production when DATABASE_URL is missing", () => {
    expect(() => resolveConnectionString({ nodeEnv: "production" })).toThrow(
      /DATABASE_URL is required in production/,
    );
  });

  it("falls back to local-dev only outside test/production", () => {
    expect(resolveConnectionString({ nodeEnv: "development" })).toBe(
      "postgresql://observe:observe@localhost:5432/hiai_observe",
    );
  });
});
