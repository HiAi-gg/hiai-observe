# HiAi Observe Agent Protocol v1

Lightweight monitoring agent protocol. Compatible with any language that can read `/proc` and `docker stats`.

## Endpoint

```
POST /api/agent/ingest
Headers:
  Authorization: Bearer <apiKey>
  Content-Type: application/json
```

## Request Body

```json
{
  "hostId": "string (required, unique per host)",
  "hostStats": {
    "cpu": 12.5,
    "memory": 45000,
    "disk": 50.0,
    "load": [1.0, 0.9, 0.8],
    "network": { "rx": 1234567, "tx": 7654321 }
  },
  "containers": [
    {
      "id": "abc123",
      "name": "my-app",
      "cpu": 5.2,
      "memory": 256,
      "memoryLimit": 1024,
      "memoryPercent": 25.0,
      "networkRx": 1000,
      "networkTx": 2000,
      "status": "running",
      "uptimeSeconds": 3600,
      "image": "my-app:latest"
    }
  ],
  "gpu": [
    {
      "gpuIndex": 0,
      "utilizationPercent": 75,
      "memoryUsedMb": 4096,
      "memoryTotalMb": 8192,
      "temperatureC": 65
    }
  ],
  "hostInfo": {
    "os": "Linux",
    "kernel": "6.6.87",
    "cpuModel": "AMD Ryzen 7 9700X",
    "cores": 16,
    "arch": "x64",
    "uptime": 17994
  }
}
```

## Response

```json
{ "ok": true, "hostId": "agent-test-1" }
```

## Field Units

| Field | Unit |
|-------|------|
| `cpu` | percent (0-100 × cores) |
| `memory` | MB |
| `disk` | GB |
| `load` | loadavg (1m, 5m, 15m) |
| `network.rx/tx` | cumulative bytes (delta computed server-side) |

## Error Codes

| Status | Meaning |
|--------|---------|
| 401 | Missing/invalid API key |
| 422 | Validation error (schema mismatch) |
| 500 | Server-side persistence failure |

## Reference Agent (Bun)

```ts
// packages/hiai-agent/src/index.ts (sketch)
import { readFile } from "node:fs/promises";
const load = (await readFile("/proc/loadavg", "utf8")).split(" ");
await fetch(`${ENDPOINT}/api/agent/ingest`, {
  method: "POST",
  headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    hostId: HOSTNAME,
    hostStats: { cpu: 0, memory: 0, disk: 0, load: [+load[0], +load[1], +load[2]], network: { rx: 0, tx: 0 } },
    containers: [],
  }),
});
```

## Data Retention

- `host_stats`, `container_stats`, `gpu_stats`: 30 days (configurable via `INFRA_RETENTION_DAYS`)
- Multi-host aggregation: queryable via `?hostId=xxx` on all `/api/infrastructure/*` routes
