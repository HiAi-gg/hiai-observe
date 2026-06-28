export interface TcpCheckOptions {
  /** Hostname or IP to connect to. May include `:port` (e.g. `db.local:5432`). */
  host: string;
  /** Port to connect to. Required. */
  port: number;
  /** Connection timeout in milliseconds. Defaults to 5000; hard-capped at 10_000. */
  timeoutMs?: number;
}

export interface TcpCheckResult {
  /** True if the TCP handshake completed within the timeout. */
  isUp: boolean;
  /** Wall-clock time spent on the attempt, in milliseconds. */
  responseTimeMs: number;
  /** Resolved host:port pair, useful for logs and error messages. */
  target?: string;
  /** Error description when the connection failed. */
  error?: string;
}

const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_TIMEOUT_MS = 10_000;

/**
 * Resolve the host:port from a monitor URL. Accepts three forms:
 *   - `tcp://host:port`
 *   - `host:port` (bare)
 *   - A pre-parsed `{ host, port }` pair
 *
 * Returns null when the input cannot be parsed.
 */
export function parseTcpTarget(input: string): { host: string; port: number } | null {
  if (!input) return null;

  // tcp:// scheme — use URL parser
  if (input.startsWith("tcp://")) {
    try {
      const u = new URL(input);
      const port = Number(u.port);
      if (!u.hostname || !Number.isFinite(port) || port <= 0) return null;
      return { host: u.hostname, port };
    } catch {
      return null;
    }
  }

  // Bare host:port — only accept if the port segment is numeric
  const lastColon = input.lastIndexOf(":");
  if (lastColon > 0 && lastColon < input.length - 1) {
    const host = input.slice(0, lastColon);
    const portStr = input.slice(lastColon + 1);
    if (/^\d+$/.test(portStr)) {
      const port = Number(portStr);
      if (port > 0 && port <= 65535) {
        return { host, port };
      }
    }
  }

  return null;
}

/**
 * Attempt a raw TCP connection to `host:port` and time the handshake.
 *
 * Success: connection opens within the timeout.
 * Failure: connection refused, DNS failure, or timeout.
 *
 * Implementation notes:
 *   - The previous version used `Promise.race([Bun.connect(...), timeout])`.
 *     That races well when the connect wins, but when the timer wins the
 *     underlying `Bun.connect` promise is orphaned. The native connect
 *     keeps the DNS query / TCP handshake alive in the background, and
 *     when the OS-level connect finally times out, Node's
 *     `internalConnectMultipleTimeout` callback fires on a destroyed
 *     context. The resulting `TypeError: null is not an object (evaluating
 *     'context')` propagates as an uncaught exception and crashes the
 *     whole process.
 *   - The fix: we still race with a timeout (Bun.connect has no built-in
 *     connect timeout), but we attach a `.catch()` to the Bun.connect
 *     promise to swallow the late rejection, and we close the socket
 *     synchronously the moment our timer wins. This guarantees the
 *     orphan can't produce a late unhandled rejection that the runtime
 *     then mishandles.
 */
export async function runTcpCheck(opts: TcpCheckOptions): Promise<TcpCheckResult> {
  const start = Date.now();
  const timeoutMs = Math.min(Math.max(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS, 100), MAX_TIMEOUT_MS);
  const target = `${opts.host}:${opts.port}`;

  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  // The socket interface is only declared inside `declare module "bun"`,
  // not on the global `Bun` namespace, so we type the orphan as `unknown`
  // and cast at the single call site.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let openedSocket: any = null;

  try {
    // Kick off the native connect. Attach .catch() up-front so any late
    // rejection from the orphan connect (after our timer wins) is
    // swallowed — this is the line that prevents the process crash.
    const connectPromise = Bun.connect({
      hostname: opts.host,
      port: opts.port,
      socket: {
        data() {},
        error() {},
        open(socket) {
          openedSocket = socket;
        },
        close() {},
      },
    });
    connectPromise.catch(() => {
      /* late rejection from orphan connect — swallow */
    });

    const socket = await Promise.race<Awaited<ReturnType<typeof Bun.connect>>>([
      connectPromise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          reject(new Error(`TCP connection timeout after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);

    const responseTimeMs = Date.now() - start;
    if (timer) clearTimeout(timer);
    try {
      socket.end();
    } catch {
      /* socket may already be closed */
    }

    return {
      isUp: true,
      responseTimeMs,
      target,
    };
  } catch (err) {
    if (timer) clearTimeout(timer);
    // If we timed out, the connect may have *just* succeeded in the
    // background. Best-effort close the orphan socket so it doesn't
    // leak an FD.
    if (timedOut && openedSocket) {
      try {
        openedSocket.end();
      } catch {
        /* ignore */
      }
    }
    return {
      isUp: false,
      responseTimeMs: Date.now() - start,
      target,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
