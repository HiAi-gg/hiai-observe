import { describe, it, expect, vi, beforeEach } from "vitest";

const UUID1 = "550e8400-e29b-41d4-a716-446655440000";
const UUID2 = "660e8400-e29b-41d4-a716-446655440001";

// ── Mock data ─────────────────────────────────────────────────────────
const mockIssue = {
  id: UUID1,
  projectId: "proj-1",
  title: "TypeError: Cannot read property 'x' of undefined",
  type: "exception",
  fingerprint: "TypeError::readFile::fs.js",
  status: "unresolved",
  count: 5,
  firstSeen: new Date("2026-01-01"),
  lastSeen: new Date("2026-01-15"),
  metadata: null,
};

const mockEvent = {
  id: "event-1",
  issueId: UUID1,
  projectId: "proj-1",
  message: "Cannot read property 'x' of undefined",
  exceptionType: "TypeError",
  level: "error",
  createdAt: new Date("2026-01-15"),
};

// ── Create a reusable chainable mock helper ───────────────────────────
function createChain(result: any) {
  const chain: any = {};
  const methods = [
    "from", "where", "orderBy", "limit", "offset",
    "returning", "set", "values", "for", "delete", "groupBy",
  ];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.then = (resolve: Function, reject?: Function) =>
    Promise.resolve(result).then(resolve, reject);
  return chain;
}

// ── Mock db ───────────────────────────────────────────────────────────
vi.mock("../../src/store/db.js", () => {
  const db: any = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn((fn: any) => fn(db)), // tx === db so mock chains apply inside transactions
  };
  return { db };
});

// ── Mock schema ───────────────────────────────────────────────────────
vi.mock("../../src/store/schema.js", () => ({
  issues: {
    id: "id", projectId: "project_id", title: "title",
    status: "status", lastSeen: "last_seen", fingerprint: "fingerprint",
    count: "count",
  },
  events: { id: "id", issueId: "issue_id", createdAt: "created_at" },
}));

// ── Mock drizzle-orm ─────────────────────────────────────────────────
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col: any, val: any) => ({ col, val, op: "eq" })),
  and: vi.fn((...args: any[]) => ({ args, op: "and" })),
  ilike: vi.fn((col: any, val: any) => ({ col, val, op: "ilike" })),
  desc: vi.fn((col: any) => ({ col, op: "desc" })),
  count: vi.fn(() => ({ op: "count" })),
}));

// ── Capture db mock ──────────────────────────────────────────────────
const dbModule = await import("../../src/store/db.js");

// ── Import plugin AFTER mocks ─────────────────────────────────────────
const { issuesPlugin } = await import("../../src/api/issues.js");

// ── Helpers ──────────────────────────────────────────────────────────
function mockSelectSequence(results: any[]) {
  let callIdx = 0;
  vi.mocked(dbModule.db.select).mockImplementation(() => {
    const idx = callIdx++;
    return createChain(results[Math.min(idx, results.length - 1)]);
  });
}

function _mockInsert() {
  vi.mocked(dbModule.db.insert).mockReturnValue(createChain(undefined) as any);
}

function mockUpdate(returningValue: any[] = []) {
  vi.mocked(dbModule.db.update).mockReturnValue(createChain(returningValue) as any);
}

function mockDelete() {
  vi.mocked(dbModule.db.delete).mockReturnValue(createChain(undefined) as any);
}

describe("issues API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/issues (list)", () => {
    it("returns paginated data", async () => {
      mockSelectSequence([[mockIssue], [{ value: 1 }]]);

      const res = await issuesPlugin.handle(
        new Request("http://localhost/api/issues"),
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].id).toBe(UUID1);
      expect(body.total).toBe(1);
      expect(body.limit).toBe(50);
      expect(body.offset).toBe(0);
    });

    it("accepts query filters", async () => {
      mockSelectSequence([[mockIssue], [{ value: 1 }]]);

      const res = await issuesPlugin.handle(
        new Request(
          `http://localhost/api/issues?projectId=${UUID1}&status=unresolved&search=TypeError&limit=10&offset=5`,
        ),
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.limit).toBe(10);
      expect(body.offset).toBe(5);
    });

    it("returns empty data when no issues", async () => {
      mockSelectSequence([[], [{ value: 0 }]]);

      const res = await issuesPlugin.handle(
        new Request("http://localhost/api/issues"),
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(0);
      expect(body.total).toBe(0);
    });
  });

  describe("GET /api/issues/:id (detail)", () => {
    it("returns issue with events", async () => {
      mockSelectSequence([[mockIssue], [mockEvent]]);

      const res = await issuesPlugin.handle(
        new Request(`http://localhost/api/issues/${UUID1}`),
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe(UUID1);
      expect(body.title).toBe(mockIssue.title);
      expect(body.events).toHaveLength(1);
      expect(body.events[0].id).toBe("event-1");
    });

    it("returns 404 for non-existent issue", async () => {
      mockSelectSequence([[]]);

      const res = await issuesPlugin.handle(
        new Request(`http://localhost/api/issues/${UUID2}`),
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Issue not found");
    });
  });

  describe("PATCH /api/issues/:id (update status)", () => {
    it("updates status to resolved", async () => {
      mockUpdate([{ ...mockIssue, status: "resolved" }]);

      const res = await issuesPlugin.handle(
        new Request(`http://localhost/api/issues/${UUID1}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "resolved" }),
        }),
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("resolved");
    });

    it("returns 400 for invalid status", async () => {
      const res = await issuesPlugin.handle(
        new Request(`http://localhost/api/issues/${UUID1}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "invalid-status" }),
        }),
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Invalid status");
    });

    it("returns 404 for non-existent issue", async () => {
      mockUpdate([]);

      const res = await issuesPlugin.handle(
        new Request(`http://localhost/api/issues/${UUID2}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "resolved" }),
        }),
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Issue not found");
    });
  });

  describe("POST /api/issues/merge", () => {
    it("merges source issues into target", async () => {
      // select calls: 1=target exists, 2=source exists, 3=event count
      mockSelectSequence([
        [{ id: UUID1 }],     // target exists
        [{ id: UUID2 }],     // source exists
        [{ value: 10 }],     // event count
      ]);
      mockUpdate([]);
      mockDelete();

      const res = await issuesPlugin.handle(
        new Request("http://localhost/api/issues/merge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetIssueId: UUID1,
            sourceIssueIds: [UUID2],
          }),
        }),
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.merged).toBe(1);
      expect(body.targetIssueId).toBe(UUID1);
    });

    it("returns 404 when target not found", async () => {
      mockSelectSequence([[]]);

      const res = await issuesPlugin.handle(
        new Request("http://localhost/api/issues/merge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetIssueId: UUID1,
            sourceIssueIds: [UUID2],
          }),
        }),
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Target issue not found");
    });

    it("returns 400 when merging issue with itself", async () => {
      // Target must exist first, then self-merge is detected
      mockSelectSequence([[{ id: UUID1 }]]);

      const res = await issuesPlugin.handle(
        new Request("http://localhost/api/issues/merge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetIssueId: UUID1,
            sourceIssueIds: [UUID1],
          }),
        }),
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Cannot merge issue with itself");
    });
  });

  describe("DELETE /api/issues/:id", () => {
    it("deletes issue and cascades to events", async () => {
      mockSelectSequence([[{ id: UUID1 }]]);
      mockDelete();

      const res = await issuesPlugin.handle(
        new Request(`http://localhost/api/issues/${UUID1}`, {
          method: "DELETE",
        }),
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.deleted).toBe(true);

      // delete should have been called twice (events, then issues)
      expect(dbModule.db.delete).toHaveBeenCalledTimes(2);
    });

    it("returns 404 for non-existent issue", async () => {
      mockSelectSequence([[]]);

      const res = await issuesPlugin.handle(
        new Request(`http://localhost/api/issues/${UUID2}`, {
          method: "DELETE",
        }),
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Issue not found");
    });
  });
});
