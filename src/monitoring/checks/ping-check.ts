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
    try {
      const socket = await Promise.race([
        Bun.connect({
          hostname: config.host,
          port,
          socket: {
            data() {},
            error() {},
            open() {},
            close() {},
          },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Connection timeout")), timeoutMs)
        ),
      ]);

      const responseTimeMs = Date.now() - start;
      socket.end();

      return {
        status: "up",
        responseTimeMs,
        details: { port, method: "tcp_connect" },
      };
    } catch {
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
