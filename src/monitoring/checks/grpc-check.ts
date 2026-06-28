export interface GrpcCheckOptions {
  host: string;
  port: number;
  timeout: number;
  serviceName: string;
  tls: boolean;
}

export interface GrpcCheckResult {
  isUp: boolean;
  status: string;
  responseTime: number;
  error?: string;
}

export async function runGrpcCheck(opts: GrpcCheckOptions): Promise<GrpcCheckResult> {
  const start = Date.now();
  const scheme = opts.tls ? "https" : "http";
  const url = `${scheme}://${opts.host}:${opts.port}/grpc.health.v1.Health/Check`;

  const body = new Uint8Array([0x0a, 0x00]);

  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), opts.timeout);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/grpc",
        te: "trailers",
      },
      body,
      signal: controller.signal,
    });
    clearTimeout(t);

    if (!res.ok) {
      return {
        isUp: false,
        status: "unhealthy",
        responseTime: Date.now() - start,
        error: `HTTP ${res.status}`,
      };
    }

    const buf = new Uint8Array(await res.arrayBuffer());
    const data = buf.slice(5);
    const statusByte = data[1] ?? 0;

    return {
      isUp: statusByte === 1,
      status: statusByte === 1 ? "serving" : `unknown (${statusByte})`,
      responseTime: Date.now() - start,
    };
  } catch (e) {
    return {
      isUp: false,
      status: "error",
      responseTime: Date.now() - start,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
