export interface CheckResult {
  status: "up" | "down";
  responseTimeMs: number;
  details?: Record<string, unknown>;
  error?: string;
}

interface PingCheckConfig {
  host: string;
  timeoutMs: number;
}

export async function runPingCheck(config: PingCheckConfig): Promise<CheckResult> {
  const start = Date.now();
  const timeoutMs = Math.min(config.timeoutMs, 10_000);

  // Try HTTPS:443 first, then HTTP:80 — ICMP requires root privileges
  const ports = [443, 80];

  for (const port of ports) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    // See tcp-check.ts — the Socket interface is not on the global `Bun`
    // namespace, so we store the orphan as `unknown` and cast at the
    // single call site.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let openedSocket: any = null;
    try {
      // Kick off the connect. Attach .catch() up-front so a late rejection
      // from the orphan connect (after our timer wins) is swallowed — this
      // is the line that prevents the runtime from crashing on the
      // `internalConnectMultipleTimeout` callback firing on a null context.
      const connectPromise = Bun.connect({
        hostname: config.host,
        port,
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

      const socket = await Promise.race([
        connectPromise,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            timedOut = true;
            reject(new Error("Connection timeout"));
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
        status: "up",
        responseTimeMs,
        details: { port, method: "tcp_connect" },
      };
    } catch {
      if (timer) clearTimeout(timer);
      if (timedOut && openedSocket) {
        try {
          openedSocket.end();
        } catch {
          /* ignore */
        }
      }
      // Try next port
    }
  }

  return {
    status: "down",
    responseTimeMs: Date.now() - start,
    error: `TCP connect failed on ports ${ports.join(", ")} for ${config.host}`,
    details: { ports, method: "tcp_connect" },
  };
}
