/**
 * Tests for POST /api/agent/ingest (agent ingest endpoint).
 *
 * The agent ingest endpoint accepts stats from remote lightweight monitoring
 * agents. It validates the body via Zod-backed Elysia `t.Object`, applies a
 * per-host rate limit (60 req/min) via Redis, and writes host stats, container
 * stats, GPU stats, and host info into the store layer.
 *
 * Coverage:
 *   - Happy paths: minimal, host+container, full (with GPU + hostInfo)
 *   - Validation: invalid JSON, missing hostId, wrong field types
 *   - Auth rejection: no API key returns 401 (via authGuard middleware)
 *   - Rate limiting: 61st request within window returns 429
 *   - Store wiring: insertHostStats / insertContainerStats / insertGpuStats /
 *     upsertHostInfo invoked with the right payloads
 *   - Empty containers array still succeeds without calling insertContainerStats
 */

import { Elysia } from "elysia";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks (declared via vi.mock so they're hoisted) ───────────────────

// Mock the infra store: track which functions were called and with what.
const infraMock = {
  insertHostStats: vi.fn(async () => undefined),
  insertContainerStats: vi.fn(async () => undefined),
  insertGpuStats: vi.fn(async () => undefined),
  upsertHostInfo: vi.fn(async () => undefined),
};

vi.mock("../../src/store/infra.js", () => infraMock);

// Mock Redis used for the per-host rate limiter. Returning 1 makes the limiter
// always allow (the first hit), and we override per-test for the 429 case.
const redisMock = {
  incr: vi.fn(async () => 1),
  pexpire: vi.fn(async () => 1),
};
vi.mock("../../src/store/redis.js", () => ({ redis: redisMock }));

// Silence logger.
vi.mock("../../src/lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Mock auth helpers — authGuard uses resolveApiKey + lookupProject.
const authModule = {
  resolveApiKey: vi.fn(() => ({ apiKey: "test-api-key" })),
  lookupProject: vi.fn(async () => ({ projectId: "proj-1" })),
};
vi.mock("../../src/lib/auth.js", () => authModule);

vi.mock("../../src/lib/rbac.js", () => ({
  checkWriteAccess: vi.fn(async () => true),
}));

// Keep the actual authGuard middleware (we apply it manually in the test app).
vi.mock("../../src/middleware/auth.js", async () => {
  const actual = await vi.importActual<any>("../../src/middleware/auth.js");
  return actual;
});

// ── Imports (must come AFTER vi.mock declarations) ────────────────────
const { agentIngestPlugin } = await import("../../src/api/agent-ingest.js");
const { authGuard } = await import("../../src/middleware/auth.js");

// ── Test app factory ──────────────────────────────────────────────────
// Mirrors the global onError hook from src/index.ts so validation failures
// surface as 400 (production behavior) rather than Elysia's default 422.
function buildApp(): Elysia {
  return new Elysia()
    .onBeforeHandle(authGuard)
    .onError(({ code, set }) => {
      if (code === "VALIDATION") {
        set.status = 400;
        return { error: "Invalid request" };
      }
    })
    .use(agentIngestPlugin);
}

// ── Fixtures ──────────────────────────────────────────────────────────
const HOST_ID = "host-abc-123";
const VALID_API_KEY = "test-api-key";

const minimalHostStats = {
  cpu: 42.5,
  memory: 4096,
  disk: 100,
  load: [1.0, 0.8, 0.5],
  network: { rx: 1024, tx: 2048 },
};

const sampleContainer = {
  id: "c-1",
  name: "web",
  cpu: 12.3,
  memory: 256,
};

const sampleGpu = {
  gpuIndex: 0,
  utilizationPercent: 75.0,
  memoryUsedMb: 1024,
  memoryTotalMb: 8192,
  temperatureC: 65,
};

const sampleHostInfo = {
  os: "linux",
  kernel: "5.15.0",
  cpuModel: "AMD EPYC 7763",
  cores: 64,
  arch: "x86_64",
  uptime: 123456,
};

function postIngest(
  app: Elysia,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<Response> {
  const allHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    "X-API-Key": VALID_API_KEY,
    ...headers,
  };
  return app.handle(
    new Request("http://localhost/api/agent/ingest", {
      method: "POST",
      headers: allHeaders,
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // Restore defaults that clearAllMocks just nuked.
  infraMock.insertHostStats.mockResolvedValue(undefined);
  infraMock.insertContainerStats.mockResolvedValue(undefined);
  infraMock.insertGpuStats.mockResolvedValue(undefined);
  infraMock.upsertHostInfo.mockResolvedValue(undefined);
  redisMock.incr.mockResolvedValue(1);
  redisMock.pexpire.mockResolvedValue(1);
  authModule.resolveApiKey.mockReturnValue({ apiKey: VALID_API_KEY });
  authModule.lookupProject.mockResolvedValue({ projectId: "proj-1" });
});

// ── Happy paths ───────────────────────────────────────────────────────
describe("POST /api/agent/ingest — happy paths", () => {
  it("accepts valid host stats + container stats and returns ok with hostId", async () => {
    const app = buildApp();
    const body = {
      hostId: HOST_ID,
      hostStats: minimalHostStats,
      containers: [sampleContainer],
    };

    const res = await postIngest(app, body);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.hostId).toBe(HOST_ID);

    expect(infraMock.insertHostStats).toHaveBeenCalledTimes(1);
    expect(infraMock.insertContainerStats).toHaveBeenCalledTimes(1);
    expect(infraMock.insertGpuStats).not.toHaveBeenCalled();
    expect(infraMock.upsertHostInfo).not.toHaveBeenCalled();

    // insertHostStats receives (stats, hostId)
    const [statsArg, hostIdArg] = infraMock.insertHostStats.mock.calls[0];
    expect(hostIdArg).toBe(HOST_ID);
    expect(statsArg.cpu_percent).toBe(minimalHostStats.cpu);
    expect(statsArg.memory_used_mb).toBe(minimalHostStats.memory);
    expect(statsArg.disk_used_gb).toBe(minimalHostStats.disk);
    expect(statsArg.network_rx_bytes).toBe(minimalHostStats.network.rx);
    expect(statsArg.network_tx_bytes).toBe(minimalHostStats.network.tx);
    expect(statsArg.load_avg_1m).toBe(minimalHostStats.load[0]);

    // insertContainerStats receives (containers, hostId)
    const [containersArg, containerHostArg] = infraMock.insertContainerStats.mock.calls[0];
    expect(containerHostArg).toBe(HOST_ID);
    expect(containersArg).toHaveLength(1);
    expect(containersArg[0].id).toBe(sampleContainer.id);
    expect(containersArg[0].cpu_percent).toBe(sampleContainer.cpu);
  });

  it("accepts a full payload with GPU stats + hostInfo", async () => {
    const app = buildApp();
    const body = {
      hostId: HOST_ID,
      hostStats: { ...minimalHostStats, cores: [50.0, 60.0, 40.0] },
      containers: [sampleContainer],
      gpu: [sampleGpu],
      hostInfo: sampleHostInfo,
    };

    const res = await postIngest(app, body);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);

    expect(infraMock.insertHostStats).toHaveBeenCalledTimes(1);
    expect(infraMock.insertContainerStats).toHaveBeenCalledTimes(1);
    expect(infraMock.insertGpuStats).toHaveBeenCalledTimes(1);
    expect(infraMock.upsertHostInfo).toHaveBeenCalledTimes(1);

    // Per-core cpu_cores should be mapped to {core, percent} pairs.
    const [statsArg] = infraMock.insertHostStats.mock.calls[0];
    expect(statsArg.cpu_cores).toEqual([
      { core: 0, percent: 50.0 },
      { core: 1, percent: 60.0 },
      { core: 2, percent: 40.0 },
    ]);

    const [gpuArg, gpuHostArg] = infraMock.insertGpuStats.mock.calls[0];
    expect(gpuHostArg).toBe(HOST_ID);
    expect(gpuArg[0].gpuIndex).toBe(0);
    expect(gpuArg[0].utilizationPercent).toBe(75.0);
    expect(gpuArg[0].temperatureC).toBe(65);

    const [infoArg] = infraMock.upsertHostInfo.mock.calls[0];
    expect(infoArg.hostId).toBe(HOST_ID);
    expect(infoArg.osName).toBe(sampleHostInfo.os);
    expect(infoArg.kernelVersion).toBe(sampleHostInfo.kernel);
    expect(infoArg.cpuModel).toBe(sampleHostInfo.cpuModel);
    expect(infoArg.coreCount).toBe(sampleHostInfo.cores);
    expect(infoArg.architecture).toBe(sampleHostInfo.arch);
    expect(infoArg.uptimeSeconds).toBe(sampleHostInfo.uptime);
  });

  it("accepts a minimal payload (host stats only, empty containers)", async () => {
    const app = buildApp();
    const body = {
      hostId: HOST_ID,
      hostStats: minimalHostStats,
      containers: [],
    };

    const res = await postIngest(app, body);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.hostId).toBe(HOST_ID);

    // insertHostStats should run; insertContainerStats should be skipped
    // because the source only inserts when containers.length > 0.
    expect(infraMock.insertHostStats).toHaveBeenCalledTimes(1);
    expect(infraMock.insertContainerStats).not.toHaveBeenCalled();
  });

  it("applies default values for missing optional container fields", async () => {
    const app = buildApp();
    const body = {
      hostId: HOST_ID,
      hostStats: minimalHostStats,
      containers: [
        {
          // only required fields — no optional image/status/memoryLimit/etc.
          id: "c-2",
          name: "minimal",
          cpu: 1.0,
          memory: 64,
        },
      ],
    };

    const res = await postIngest(app, body);
    expect(res.status).toBe(200);

    const [containersArg] = infraMock.insertContainerStats.mock.calls[0];
    const mapped = containersArg[0];
    expect(mapped.id).toBe("c-2");
    expect(mapped.image).toBe("unknown"); // default
    expect(mapped.status).toBe("running"); // default
    expect(mapped.memory_limit_mb).toBe(0);
    expect(mapped.memory_percent).toBe(0);
    expect(mapped.network_rx_bytes).toBe(0);
    expect(mapped.health_status).toBeNull();
  });
});

// ── Validation ────────────────────────────────────────────────────────
describe("POST /api/agent/ingest — validation", () => {
  it("returns 400 when the request body is not valid JSON", async () => {
    const app = buildApp();
    const res = await postIngest(app, "{not-json");

    expect(res.status).toBe(400);
    // No store functions should have been touched.
    expect(infraMock.insertHostStats).not.toHaveBeenCalled();
    expect(infraMock.insertContainerStats).not.toHaveBeenCalled();
  });

  it("returns 400 when the required hostId field is missing", async () => {
    const app = buildApp();
    const body = {
      // hostId omitted
      hostStats: minimalHostStats,
      containers: [],
    };

    const res = await postIngest(app, body);

    expect(res.status).toBe(400);
    expect(infraMock.insertHostStats).not.toHaveBeenCalled();
  });

  it("returns 400 when hostStats.cpu is a string instead of a number", async () => {
    const app = buildApp();
    const body = {
      hostId: HOST_ID,
      hostStats: {
        ...minimalHostStats,
        cpu: "not-a-number", // wrong type
      },
      containers: [],
    };

    const res = await postIngest(app, body);

    expect(res.status).toBe(400);
    expect(infraMock.insertHostStats).not.toHaveBeenCalled();
  });

  it("returns 400 when hostStats.network.rx is missing", async () => {
    const app = buildApp();
    const body = {
      hostId: HOST_ID,
      hostStats: {
        cpu: 10,
        memory: 100,
        disk: 10,
        load: [0.1, 0.2, 0.3],
        network: { tx: 100 }, // rx omitted — required
      },
      containers: [],
    };

    const res = await postIngest(app, body);

    expect(res.status).toBe(400);
    expect(infraMock.insertHostStats).not.toHaveBeenCalled();
  });
});

// ── Auth ──────────────────────────────────────────────────────────────
describe("POST /api/agent/ingest — auth", () => {
  it("returns 401 when no API key is provided", async () => {
    // Make resolveApiKey return null so authGuard rejects.
    authModule.resolveApiKey.mockReturnValue(null);

    const app = buildApp();
    const body = {
      hostId: HOST_ID,
      hostStats: minimalHostStats,
      containers: [],
    };

    const res = await postIngest(app, body, { "X-API-Key": "" });

    expect(res.status).toBe(401);
    expect(infraMock.insertHostStats).not.toHaveBeenCalled();
  });

  it("returns 401 when the API key does not resolve to a project", async () => {
    authModule.resolveApiKey.mockReturnValue({ apiKey: "ghost-key" });
    authModule.lookupProject.mockResolvedValue(null);

    const app = buildApp();
    const body = {
      hostId: HOST_ID,
      hostStats: minimalHostStats,
      containers: [],
    };

    const res = await postIngest(app, body, { "X-API-Key": "ghost-key" });

    expect(res.status).toBe(401);
  });
});

// ── Rate limit ────────────────────────────────────────────────────────
describe("POST /api/agent/ingest — rate limiting", () => {
  it("returns 429 when the per-host rate limit is exceeded", async () => {
    // Simulate Redis reporting that the host already exceeded the cap.
    redisMock.incr.mockResolvedValue(61); // > HOST_LIMIT_MAX (60)

    const app = buildApp();
    const body = {
      hostId: HOST_ID,
      hostStats: minimalHostStats,
      containers: [],
    };

    const res = await postIngest(app, body);

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
    expect(res.headers.get("X-RateLimit-Limit")).toBe("60");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");

    const json = await res.json();
    expect(json.error).toMatch(/too many/i);
    expect(json.retryAfter).toBe(60);

    // No store calls when rate-limited.
    expect(infraMock.insertHostStats).not.toHaveBeenCalled();
  });
});

// ── Multiple containers ───────────────────────────────────────────────
describe("POST /api/agent/ingest — multiple containers", () => {
  it("passes all containers through to insertContainerStats in one batch", async () => {
    const app = buildApp();
    const body = {
      hostId: HOST_ID,
      hostStats: minimalHostStats,
      containers: [
        { id: "c-1", name: "web", cpu: 10.0, memory: 128 },
        { id: "c-2", name: "db", cpu: 20.0, memory: 512 },
        { id: "c-3", name: "cache", cpu: 5.0, memory: 64 },
      ],
    };

    const res = await postIngest(app, body);

    expect(res.status).toBe(200);
    expect(infraMock.insertContainerStats).toHaveBeenCalledTimes(1);

    const [containersArg] = infraMock.insertContainerStats.mock.calls[0];
    expect(containersArg).toHaveLength(3);
    expect(containersArg.map((c: { id: string }) => c.id)).toEqual(["c-1", "c-2", "c-3"]);
  });
});
