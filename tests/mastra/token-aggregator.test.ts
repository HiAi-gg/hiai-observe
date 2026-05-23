import { describe, it, expect } from "vitest";
import { estimateCost } from "../../src/mastra/token-aggregator.js";

describe("estimateCost", () => {
  it("calculates cost for known GPT-4 model", () => {
    // GPT-4: $30/1M prompt, $60/1M completion
    const cost = estimateCost("gpt-4", 1000000, 1000000);
    expect(cost).toBeCloseTo(90.0, 2); // $30 + $60
  });

  it("calculates cost for GPT-4o", () => {
    // GPT-4o: $5/1M prompt, $15/1M completion
    const cost = estimateCost("gpt-4o", 1000000, 1000000);
    expect(cost).toBeCloseTo(20.0, 2);
  });

  it("calculates cost for Claude 3.5 Sonnet", () => {
    // Claude 3.5 Sonnet: $3/1M prompt, $15/1M completion
    const cost = estimateCost("claude-3.5-sonnet", 1000000, 500000);
    expect(cost).toBeCloseTo(10.5, 2); // $3 + $7.50
  });

  it("calculates cost for Gemini 1.5 Flash", () => {
    // Gemini 1.5 Flash: $0.075/1M prompt, $0.3/1M completion
    const cost = estimateCost("gemini-1.5-flash", 2000000, 1000000);
    expect(cost).toBeCloseTo(0.45, 3); // $0.15 + $0.30
  });

  it("strips provider prefix before matching", () => {
    // "openai/gpt-4o" should match "gpt-4o"
    const cost = estimateCost("openai/gpt-4o", 1000000, 1000000);
    expect(cost).toBeCloseTo(20.0, 2);
  });

  it("uses fallback pricing for unknown models", () => {
    // Fallback: $1/1M prompt, $3/1M completion
    const cost = estimateCost("some-custom-model", 1000000, 1000000);
    expect(cost).toBeCloseTo(4.0, 2);
  });

  it("returns 0 for zero tokens", () => {
    const cost = estimateCost("gpt-4o", 0, 0);
    expect(cost).toBe(0);
  });

  it("calculates fractional token costs correctly", () => {
    // 1000 tokens of GPT-4o prompt: $5/1M * 1000 = $0.005
    const cost = estimateCost("gpt-4o", 1000, 0);
    expect(cost).toBeCloseTo(0.005, 5);
  });

  it("handles case-insensitive model names", () => {
    const cost = estimateCost("GPT-4O", 1000000, 1000000);
    expect(cost).toBeCloseTo(20.0, 2);
  });

  it("handles model names with slashes (provider/model)", () => {
    const cost = estimateCost("anthropic/claude-3-opus", 1000000, 1000000);
    // Claude 3 Opus: $15/1M prompt, $75/1M completion
    expect(cost).toBeCloseTo(90.0, 2);
  });
});
