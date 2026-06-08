import { describe, it, expect, vi } from "vitest";
import { TokenBucket } from "../../src/monitoring/log-streamer.js";
import { logger } from "../../src/lib/logger.js";

vi.mock("../../src/lib/logger.js", () => ({
  logger: {
    warn: vi.fn(),
  },
}));

describe("TokenBucket", () => {
  it("allows requests within capacity", () => {
    const bucket = new TokenBucket(10, 10);
    
    for (let i = 0; i < 10; i++) {
      expect(bucket.consume()).toBe(true);
    }
  });

  it("rejects requests when capacity is exhausted", () => {
    const bucket = new TokenBucket(5, 5);
    
    for (let i = 0; i < 5; i++) {
      bucket.consume();
    }
    
    expect(bucket.consume()).toBe(false);
  });

  it("refills tokens over time", async () => {
    const bucket = new TokenBucket(2, 2);
    
    bucket.consume();
    bucket.consume();
    expect(bucket.consume()).toBe(false);
    
    await new Promise((r) => setTimeout(r, 600));
    
    expect(bucket.consume()).toBe(true);
  });

  it("logs dropped messages once per minute", () => {
    const bucket = new TokenBucket(1, 1);
    
    bucket.consume();
    bucket.consume();
    bucket.consume();
    
    expect(logger.warn).toHaveBeenCalledWith(
      "[log-streamer] Rate limit exceeded, dropping logs",
      { dropped: expect.any(Number) }
    );
  });

  it("resets to full capacity", () => {
    const bucket = new TokenBucket(5, 5);
    
    for (let i = 0; i < 5; i++) {
      bucket.consume();
    }
    expect(bucket.consume()).toBe(false);
    
    bucket.reset();
    
    for (let i = 0; i < 5; i++) {
      expect(bucket.consume()).toBe(true);
    }
  });

  it("accurately tracks token consumption rate", () => {
    const bucket = new TokenBucket(100, 100);
    
    let consumed = 0;
    while (bucket.consume()) {
      consumed++;
    }
    
    expect(consumed).toBe(100);
  });

  it("handles zero capacity gracefully", () => {
    const bucket = new TokenBucket(0, 0);
    expect(bucket.consume()).toBe(false);
  });
});
