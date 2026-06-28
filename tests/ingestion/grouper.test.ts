import { describe, expect, it } from "vitest";
import { buildFingerprint } from "../../src/ingestion/grouper.js";
import type { ParsedEvent } from "../../src/ingestion/sentry-parser.js";

function makeEvent(overrides: Partial<ParsedEvent> = {}): ParsedEvent {
  return {
    eventId: "test123",
    message: "test error",
    type: "exception",
    exception: {
      type: "TypeError",
      value: "Cannot read property of undefined",
      stacktrace: [
        { filename: "src/utils.ts", function: "processData", lineno: 10, inApp: false },
        { filename: "src/handler.ts", function: "handleRequest", lineno: 42, inApp: true },
      ],
    },
    breadcrumbs: [],
    user: null,
    tags: {},
    sdk: null,
    release: null,
    environment: null,
    rawPayload: {},
    ...overrides,
  };
}

describe("buildFingerprint", () => {
  it("fingerprints by exception type + first in-app frame", () => {
    const event = makeEvent();
    const fp = buildFingerprint(event);

    expect(fp).toBe("TypeError::handleRequest::src/handler.ts");
  });

  it("falls back to first frame if no in-app frame", () => {
    const event = makeEvent({
      exception: {
        type: "Error",
        value: "something",
        stacktrace: [
          { filename: "node_modules/lib/index.js", function: "libFn", lineno: 1, inApp: false },
        ],
      },
    });
    const fp = buildFingerprint(event);

    expect(fp).toBe("Error::libFn::node_modules/lib/index.js");
  });

  it("uses exception type only if no stacktrace", () => {
    const event = makeEvent({
      exception: { type: "RangeError", value: "out of range", stacktrace: [] },
    });
    const fp = buildFingerprint(event);

    expect(fp).toBe("RangeError");
  });

  it("uses message fingerprint for non-exception events", () => {
    const event = makeEvent({
      type: "message",
      exception: null,
      message: "User clicked wrong button",
    });
    const fp = buildFingerprint(event);

    expect(fp).toBe("message::User clicked wrong button");
  });

  it("produces same fingerprint for identical errors", () => {
    const event1 = makeEvent();
    const event2 = makeEvent({ eventId: "different-id" });

    expect(buildFingerprint(event1)).toBe(buildFingerprint(event2));
  });

  it("produces different fingerprint for different exception types", () => {
    const event1 = makeEvent();
    const event2 = makeEvent({
      exception: {
        type: "ReferenceError",
        value: "x is not defined",
        stacktrace: [
          { filename: "src/handler.ts", function: "handleRequest", lineno: 42, inApp: true },
        ],
      },
    });

    expect(buildFingerprint(event1)).not.toBe(buildFingerprint(event2));
  });

  it("produces different fingerprint for different source locations", () => {
    const event1 = makeEvent();
    const event2 = makeEvent({
      exception: {
        type: "TypeError",
        value: "different message",
        stacktrace: [{ filename: "src/other.ts", function: "otherFn", lineno: 99, inApp: true }],
      },
    });

    expect(buildFingerprint(event1)).not.toBe(buildFingerprint(event2));
  });
});
