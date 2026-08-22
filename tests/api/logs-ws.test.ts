import { describe, expect, it } from "vitest";
import { isPublicPath } from "../../src/middleware/auth.js";

describe("logs websocket auth contract", () => {
  it("keeps /ws/logs on the handler-auth public list", () => {
    expect(isPublicPath("/ws/logs")).toBe(true);
  });

  it("does not treat SSE stream as a query-key public path", () => {
    expect(isPublicPath("/api/logs/stream")).toBe(false);
  });
});
