import net from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseTcpTarget, runTcpCheck } from "../../src/monitoring/checks/tcp-check.js";

// The TCP check implementation uses Bun.connect. Under the project's standard
// vitest (node) runner, Bun is not a global, so we shim it with a node:net
// implementation that mirrors the Bun.connect surface we depend on.
// In Bun runtime, this shim is a no-op and the real Bun.connect is used.
declare global {
  // eslint-disable-next-line no-var
  var Bun:
    | {
        connect: (opts: {
          hostname: string;
          port: number;
          socket: {
            data: (buf: Buffer) => void;
            error: (e: Error) => void;
            open: (s: { end: () => void }) => void;
            close: () => void;
          };
        }) => Promise<{ end: () => void }>;
      }
    | undefined;
}

function ensureBunShim() {
  if (typeof globalThis.Bun !== "undefined") return;

  // Minimal shim: a Promise-returning wrapper over net.connect.
  globalThis.Bun = {
    connect: (opts) =>
      new Promise((resolve, reject) => {
        const sock = net.connect({ host: opts.hostname, port: opts.port });
        const emitOpen = () => {
          // We give the test a socket-like object with just `end()`.
          resolve({
            end: () => {
              sock.end();
            },
          });
          // Tell the production code "open" fired by calling its callback.
          opts.socket.open({ end: () => sock.end() });
        };
        sock.once("connect", emitOpen);
        sock.once("error", (e) => {
          opts.socket.error(e);
          reject(e);
        });
      }),
  };
}

ensureBunShim();

// Spin up a local TCP listener on an ephemeral port for "up" tests.
function startEchoServer(): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const server = net.createServer((socket) => {
      socket.end();
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("failed to get listener address"));
        return;
      }
      resolve({
        port: addr.port,
        close: () =>
          new Promise<void>((res) => {
            server.close(() => res());
          }),
      });
    });
  });
}

describe("parseTcpTarget", () => {
  it("parses tcp://host:port", () => {
    expect(parseTcpTarget("tcp://db.local:5432")).toEqual({ host: "db.local", port: 5432 });
  });

  it("parses bare host:port", () => {
    expect(parseTcpTarget("10.0.0.5:6379")).toEqual({ host: "10.0.0.5", port: 6379 });
  });

  it("parses host:port with hyphenated hostnames", () => {
    expect(parseTcpTarget("my-db-1.example.com:5432")).toEqual({
      host: "my-db-1.example.com",
      port: 5432,
    });
  });

  it("rejects missing port", () => {
    expect(parseTcpTarget("tcp://db.local")).toBeNull();
  });

  it("rejects non-numeric port", () => {
    expect(parseTcpTarget("db.local:http")).toBeNull();
  });

  it("rejects empty input", () => {
    expect(parseTcpTarget("")).toBeNull();
  });

  it("rejects out-of-range port", () => {
    expect(parseTcpTarget("db.local:70000")).toBeNull();
  });
});

describe("runTcpCheck", () => {
  let server: { port: number; close: () => Promise<void> } | null = null;

  beforeAll(() => {
    ensureBunShim();
  });

  afterAll(async () => {
    if (server) {
      await server.close();
      server = null;
    }
  });

  it("reports up when a server accepts the connection", async () => {
    server = await startEchoServer();
    const r = await runTcpCheck({ host: "127.0.0.1", port: server.port, timeoutMs: 2000 });
    expect(r.isUp).toBe(true);
    expect(r.responseTimeMs).toBeGreaterThanOrEqual(0);
    expect(r.error).toBeUndefined();
    expect(r.target).toBe(`127.0.0.1:${server.port}`);
  }, 10_000);

  it("reports down on connection refused (closed port)", async () => {
    const r = await runTcpCheck({ host: "127.0.0.1", port: 1, timeoutMs: 2000 });
    expect(r.isUp).toBe(false);
    expect(r.error).toBeDefined();
    expect(typeof r.error).toBe("string");
  }, 10_000);

  it("reports down on timeout for unreachable host", async () => {
    // 10.255.255.1 is non-routable in most environments — connection hangs
    // until our explicit timeout fires.
    const r = await runTcpCheck({
      host: "10.255.255.1",
      port: 5432,
      timeoutMs: 800,
    });
    expect(r.isUp).toBe(false);
    expect(r.error).toMatch(/timeout/i);
    expect(r.responseTimeMs).toBeLessThanOrEqual(1500);
  }, 10_000);

  it("respects the configured timeout upper bound", async () => {
    // timeoutMs > 10_000 must be clamped to 10_000 — verify by ensuring the
    // call returns within a sane window (i.e. the runner didn't blow past
    // the cap on a stuck connection).
    const r = await runTcpCheck({
      host: "10.255.255.1",
      port: 5432,
      timeoutMs: 60_000,
    });
    expect(r.isUp).toBe(false);
    expect(r.responseTimeMs).toBeLessThanOrEqual(11_000);
  }, 15_000);

  it("returns the target string on success", async () => {
    server = await startEchoServer();
    const r = await runTcpCheck({ host: "127.0.0.1", port: server.port, timeoutMs: 2000 });
    expect(r.target).toBe(`127.0.0.1:${server.port}`);
  }, 10_000);
});
