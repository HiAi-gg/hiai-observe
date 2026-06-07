/**
 * MODEL_PRICING env override for estimateCost().
 * Loaded via dynamic import after stubbing the env so the module-level pricing
 * map picks up the override.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("MODEL_PRICING env override", () => {
  it("applies custom prices over the defaults", async () => {
    vi.stubEnv("MODEL_PRICING", JSON.stringify({ "my-llm": { prompt: 2, completion: 6 } }));
    const { estimateCost } = await import("../../src/mastra/token-aggregator.js");
    // 1M prompt * $2 + 1M completion * $6 = $8
    expect(estimateCost("my-llm", 1_000_000, 1_000_000)).toBeCloseTo(8.0, 2);
  });

  it("overrides a built-in default price", async () => {
    vi.stubEnv("MODEL_PRICING", JSON.stringify({ "gpt-4o": { prompt: 1, completion: 2 } }));
    const { estimateCost } = await import("../../src/mastra/token-aggregator.js");
    expect(estimateCost("gpt-4o", 1_000_000, 1_000_000)).toBeCloseTo(3.0, 2);
  });

  it("ignores malformed MODEL_PRICING and keeps defaults", async () => {
    vi.stubEnv("MODEL_PRICING", "{not valid json");
    const { estimateCost } = await import("../../src/mastra/token-aggregator.js");
    expect(estimateCost("gpt-4o", 1_000_000, 1_000_000)).toBeCloseTo(20.0, 2);
  });
});
