/**
 * Tests for /api/traces (trace listing, detail, stats, workflows endpoints).
 *
 * The traces API surfaces:
 *   - GET /api/traces/         — paginated list with filters
 *   - GET /api/traces/:id      — full trace detail with span hierarchy
 *   - GET /api/traces/stats    — aggregated token usage + latency stats
 *   - GET /api/traces/workflows — workflow run listing
 *
 * Coverage:
 *   - List with default pagination
 *   - Each filter (projectId, traceId, workflowName, agentName, status, from/to)
 *   - Custom limit
 *   - Empty result set
 *   - Detail with span hierarchy and 404 on missing trace
 *   - Stats with projectId (token + latency aggregated) and 400 on missing
 *   - Workflows listing
 *   - Auth rejection (no API key → 401)
 */

import { Elysia } from "elysia";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Constants ────────────────────────────────────────────────────────
const PROJECT_ID = "660e8400-e29b-41d4-a716-446655440001";
const TRACE_ID = "trace-abc-123";
const WORKFLOW_NAME = "data-pipeline";
const AGENT_NAME = "planner";
const STATUS_OK = "ok";

// ── Deterministic mock data ──────────────────────────────────────────
const mockTraceRow = {
  id: "span-1",
  traceId: TRACE_ID,
  spanId: "span-1",
  parentSpanId: null,
  projectId: PROJECT_ID,
  name: "workflow.run",
  kind: "INTERNAL",
  status: STATUS_OK,
  durationMs: 250,
  attributes: { "mastra.workflow": WORKFLOW_NAME },
  startTime: new Date("2026-06-01T10:00:00Z"),
  endTime: new Date("2026-06-01T10:00:01Z"),
  createdAt: new Date("2026-06-01T10:00:00Z"),
};

const mockAgentRow = {
  ...mockTraceRow,
  id: "span-2",
  spanId: "span-2",
  name: "agent.think",
  attributes: { "mastra.agent": AGENT_NAME },
};

const mockListResult = {
  data: [mockTraceRow, mockAgentRow],
  total: 2,
  limit: 50,
  offset: 0,
};

const mockDetail = {
  traceId: TRACE_ID,
  spans: [mockTraceRow, mockAgentRow],
};

const mockWorkflowList = {
  data: [mockTraceRow],
  total: 1,
  limit: 50,
  offset: 0,
};

const mockTokenUsage = [
  {
    model: "gpt-4o-mini",
    promptTokens: 100,
    completionTokens: 50,
    totalTokens: 150,
    costUsd: 0.00045,
  },
];

const mockLatency = [
  {
    model: "gpt-4o-mini",
    p50: 200,
    p95: 800,
    p99: 1200,
    count: 10,
    avgMs: 350,
  },
];

// ── Store module mocks ───────────────────────────────────────────────
const getTracesMock = vi.fn();
const getTraceDetailMock = vi.fn();
const getWorkflowRunsMock = vi.fn();

vi.mock("../../src/store/traces.js", () => ({
  getTraces: (...args: any[]) => getTracesMock(...args),
  getTraceDetail: (...args: any[]) => getTraceDetailMock(...args),
  getWorkflowRuns: (...args: any[]) => getWorkflowRunsMock(...args),
}));

// ── Mastra module mocks ──────────────────────────────────────────────
const getTokenUsageMock = vi.fn();
const getLatencyStatsMock = vi.fn();

vi.mock("../../src/mastra/token-aggregator.js", () => ({
  getTokenUsage: (...args: any[]) => getTokenUsageMock(...args),
}));

vi.mock("../../src/mastra/latency-analyzer.js", () => ({
  getLatencyStats: (...args: any[]) => getLatencyStatsMock(...args),
}));

// ── Lib mocks ────────────────────────────────────────────────────────
vi.mock("../../src/lib/errors.js", () => ({
  badRequest: (msg: string) => ({ error: msg }),
  internal: (msg: string) => ({ error: msg }),
}));

// ── Auth dependency mocks (used by middleware/auth.js) ───────────────
vi.mock("../../src/lib/auth.js", () => ({
  resolveApiKey: vi.fn(() => null),
  lookupProject: vi.fn(async () => null),
}));

vi.mock("../../src/lib/rbac.js", () => ({
  checkWriteAccess: vi.fn(async () => true),
}));

// Pass-through middleware so the real guard runs against the mocked
// resolveApiKey/lookupProject above.
vi.mock("../../src/middleware/auth.js", async () => {
  const actual = await vi.importActual<any>("../../src/middleware/auth.js");
  return actual;
});

vi.mock("../../src/lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ── Imports (must come after mocks) ──────────────────────────────────
const { tracesRoutes } = await import("../../src/api/traces.js");
const { authGuard } = await import("../../src/middleware/auth.js");

function appWithAuth(): Elysia {
  return new Elysia().onBeforeHandle(authGuard).use(tracesRoutes);
}

beforeEach(() => {
  getTracesMock.mockReset();
  getTraceDetailMock.mockReset();
  getWorkflowRunsMock.mockReset();
  getTokenUsageMock.mockReset();
  getLatencyStatsMock.mockReset();

  // Default happy-path responses
  getTracesMock.mockResolvedValue(mockListResult);
  getTraceDetailMock.mockResolvedValue(mockDetail);
  getWorkflowRunsMock.mockResolvedValue(mockWorkflowList);
  getTokenUsageMock.mockResolvedValue(mockTokenUsage);
  getLatencyStatsMock.mockResolvedValue(mockLatency);
});

// ── Auth rejection ───────────────────────────────────────────────────
describe("GET /api/traces (auth)", () => {
  it("returns 401 without API key", async () => {
    const app = appWithAuth();
    const res = await app.handle(new Request("http://localhost/api/traces/"));
    expect(res.status).toBe(401);
  });
});

// ── List endpoint ────────────────────────────────────────────────────
describe("GET /api/traces/ (list)", () => {
  it("returns paginated list with default limit/offset", async () => {
    const res = await tracesRoutes.handle(new Request("http://localhost/api/traces/"));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.data).toHaveLength(2);
    expect(body.total).toBe(2);
    expect(body.limit).toBe(50);
    expect(body.offset).toBe(0);
    expect(getTracesMock).toHaveBeenCalledTimes(1);
  });

  it("forwards projectId filter", async () => {
    const res = await tracesRoutes.handle(
      new Request(`http://localhost/api/traces/?projectId=${PROJECT_ID}`),
    );
    expect(res.status).toBe(200);
    expect(getTracesMock).toHaveBeenCalledWith(expect.objectContaining({ projectId: PROJECT_ID }));
  });

  it("forwards workflowName filter", async () => {
    const res = await tracesRoutes.handle(
      new Request(`http://localhost/api/traces/?workflowName=${WORKFLOW_NAME}`),
    );
    expect(res.status).toBe(200);
    expect(getTracesMock).toHaveBeenCalledWith(
      expect.objectContaining({ workflowName: WORKFLOW_NAME }),
    );
  });

  it("forwards agentName filter", async () => {
    const res = await tracesRoutes.handle(
      new Request(`http://localhost/api/traces/?agentName=${AGENT_NAME}`),
    );
    expect(res.status).toBe(200);
    expect(getTracesMock).toHaveBeenCalledWith(expect.objectContaining({ agentName: AGENT_NAME }));
  });

  it("forwards status filter", async () => {
    const res = await tracesRoutes.handle(
      new Request(`http://localhost/api/traces/?status=${STATUS_OK}`),
    );
    expect(res.status).toBe(200);
    expect(getTracesMock).toHaveBeenCalledWith(expect.objectContaining({ status: STATUS_OK }));
  });

  it("parses date range filters into Date instances", async () => {
    const from = "2026-06-01T00:00:00.000Z";
    const to = "2026-06-02T00:00:00.000Z";
    const res = await tracesRoutes.handle(
      new Request(`http://localhost/api/traces/?from=${from}&to=${to}`),
    );
    expect(res.status).toBe(200);
    const call = getTracesMock.mock.calls[0][0];
    expect(call.from).toBeInstanceOf(Date);
    expect(call.to).toBeInstanceOf(Date);
    expect(call.from.toISOString()).toBe(from);
    expect(call.to.toISOString()).toBe(to);
  });

  it("forwards traceId filter", async () => {
    const res = await tracesRoutes.handle(
      new Request(`http://localhost/api/traces/?traceId=${TRACE_ID}`),
    );
    expect(res.status).toBe(200);
    expect(getTracesMock).toHaveBeenCalledWith(expect.objectContaining({ traceId: TRACE_ID }));
  });

  it("honors custom limit", async () => {
    const res = await tracesRoutes.handle(new Request("http://localhost/api/traces/?limit=10"));
    expect(res.status).toBe(200);
    expect(getTracesMock).toHaveBeenCalledWith(expect.objectContaining({ limit: 10 }));
  });

  it("returns empty result set with total=0", async () => {
    getTracesMock.mockReset();
    getTracesMock.mockResolvedValueOnce({
      data: [],
      total: 0,
      limit: 50,
      offset: 0,
    });

    const res = await tracesRoutes.handle(new Request("http://localhost/api/traces/"));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.data).toEqual([]);
    expect(body.total).toBe(0);
  });
});

// ── Detail endpoint ──────────────────────────────────────────────────
describe("GET /api/traces/:id (detail)", () => {
  it("returns trace detail with span hierarchy", async () => {
    const res = await tracesRoutes.handle(new Request(`http://localhost/api/traces/${TRACE_ID}`));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.traceId).toBe(TRACE_ID);
    expect(body.spans).toHaveLength(2);
    expect(body.spans[0].spanId).toBe("span-1");
    expect(getTraceDetailMock).toHaveBeenCalledWith(TRACE_ID);
  });

  it("returns 404 when trace is missing", async () => {
    getTraceDetailMock.mockReset();
    getTraceDetailMock.mockResolvedValueOnce(null);

    const res = await tracesRoutes.handle(new Request("http://localhost/api/traces/missing-trace"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Trace not found");
  });
});

// ── Stats endpoint ───────────────────────────────────────────────────
describe("GET /api/traces/stats", () => {
  it("returns tokenUsage and latency aggregation", async () => {
    const res = await tracesRoutes.handle(
      new Request(`http://localhost/api/traces/stats?projectId=${PROJECT_ID}`),
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.tokenUsage).toHaveLength(1);
    expect(body.tokenUsage[0].model).toBe("gpt-4o-mini");
    expect(body.tokenUsage[0].totalTokens).toBe(150);
    expect(body.latency).toHaveLength(1);
    expect(body.latency[0].p95).toBe(800);
    expect(getTokenUsageMock).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: PROJECT_ID }),
    );
    expect(getLatencyStatsMock).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: PROJECT_ID }),
    );
  });

  it("returns 422 when projectId is missing", async () => {
    const res = await tracesRoutes.handle(new Request("http://localhost/api/traces/stats"));
    // Elysia's schema validator returns 422 (Unprocessable Entity) for
    // missing required fields — the handler's explicit 400 check is dead
    // code under strict validation.
    expect(res.status).toBe(422);
  });
});

// ── Workflows endpoint ───────────────────────────────────────────────
describe("GET /api/traces/workflows", () => {
  it("returns workflow runs list", async () => {
    const res = await tracesRoutes.handle(
      new Request(`http://localhost/api/traces/workflows?projectId=${PROJECT_ID}`),
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.data).toHaveLength(1);
    expect(body.total).toBe(1);
    expect(getWorkflowRunsMock).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: PROJECT_ID }),
    );
  });
});
