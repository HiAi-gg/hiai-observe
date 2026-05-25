# @hiai-observe/mastra-exporter

Mastra-compatible observability exporter that sends traces to [HiAi Observe](https://github.com/Gitlawb/hiai-observe).

## Installation

```bash
bun add @hiai-observe/mastra-exporter
```

## Usage

```ts
import { Mastra } from "@mastra/core";
import { HiaiObserveExporter } from "@hiai-observe/mastra-exporter";

const mastra = new Mastra({
  observability: {
    exporters: [
      new HiaiObserveExporter({
        endpoint: "http://localhost:8001",
        apiKey: process.env.HIAI_OBSERVE_API_KEY,
      }),
    ],
  },
});
```

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `endpoint` | `string` | *required* | HiAi Observe server URL |
| `apiKey` | `string` | *required* | API key for authentication |
| `serviceName` | `string` | `"mastra-app"` | Service name in OTLP resource attributes |
| `batchSize` | `number` | `100` | Spans to buffer before auto-flush |
| `flushInterval` | `number` | `5000` | Flush interval in ms |
| `timeout` | `number` | `10000` | Request timeout in ms |
| `maxRetries` | `number` | `3` | Max retries per flush |

## How It Works

1. Spans are buffered in memory up to `batchSize`
2. Buffer is flushed automatically every `flushInterval` ms
3. Flush also triggers when buffer reaches `batchSize`
4. Failed flushes retry with exponential backoff (1s, 2s, 4s)
5. Auth failures (401/403) are not retried

## Manual Flush

```ts
const exporter = new HiaiObserveExporter({ ... });

// Force flush all buffered spans
await exporter.flush();

// Graceful shutdown (flush remaining + stop interval)
await exporter.shutdown();
```

## License

MIT
