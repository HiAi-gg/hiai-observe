import { describe, expect, it } from "vitest";
import { parseSentryEvent, parseSentryEnvelope } from "../../src/ingestion/sentry-parser.js";
import type { SentryEvent } from "../../src/ingestion/sentry-parser.js";

describe("parseSentryEvent", () => {
  it("parses a standard exception event", () => {
    const raw: SentryEvent = {
      event_id: "abc123",
      exception: {
        values: [
          {
            type: "TypeError",
            value: "Cannot read property 'foo' of undefined",
            stacktrace: {
              frames: [
                {
                  filename: "node_modules/foo/bar.js",
                  function: "bar",
                  lineno: 10,
                  in_app: false,
                },
                {
                  filename: "src/app.ts",
                  function: "handleRequest",
                  lineno: 42,
                  colno: 5,
                  in_app: true,
                },
              ],
            },
          },
        ],
      },
      tags: { env: "production", version: "1.0.0" },
      sdk: { name: "sentry.javascript.node", version: "7.0.0" },
      release: "1.0.0",
      environment: "production",
    };

    const result = parseSentryEvent(raw);

    expect(result.eventId).toBe("abc123");
    expect(result.type).toBe("exception");
    expect(result.message).toBe("TypeError: Cannot read property 'foo' of undefined");
    expect(result.exception).not.toBeNull();
    expect(result.exception?.type).toBe("TypeError");
    expect(result.exception?.stacktrace).toHaveLength(2);
    expect(result.exception?.stacktrace[1].inApp).toBe(true);
    expect(result.exception?.stacktrace[1].function).toBe("handleRequest");
    expect(result.tags.env).toBe("production");
    expect(result.sdk?.name).toBe("sentry.javascript.node");
  });

  it("parses a message event (no exception)", () => {
    const raw: SentryEvent = {
      event_id: "msg456",
      message: "User clicked unexpected button",
      level: "warning",
      tags: { page: "checkout" },
    };

    const result = parseSentryEvent(raw);

    expect(result.eventId).toBe("msg456");
    expect(result.type).toBe("message");
    expect(result.message).toBe("User clicked unexpected button");
    expect(result.exception).toBeNull();
    expect(result.tags.page).toBe("checkout");
  });

  it("parses breadcrumbs", () => {
    const raw: SentryEvent = {
      breadcrumbs: {
        values: [
          {
            type: "navigation",
            category: "navigation",
            message: "From /home to /checkout",
            timestamp: 1700000000,
          },
          {
            type: "http",
            category: "fetch",
            message: "GET /api/cart",
            data: { statusCode: 200, method: "GET" },
            timestamp: 1700000001,
          },
        ],
      },
    };

    const result = parseSentryEvent(raw);

    expect(result.breadcrumbs).toHaveLength(2);
    expect(result.breadcrumbs[0].type).toBe("navigation");
    expect(result.breadcrumbs[1].data).toEqual({ statusCode: 200, method: "GET" });
  });

  it("generates event_id if missing", () => {
    const raw: SentryEvent = { message: "test" };
    const result = parseSentryEvent(raw);

    expect(result.eventId).toMatch(/^[0-9a-f]{32}$/);
  });

  it("parses user context", () => {
    const raw: SentryEvent = {
      user: {
        id: "u123",
        email: "test@example.com",
        username: "testuser",
        ip_address: "127.0.0.1",
      },
    };

    const result = parseSentryEvent(raw);

    expect(result.user).toEqual({
      id: "u123",
      email: "test@example.com",
      username: "testuser",
      ipAddress: "127.0.0.1",
    });
  });
});

describe("parseSentryEnvelope", () => {
  it("parses an envelope with one event item", () => {
    const envelopeHeader = JSON.stringify({ event_id: "env123", dsn: "http://key@localhost/1" });
    const itemHeader = JSON.stringify({ type: "event", content_type: "application/json", length: 100 });
    const eventPayload = JSON.stringify({
      event_id: "env123",
      message: "Envelope error",
      exception: {
        values: [{ type: "Error", value: "envelope test" }],
      },
    });

    const body = `${envelopeHeader}\n${itemHeader}\n${eventPayload}`;
    const results = parseSentryEnvelope(body);

    expect(results).toHaveLength(1);
    expect(results[0].eventId).toBe("env123");
    expect(results[0].message).toBe("Envelope error");
  });

  it("parses an envelope with multiple items", () => {
    const envelopeHeader = JSON.stringify({ event_id: "multi1" });
    const item1Header = JSON.stringify({ type: "event" });
    const item1Payload = JSON.stringify({ event_id: "e1", message: "first" });
    const item2Header = JSON.stringify({ type: "event" });
    const item2Payload = JSON.stringify({ event_id: "e2", message: "second" });

    const body = [envelopeHeader, item1Header, item1Payload, item2Header, item2Payload].join("\n");
    const results = parseSentryEnvelope(body);

    expect(results).toHaveLength(2);
    expect(results[0].eventId).toBe("e1");
    expect(results[1].eventId).toBe("e2");
  });

  it("ignores non-event item types", () => {
    const envelopeHeader = JSON.stringify({ event_id: "skip1" });
    const itemHeader = JSON.stringify({ type: "session" });
    const itemPayload = JSON.stringify({ sid: "abc" });

    const body = `${envelopeHeader}\n${itemHeader}\n${itemPayload}`;
    const results = parseSentryEnvelope(body);

    expect(results).toHaveLength(0);
  });
});
