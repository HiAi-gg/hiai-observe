# Changelog

## 0.1.0

Initial release.

### Features

- OTLP HTTP JSON export to HiAi Observe `/v1/traces` endpoint
- Configurable batch size and flush interval
- Automatic flush when buffer reaches `batchSize`
- Periodic flush every `flushInterval` ms
- Exponential backoff retry (1s, 2s, 4s) for transient failures
- Auth failure detection (401/403) with no retry
- Request timeout via AbortController
- Configurable `serviceName` for OTLP resource attributes (default: `"mastra-app"`)
- Graceful `shutdown()` that flushes remaining spans and stops the interval
- Mastra span to OTLP span conversion with attribute and event mapping

### Peer Dependencies

- `@mastra/core` >= 1.36.0
