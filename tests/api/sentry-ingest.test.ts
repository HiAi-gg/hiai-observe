import { beforeEach, describe, expect, it, vi } from "vitest";

const UUID = "550e8400-e29b-41d4-a716-446655440000";

// ── Mock db ────────────────────────────────────────────────────────────
vi.mock("../../src/store/db.js", () => ({
  db: {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    }),
    transaction: vi.fn().mockImplementation(async (cb: Function) => {
      const tx = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                for: vi.fn().mockResolvedValue([]),
              }),
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: "new-issue-id" }]),
          }),
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
        }),
      };
      return cb(tx);
    }),
  },
}));

// ── Mock schema ───────────────────────────────────────────────────────
vi.mock("../../src/store/schema.js", () => ({
  events: { issueId: "issue_id", projectId: "project_id" },
  issues: { id: "id", projectId: "project_id", fingerprint: "fingerprint" },
}));

// ── Mock auth ─────────────────────────────────────────────────────────
vi.mock("../../src/lib/auth.js", () => ({
  resolveApiKey: vi.fn().mockReturnValue({ apiKey: "test-api-key" }),
  lookupProject: vi.fn().mockResolvedValue({ projectId: "550e8400-e29b-41d4-a716-446655440000" }),
}));

// ── Mock sentry parser ────────────────────────────────────────────────
vi.mock("../../src/ingestion/sentry-parser.js", () => ({
  parseSentryEvent: vi.fn().mockReturnValue({
    eventId: "abc123",
    message: "Test error",
    type: "exception",
    exception: { type: "Error", value: "Test error", stacktrace: [] },
    exceptionChain: [],
    fingerprint: null,
    breadcrumbs: [],
    user: null,
    tags: {},
    sdk: { name: "sentry.javascript.node", version: "8.0.0" },
    release: null,
    environment: "production",
    rawPayload: {},
  }),
  parseSentryEnvelope: vi.fn().mockReturnValue([]),
}));

// ── Mock grouper ──────────────────────────────────────────────────────
vi.mock("../../src/ingestion/grouper.js", () => ({
  groupEvent: vi.fn().mockResolvedValue({ issueId: "existing-issue-id", isNew: false }),
}));

// ── Capture mocked modules ────────────────────────────────────────────
const authModule = await import("../../src/lib/auth.js");
const parserModule = await import("../../src/ingestion/sentry-parser.js");
const grouperModule = await import("../../src/ingestion/grouper.js");

// ── Import plugin AFTER mocks ─────────────────────────────────────────
const { sentryIngestPlugin } = await import("../../src/api/sentry-ingest.js");

const validSentryEvent = {
  event_id: "abc123",
  message: "Test error",
  exception: {
    values: [{ type: "Error", value: "Something broke", stacktrace: { frames: [] } }],
  },
  tags: { environment: "production" },
  sdk: { name: "sentry.javascript.node", version: "8.0.0" },
  environment: "production",
};

describe("sentry ingest endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Restore default behavior
    vi.mocked(authModule.resolveApiKey).mockReturnValue({ apiKey: "test-api-key" });
    vi.mocked(authModule.lookupProject).mockResolvedValue({ projectId: UUID });
    vi.mocked(grouperModule.groupEvent).mockResolvedValue({
      issueId: "existing-issue-id",
      isNew: false,
    });
    vi.mocked(parserModule.parseSentryEvent).mockReturnValue({
      eventId: "abc123",
      message: "Test error",
      type: "exception",
      exception: { type: "Error", value: "Test error", stacktrace: [] },
      exceptionChain: [],
      fingerprint: null,
      breadcrumbs: [],
      user: null,
      tags: {},
      sdk: { name: "sentry.javascript.node", version: "8.0.0" },
      release: null,
      environment: "production",
      rawPayload: {},
    });
  });

  it("valid event returns 200 with event id", async () => {
    const res = await sentryIngestPlugin.handle(
      new Request(`http://localhost/api/${UUID}/store`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-api-key",
        },
        body: JSON.stringify(validSentryEvent),
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("abc123");
  });

  it("missing auth returns 401", async () => {
    vi.mocked(authModule.resolveApiKey).mockReturnValue(null);

    const res = await sentryIngestPlugin.handle(
      new Request(`http://localhost/api/${UUID}/store`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validSentryEvent),
      }),
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Invalid API key");
  });

  it("invalid auth returns 401", async () => {
    vi.mocked(authModule.resolveApiKey).mockReturnValue({ apiKey: "wrong-key" });
    vi.mocked(authModule.lookupProject).mockResolvedValue(null);

    const res = await sentryIngestPlugin.handle(
      new Request(`http://localhost/api/${UUID}/store`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer wrong-key",
        },
        body: JSON.stringify(validSentryEvent),
      }),
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Invalid API key");
  });

  it("URL param mismatch uses API key project (not URL param)", async () => {
    const apiKeyProjectId = "api-key-project-id";
    vi.mocked(authModule.lookupProject).mockResolvedValue({ projectId: apiKeyProjectId });

    const res = await sentryIngestPlugin.handle(
      new Request(`http://localhost/api/${UUID}/store`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-api-key",
        },
        body: JSON.stringify(validSentryEvent),
      }),
    );

    // URL projectId (UUID) does not match the API key's project (api-key-project-id).
    // For security we reject with 403 rather than silently using the API key's project.
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Project mismatch");
  });

  it("body too large returns 413", async () => {
    const largePayload = { message: "x".repeat(6 * 1024 * 1024) };

    const res = await sentryIngestPlugin.handle(
      new Request(`http://localhost/api/${UUID}/store`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-api-key",
        },
        body: JSON.stringify(largePayload),
      }),
    );

    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error).toBe("Payload too large");
  });

  it("empty body returns 400", async () => {
    const res = await sentryIngestPlugin.handle(
      new Request(`http://localhost/api/${UUID}/store`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-api-key",
        },
        body: JSON.stringify({}),
      }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid event body");
  });

  it("message event (not exception) stored correctly", async () => {
    vi.mocked(parserModule.parseSentryEvent).mockReturnValue({
      eventId: "msg-001",
      message: "User clicked button",
      type: "message",
      exception: null,
      exceptionChain: [],
      fingerprint: null,
      breadcrumbs: [],
      user: null,
      tags: { action: "click" },
      sdk: null,
      release: "1.0.0",
      environment: "staging",
      rawPayload: {},
    });

    const messageEvent = { message: "User clicked button", tags: { action: "click" } };
    const res = await sentryIngestPlugin.handle(
      new Request(`http://localhost/api/${UUID}/store`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-api-key",
        },
        body: JSON.stringify(messageEvent),
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("msg-001");
  });
});
