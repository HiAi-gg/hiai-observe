# HiAi Observe — API Reference

Base URL: `http://localhost:8001`

Authentication: Bearer token or Basic auth (`apikey:`) in `Authorization` header, or `X-Api-Key` header. Some endpoints require a valid project API key; others are unauthenticated.

---

## Table of Contents

### Core
1. [Health](#health)
2. [Sentry-Compatible Ingestion](#sentry-compatible-ingestion)

### Data — Issues & Events
3. [Issues](#issues)
4. [Events](#events)

### Data — Uptime & Infrastructure
5. [Uptime Monitors](#uptime-monitors)
6. [Status Pages](#status-pages)
7. [Infrastructure](#infrastructure)

### Data — Logs, Traces & Telemetry
8. [Logs](#logs)
9. [OpenTelemetry (OTLP)](#opentelemetry-otlp)
10. [Traces](#traces)

### Configuration & Operations
11. [Alerts](#alerts)
12. [Maintenance Windows](#maintenance-windows)
13. [Incidents](#incidents)
14. [Notification Config (B.12)](#notification-config-b12)
15. [Team (B.3)](#team-b3)

### Search & Utilities
16. [Search (B.4)](#search-b4)
17. [Saved Searches (B.5)](#saved-searches-b5)
18. [Comments (B.11)](#comments-b11)

### Export & Agent Ingest
19. [Export (B.13a)](#export-b13a)
20. [Agent Ingest (B.13b)](#agent-ingest-b13b)

### Project Management
21. [Projects (B.1)](#projects-b1)
22. [Dashboard (B.2)](#dashboard-b2)
23. [Releases (B.6)](#releases-b6)

### Admin
24. [Admin](#admin)
25. [WebSocket Authentication](#websocket-authentication)
26. [Tenant Health (Wave 4 OBS2.3c)](#tenant-health-wave-4-obs23c)
27. [Admin Bridge (Wave 4 OBS2.4)](#admin-bridge-wave-4-obs24)

### Embed & Static Assets
28. [Embed (Wave 4 OBS2.4)](#embed-wave-4-obs24)
29. [Source Maps (B.7)](#source-maps-b7)
30. [Badges (B.8)](#badges-b8)

### Custom Rules
31. [Fingerprint Rules (B.9)](#fingerprint-rules-b9)
32. [Subscribers (B.10)](#subscribers-b10)
33. [Logs Download (Wave 5 W5.4)](#logs-download-wave-5-w54)

### API Metadata
34. [OpenAPI Specification](#openapi-specification)

---

## Health

### GET /health

Unauthenticated health check.

**Response:**
```json
{ "status": "ok", "version": "0.1.0", "uptime": 12345 }
```

```bash
curl http://localhost:8001/health
```

---

## Sentry-Compatible Ingestion

### POST /api/:projectId/store

Accepts a Sentry SDK event payload (JSON body). Drop-in replacement for Sentry's `/store/` endpoint.

**Auth:** API key matching `projectId` (Bearer, Basic, or `Sentry sentry_key=...` header)

**Path params:**
- `projectId` (uuid) — target project

**Body:** Sentry event JSON (exception, message, breadcrumbs, user, tags, sdk, etc.)

**Response (200):**
```json
{ "id": "event-uuid" }
```

**Errors:**
- `401` — Invalid API key
- `403` — Key doesn't match project

```bash
curl -X POST http://localhost:8001/api/YOUR_PROJECT_ID/store \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"message":"Something broke","exception":{"values":[{"type":"Error","value":"oops","stacktrace":{"frames":[{"filename":"app.ts","function":"main","lineno":42,"in_app":true}]}}]}}'
```

### POST /api/:projectId/envelope

Accepts Sentry SDK envelope format (SDK v7+). One or more events separated by newline-delimited JSON headers.

**Auth:** Same as `/store`

**Body:** Envelope text (newline-delimited: header line, item header, item payload)

**Response (200):**
```json
{ "id": "event-uuid" }
```
or array if multiple items.

---

## Issues

### GET /api/issues

List issues with filters and pagination.

**Query params:**
- `projectId` (uuid, optional) — filter by project
- `status` (string, optional) — `unresolved`, `resolved`, `ignored`
- `search` (string, optional) — case-insensitive title search
- `limit` (string, optional, default "50", max 200)
- `offset` (string, optional, default "0")

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "projectId": "uuid",
      "title": "TypeError: Cannot read property 'x' of undefined",
      "type": "error",
      "fingerprint": "hash",
      "status": "unresolved",
      "count": 42,
      "firstSeen": "2026-01-01T00:00:00Z",
      "lastSeen": "2026-01-02T00:00:00Z",
      "metadata": {}
    }
  ],
  "total": 100,
  "limit": 50,
  "offset": 0
}
```

```bash
curl "http://localhost:8001/api/issues?status=unresolved&limit=10"
```

### GET /api/issues/:id

Issue detail with 5 most recent events.

**Path params:**
- `id` (uuid)

**Response (200):** Issue object + `events` array
**Response (404):** `{ "error": "Issue not found" }`

```bash
curl http://localhost:8001/api/issues/ISSUE_UUID
```

### PATCH /api/issues/:id

Update issue status.

**Body:**
```json
{ "status": "resolved" }
```
Valid statuses: `unresolved`, `resolved`, `ignored`

**Response (200):** Updated issue object
**Response (400):** Invalid status
**Response (404):** Issue not found

```bash
curl -X PATCH http://localhost:8001/api/issues/ISSUE_UUID \
  -H "Content-Type: application/json" \
  -d '{"status":"resolved"}'
```

### DELETE /api/issues/:id

Delete issue and all associated events.

**Response (200):** `{ "deleted": true }`
**Response (404):** Issue not found

```bash
curl -X DELETE http://localhost:8001/api/issues/ISSUE_UUID
```

### POST /api/issues/merge

Merge one or more **source** issues into a **target** issue. All events from the sources are re-pointed to the target, the target's `count` is recomputed, and the source rows are deleted — all inside a single transaction. Returns `400` if the target appears in `sourceIssueIds` (cannot merge an issue with itself), `404` if any source or the target is missing.

**Body:**
```json
{
  "targetIssueId": "TARGET_UUID",
  "sourceIssueIds": ["SOURCE_UUID_1", "SOURCE_UUID_2"]
}
```
- `targetIssueId` (uuid, required) — issue that absorbs the events
- `sourceIssueIds` (uuid[], required, minItems 1) — issues to merge into the target and then delete

**Response (200):**
```json
{
  "merged": 2,
  "targetIssueId": "TARGET_UUID",
  "totalEvents": 47
}
```

**Response (400):** `{ "error": "Cannot merge issue with itself" }`
**Response (404):** `{ "error": "Target issue not found" }` or `{ "error": "Source issue <id> not found" }`

```bash
curl -X POST http://localhost:8001/api/issues/merge \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"targetIssueId":"TARGET_UUID","sourceIssueIds":["SOURCE_UUID_1","SOURCE_UUID_2"]}'
```

---

## Events

### GET /api/events

List events with filters and pagination.

**Query params:**
- `issueId` (uuid, optional) — filter by issue
- `projectId` (uuid, optional) — filter by project
- `limit` (string, optional, default "50", max 200)
- `offset` (string, optional, default "0")

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "issueId": "uuid",
      "projectId": "uuid",
      "message": "Something broke",
      "exceptionType": "TypeError",
      "stackTrace": "[{\"filename\":\"app.ts\",...}]",
      "level": "error",
      "tags": { "environment": "production" },
      "context": {},
      "fingerprint": "hash",
      "sdk": "@sentry/node@8.0.0",
      "createdAt": "2026-01-01T00:00:00Z"
    }
  ],
  "total": 50,
  "limit": 50,
  "offset": 0
}
```

```bash
curl "http://localhost:8001/api/events?issueId=ISSUE_UUID&limit=5"
```

### GET /api/events/:id

Full event detail.

**Response (200):** Complete event object
**Response (404):** Event not found

```bash
curl http://localhost:8001/api/events/EVENT_UUID
```

---

## Uptime Monitors

### GET /api/monitors

List all monitors with current status and 24h uptime percentage.

**Query params:**
- `project_id` (string, optional) — filter by project

**Response:**
```json
{
  "monitors": [
    {
      "id": "uuid",
      "projectId": "uuid",
      "name": "API Health",
      "url": "https://api.example.com/health",
      "intervalSeconds": 60,
      "active": true,
      "createdAt": "2026-01-01T00:00:00Z",
      "uptime24h": 99.95
    }
  ]
}
```

```bash
curl http://localhost:8001/api/monitors
```

### GET /api/monitors/groups

List distinct monitor-group names available for a project. Useful for the status-page and dashboard filter chips. Returns `{ "groups": [...] }` where each entry is the raw `monitor_group` string stored on the monitor row.

**Query params:**
- `project_id` (string, optional) — filter by project
- `tenantId` (string, optional) — alias for `project_id` resolved by the tenant-scope plugin

**Response (200):**
```json
{
  "groups": ["production", "staging", "internal"]
}
```

```bash
curl "http://localhost:8001/api/monitors/groups?project_id=PROJECT_UUID" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### GET /api/monitors/:id

Monitor detail with latest check.

**Response (200):** Monitor object + `latestCheck` + `uptime24h`
**Response (404):** Monitor not found

```bash
curl http://localhost:8001/api/monitors/MONITOR_UUID
```

### POST /api/monitors

Create a new uptime monitor.

**Body:**
```json
{
  "name": "API Health",
  "url": "https://api.example.com/health",
  "interval_seconds": 60,
  "project_id": "PROJECT_UUID"
}
```
- `name` (string, required, min 1)
- `url` (string, required, valid URI)
- `interval_seconds` (number, optional, min 10, default 60)
- `project_id` (string, required)

**Response (200):** Created monitor object
**Response (400):** Validation error

```bash
curl -X POST http://localhost:8001/api/monitors \
  -H "Content-Type: application/json" \
  -d '{"name":"API Health","url":"https://api.example.com/health","interval_seconds":30,"project_id":"PROJECT_UUID"}'
```

### PUT /api/monitors/:id

Update a monitor.

**Body (all optional):**
```json
{
  "name": "New Name",
  "url": "https://new-url.com/health",
  "interval_seconds": 120,
  "active": false
}
```

**Response (200):** Updated monitor object

```bash
curl -X PUT http://localhost:8001/api/monitors/MONITOR_UUID \
  -H "Content-Type: application/json" \
  -d '{"active":false}'
```

### DELETE /api/monitors/:id

Delete monitor and all its check history.

**Response (200):** `{ "deleted": true }`

```bash
curl -X DELETE http://localhost:8001/api/monitors/MONITOR_UUID
```

### GET /api/monitors/:id/checks

Check history with pagination and time range filtering.

**Query params:**
- `limit` (number, optional, 1-200)
- `offset` (number, optional, min 0)
- `from` (ISO datetime, optional)
- `to` (ISO datetime, optional)

**Response:**
```json
{
  "checks": [
    {
      "id": "uuid",
      "monitorId": "uuid",
      "statusCode": 200,
      "responseTimeMs": 145,
      "error": null,
      "success": true,
      "checkedAt": "2026-01-01T00:00:00Z"
    }
  ],
  "total": 1440,
  "limit": 50,
  "offset": 0
}
```

```bash
curl "http://localhost:8001/api/monitors/MONITOR_UUID/checks?limit=10&from=2026-01-01T00:00:00Z"
```

---

## Status Pages

### GET /api/status/:slug

Public status page for a project.

**Path params:**
- `slug` (string) — project slug

**Response (200):**
```json
{
  "project": { "id": "uuid", "name": "My Project", "slug": "my-project" },
  "overall": "operational",
  "monitors": [
    {
      "id": "uuid",
      "name": "API Health",
      "url": "https://api.example.com/health",
      "active": true,
      "uptime24h": 99.95,
      "lastCheck": { "success": true, "statusCode": 200, "responseTimeMs": 145 }
    }
  ]
}
```
`overall` values: `operational`, `degraded`, `down`

**Response (404):** Status page not found

```bash
curl http://localhost:8001/api/status/my-project
```

### GET /api/status/:slug/history

30-day uptime history per monitor.

**Query params:**
- `days` (number, optional, 1-90, default 30)

**Response:**
```json
{
  "history": [
    { "monitorId": "uuid", "name": "API Health", "uptimePercent": 99.99 }
  ]
}
```

```bash
curl "http://localhost:8001/api/status/my-project/history?days=7"
```

---

## Infrastructure

### GET /api/infrastructure/containers

Current Docker container stats (live collection).

**Response (200):**
```json
{
  "containers": [
    {
      "id": "abc123",
      "name": "my-app",
      "image": "node:20-alpine",
      "cpu_percent": 2.5,
      "memory_usage_mb": 128.4,
      "memory_limit_mb": 512.0,
      "network_rx_bytes": 1024000,
      "network_tx_bytes": 512000,
      "block_read_bytes": 0,
      "block_write_bytes": 0,
      "status": "running",
      "uptime_seconds": 86400
    }
  ],
  "count": 5
}
```

**Response (503):** Docker unavailable

```bash
curl http://localhost:8001/api/infrastructure/containers
```

### GET /api/infrastructure/containers/:id

Container stats history from DB.

**Query params:**
- `from` (ISO datetime, optional, default 1h ago)
- `to` (ISO datetime, optional, default now)

**Response:**
```json
{
  "containerId": "abc123",
  "stats": [...],
  "count": 120
}
```

```bash
curl "http://localhost:8001/api/infrastructure/containers/abc123?from=2026-01-01T00:00:00Z"
```

### GET /api/infrastructure/host

Current host resource usage (live collection).

**Response (200):**
```json
{
  "cpu_percent": 15.3,
  "memory_used_mb": 2048.5,
  "memory_total_mb": 8192.0,
  "memory_available_mb": 6143.5,
  "disk_used_gb": 45.2,
  "disk_total_gb": 100.0,
  "load_avg_1m": 0.75,
  "load_avg_5m": 0.50,
  "load_avg_15m": 0.40
}
```

**Response (503):** Host stats unavailable

```bash
curl http://localhost:8001/api/infrastructure/host
```

### GET /api/infrastructure/host/history

Host stats over time range from DB.

**Query params:**
- `from` (ISO datetime, optional, default 1h ago)
- `to` (ISO datetime, optional, default now)

**Response:**
```json
{
  "stats": [...],
  "count": 120
}
```

```bash
curl "http://localhost:8001/api/infrastructure/host/history?from=2026-01-01T00:00:00Z"
```

### GET /api/infrastructure/overview

Combined container + host summary.

**Response:**
```json
{
  "containers": {
    "current": [...],
    "count": 5,
    "historical": 100
  },
  "host": {
    "current": { ... },
    "historical": { ... }
  }
}
```

```bash
curl http://localhost:8001/api/infrastructure/overview
```

### GET /api/infrastructure/hosts

List every host known to the multi-host collector (resolves from the `host_info` table populated by `POST /api/agent/ingest`).

**Response (200):**
```json
{
  "hosts": [
    {
      "id": "host-01",
      "hostname": "node-01.eu-west-1",
      "os": "Ubuntu 24.04",
      "kernel": "6.8.0-31-generic",
      "cpuModel": "AMD EPYC 7763 64-Core",
      "cores": 64,
      "arch": "x86_64",
      "uptime": 86400,
      "lastSeen": "2026-06-27T12:00:00Z"
    }
  ],
  "count": 3
}
```

```bash
curl http://localhost:8001/api/infrastructure/hosts
```

---

## Logs

### GET /api/logs

Search logs with filters.

**Query params:**
- `container` (string, optional) — filter by container ID
- `level` (string, optional) — filter by level (error, warn, info, debug)
- `search` (string, optional) — full-text search on message
- `from` (ISO datetime, optional)
- `to` (ISO datetime, optional)
- `limit` (number, optional, default 100)
- `offset` (number, optional, default 0)

**Response:**
```json
{
  "data": {
    "logs": [
      {
        "id": "uuid",
        "containerId": "abc123",
        "containerName": "my-app",
        "stream": "stdout",
        "message": "Server started on port 3000",
        "level": "info",
        "timestamp": "2026-01-01T00:00:00Z",
        "raw": {}
      }
    ],
    "total": 5000,
    "limit": 100,
    "offset": 0
  }
}
```

```bash
curl "http://localhost:8001/api/logs?container=abc123&level=error&limit=20"
```

### GET /api/logs/containers

List containers with log availability.

**Response:**
```json
{
  "data": [
    {
      "containerId": "abc123",
      "containerName": "my-app",
      "count": 5000,
      "latest": "2026-01-02T00:00:00Z"
    }
  ]
}
```

```bash
curl http://localhost:8001/api/logs/containers
```

### GET /api/logs/stats

Aggregate log statistics over the last 24 hours: total count, breakdown by `level`, top 10 containers by volume, and an hourly timeline. All four queries are run in parallel against the `logs` table.

**Auth:** API key

**Response:**
```json
{
  "total24h": 12450,
  "byLevel": { "info": 8200, "warn": 3100, "error": 1150 },
  "byContainer": [
    { "name": "api", "count": 7800 },
    { "name": "worker", "count": 3200 }
  ],
  "byHour": [
    { "hour": "2026-01-02 13:00:00+00", "count": 520 },
    { "hour": "2026-01-02 14:00:00+00", "count": 612 }
  ]
}
```

```bash
curl http://localhost:8001/api/logs/stats \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### GET /api/logs/volume

Time-bucketed log volume for graphing. Buckets are produced by the store's `getLogVolume()` helper (default interval `1h`) and can be filtered by container and an explicit time range.

**Auth:** API key

**Query params:**
- `interval` (string, optional, default `"1h"`) — bucket size (e.g. `1m`, `5m`, `1h`, `1d`)
- `containerId` (string, optional) — filter by container ID
- `from` (ISO datetime, optional) — lower bound
- `to` (ISO datetime, optional) — upper bound

**Response:**
```json
{
  "data": [
    { "bucket": "2026-01-02T13:00:00Z", "count": 520 },
    { "bucket": "2026-01-02T14:00:00Z", "count": 612 }
  ]
}
```

```bash
curl "http://localhost:8001/api/logs/volume?interval=1h&from=2026-01-01T00:00:00Z" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### DELETE /api/logs

Clear stored logs.

**Query params:**
- `before` (ISO datetime, optional) — clear only logs before this time

**Response:**
```json
{ "deleted": 5000 }
```

```bash
curl -X DELETE "http://localhost:8001/api/logs?before=2026-01-01T00:00:00Z"
```

### WS /ws/logs

WebSocket for real-time log streaming.

**Connect:** `ws://localhost:8001/ws/logs`

**Send (JSON):**
```json
{ "action": "subscribe", "containerId": "abc123" }
```
```json
{ "action": "subscribe_all" }
```
```json
{ "action": "unsubscribe" }
```

**Receive (JSON):**
```json
{ "type": "log", "data": { "container_id": "abc123", "message": "...", "stream": "stdout", "timestamp": "..." } }
```
```json
{ "type": "recent", "data": [...] }
```
```json
{ "type": "ping" }
```

```javascript
const ws = new WebSocket("ws://localhost:8001/ws/logs");
ws.onopen = () => ws.send(JSON.stringify({ action: "subscribe_all" }));
ws.onmessage = (e) => console.log(JSON.parse(e.data));
```

---

## OpenTelemetry (OTLP)

### POST /v1/traces

OTLP HTTP trace export. Accepts both standard OpenTelemetry `resourceSpans` JSON payload and OTLP protobuf binary frames.

**Auth:** Bearer token, Basic auth, or `X-Api-Key` header (project API key)

**Content-Type:** `application/json` (default) or `application/x-protobuf` (binary OTLP wire format)

**Body:**
```json
{
  "resourceSpans": [
    {
      "resource": {
        "attributes": [{ "key": "service.name", "value": { "stringValue": "my-app" } }]
      },
      "scopeSpans": [
        {
          "spans": [
            {
              "traceId": "abc123...",
              "spanId": "def456...",
              "name": "GET /api/users",
              "kind": "SPAN_KIND_SERVER",
              "startTimeUnixNano": "1700000000000000000",
              "endTimeUnixNano": "1700000000100000000",
              "attributes": [],
              "status": { "code": "STATUS_CODE_OK" }
            }
          ]
        }
      ]
    }
  ]
}
```

**Response (200):** `{}` (empty, per OTLP spec)
**Response (400):** No resourceSpans
**Response (401):** Missing API key
**Response (403):** Invalid API key

```bash
curl -X POST http://localhost:8001/v1/traces \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"resourceSpans":[{"scopeSpans":[{"spans":[{"traceId":"abc","spanId":"def","name":"test","kind":"SPAN_KIND_INTERNAL","startTimeUnixNano":"1700000000000000000","endTimeUnixNano":"1700000000100000000"}]}]}]}'
```

For protobuf, send raw OTLP binary with `Content-Type: application/x-protobuf`:

```bash
curl -X POST http://localhost:8001/v1/traces \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/x-protobuf" \
  --data-binary @trace.bin
```

### POST /v1/metrics

OTLP HTTP metrics export. Accepts JSON or protobuf (`application/x-protobuf`).

**Auth:** Same as `/v1/traces`

**Body:**
```json
{
  "resourceMetrics": [...]
}
```

**Response (200):** `{}`

### POST /v1/logs

OTLP HTTP logs export. Accepts JSON or protobuf (`application/x-protobuf`).

**Auth:** Same as `/v1/traces` — Bearer token, Basic auth, or `X-Api-Key` header.

**Content-Type:** `application/json` (default) or `application/x-protobuf` (binary OTLP wire format). Also accepts `application/protobuf` and `application/json+protobuf` aliases.

**Body (JSON):**
```json
{
  "resourceLogs": [
    {
      "resource": {
        "attributes": [
          { "key": "service.name", "value": { "stringValue": "my-app" } },
          { "key": "service.instance.id", "value": { "stringValue": "pod-abc" } }
        ]
      },
      "scopeLogs": [
        {
          "scope": { "name": "my-logger", "version": "1.0.0" },
          "logRecords": [
            {
              "timeUnixNano": "1700000000000000000",
              "severityNumber": 9,
              "severityText": "INFO",
              "body": { "stringValue": "user logged in" },
              "attributes": [
                { "key": "user.id", "value": { "stringValue": "alice" } }
              ],
              "traceId": "abc123def456...",
              "spanId": "def456..."
            }
          ]
        }
      ]
    }
  ]
}
```

**Field mapping (OTLP → `logs` table):**
- `body` → `message` (stringified when body is not a string)
- `severityText` → `level` (falls back to a `severityNumber` → text map: TRACE / DEBUG / INFO / WARN / ERROR / FATAL)
- `timeUnixNano` → `timestamp` (converted from ns; `observedTimeUnixNano` is the fallback)
- `service.instance.id` (resource attr) → `containerId` (falls back to `service.namespace` then `otlp`)
- `service.name` (resource attr) → `containerName` (falls back to `otlp`)
- `stream` is set to `otel` to distinguish OTLP rows from Docker worker rows (`stdout`/`stderr`)
- The full OTLP envelope (body, severity, attributes, resource, scope, traceId, spanId, observedTimeUnixNano) is preserved in the `raw` JSONB column

**Response (200):** `{}` (empty, per OTLP spec)
**Response (400):** Invalid payload / no resourceLogs
**Response (401):** Missing API key
**Response (403):** Invalid API key
**Response (413):** Body exceeds 5 MB

```bash
curl -X POST http://localhost:8001/v1/logs \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"resourceLogs":[{"resource":{"attributes":[{"key":"service.name","value":{"stringValue":"my-app"}}]},"scopeLogs":[{"logRecords":[{"timeUnixNano":"1700000000000000000","severityText":"INFO","body":{"stringValue":"hello"}}]}]}]}'
```

For protobuf, send raw OTLP binary with `Content-Type: application/x-protobuf`:

```bash
curl -X POST http://localhost:8001/v1/logs \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/x-protobuf" \
  --data-binary @logs.bin
```

OTLP rows are visible through the existing `/api/logs` endpoints alongside Docker container logs; filter by `stream=otel` or by `containerName` (your `service.name`) to isolate them.

---

## Traces

### GET /api/traces

List traces with filters.

**Query params:**
- `projectId` (string, optional)
- `traceId` (string, optional)
- `workflowName` (string, optional) — filter by Mastra workflow
- `agentName` (string, optional) — filter by Mastra agent
- `status` (string, optional)
- `from` (ISO datetime, optional)
- `to` (ISO datetime, optional)
- `limit` (string, optional, default "50", max 200)
- `offset` (string, optional, default "0")

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "traceId": "abc123",
      "spanId": "def456",
      "name": "generate-article",
      "kind": "INTERNAL",
      "status": "ok",
      "durationMs": 1500,
      "attributes": { "mastra.workflow": "generate-article" },
      "createdAt": "2026-01-01T00:00:00Z"
    }
  ],
  "total": 100,
  "limit": 50,
  "offset": 0
}
```

```bash
curl "http://localhost:8001/api/traces?workflowName=generate-article&limit=10"
```

### GET /api/traces/stats

Aggregated stats (token usage + latency percentiles).

**Query params:**
- `projectId` (string, required)
- `from` (ISO datetime, optional)
- `to` (ISO datetime, optional)
- `groupBy` (string, optional, default "model") — `model`, `agent`, `workflow`

**Response:**
```json
{
  "tokenUsage": {
    "byModel": [
      { "model": "gpt-4o", "promptTokens": 10000, "completionTokens": 5000, "totalTokens": 15000, "estimatedCost": 0.15 }
    ]
  },
  "latency": {
    "p50": 200,
    "p95": 800,
    "p99": 1500,
    "totalRuns": 500
  }
}
```

```bash
curl "http://localhost:8001/api/traces/stats?projectId=PROJECT_UUID&groupBy=model"
```

### GET /api/traces/workflows

List workflow runs.

**Query params:**
- `projectId` (string, optional)
- `workflowName` (string, optional)
- `status` (string, optional)
- `limit` (string, optional, default "50")
- `offset` (string, optional, default "0")

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "traceId": "abc123",
      "name": "generate-article",
      "kind": "INTERNAL",
      "status": "ok",
      "durationMs": 1500,
      "attributes": {},
      "createdAt": "2026-01-01T00:00:00Z"
    }
  ],
  "total": 50,
  "limit": 50,
  "offset": 0
}
```

```bash
curl "http://localhost:8001/api/traces/workflows?workflowName=generate-article"
```

### GET /api/traces/workflows/:id

Workflow run detail with full span tree.

**Response:** Full trace detail with all spans in the workflow

```bash
curl http://localhost:8001/api/traces/workflows/UUID
```

---

## Alerts

### GET /api/alerts

List alert rules.

**Query params:**
- `projectId` (string, optional)
- `search` (string, optional) — case-insensitive name search
- `limit` (string, optional, default "50")
- `offset` (string, optional, default "0")

**Response:**
```json
{
  "items": [
    {
      "id": "uuid",
      "projectId": "uuid",
      "name": "High Error Rate",
      "condition": { "type": "error_rate", "operator": "gt", "threshold": 10, "duration": 300 },
      "channels": [{ "type": "telegram", "target": "CHAT_ID" }],
      "isActive": true,
      "cooldownSeconds": 300,
      "lastTriggered": null,
      "createdAt": "2026-01-01T00:00:00Z"
    }
  ],
  "total": 5,
  "limit": 50,
  "offset": 0
}
```

```bash
curl http://localhost:8001/api/alerts
```

### GET /api/alerts/:id

Alert detail with recent history (last 20 triggers).

**Response:** Alert object + `history` array

```bash
curl http://localhost:8001/api/alerts/ALERT_UUID
```

### POST /api/alerts

Create alert rule.

**Body:**
```json
{
  "name": "High Error Rate",
  "projectId": "PROJECT_UUID",
  "condition": {
    "type": "error_rate",
    "operator": "gt",
    "threshold": 10,
    "duration": 300
  },
  "channels": [
    { "type": "telegram", "target": "CHAT_ID" },
    { "type": "discord", "target": "WEBHOOK_URL" },
    { "type": "email", "target": "admin@example.com" }
  ],
  "cooldownSeconds": 300
}
```

Condition types: `error_rate`, `uptime_down`, `resource_threshold`, `trace_error`, `token_usage`
Operators: `gt`, `lt`, `eq`, `gte`, `lte`
Channel types: `telegram`, `discord`, `email`

**Response (200):** Created alert object

```bash
curl -X POST http://localhost:8001/api/alerts \
  -H "Content-Type: application/json" \
  -d '{"name":"High Error Rate","projectId":"PROJECT_UUID","condition":{"type":"error_rate","operator":"gt","threshold":10},"channels":[{"type":"telegram","target":"CHAT_ID"}]}'
```

### PUT /api/alerts/:id

Update alert rule (partial update).

**Body (all optional):**
```json
{
  "name": "New Name",
  "condition": { ... },
  "channels": [ ... ],
  "isActive": false,
  "cooldownSeconds": 600
}
```

**Response (200):** Updated alert object

```bash
curl -X PUT http://localhost:8001/api/alerts/ALERT_UUID \
  -H "Content-Type: application/json" \
  -d '{"isActive":false}'
```

### DELETE /api/alerts/:id

Delete alert rule and its history.

**Response (200):** `{ "deleted": true }`

```bash
curl -X DELETE http://localhost:8001/api/alerts/ALERT_UUID
```

### POST /api/alerts/:id/test

Test alert — sends to all configured channels regardless of cooldown.

**Response (200):** Dispatch result with per-channel delivery status

```bash
curl -X POST http://localhost:8001/api/alerts/ALERT_UUID/test
```

### GET /api/alerts/history

Alert trigger history.

**Query params:**
- `alertId` (string, optional) — filter by alert
- `limit` (string, optional, default "50")
- `offset` (string, optional, default "0")

**Response:**
```json
{
  "items": [
    {
      "id": "uuid",
      "alertId": "uuid",
      "triggeredAt": "2026-01-01T00:00:00Z",
      "resolvedAt": null,
      "context": { "condition": { ... }, "result": { "currentValue": 15, "threshold": 10 } }
    }
  ],
  "total": 10,
  "limit": 50,
  "offset": 0
}
```

```bash
curl "http://localhost:8001/api/alerts/history?alertId=ALERT_UUID&limit=10"
```

### GET /api/alerts/channels

List all available notification channel types with their configuration schema and the current `configured` state (derived from the matching env var in `src/lib/config.ts`). Designed to drive the alert-rule editor UI without hard-coding channel lists client-side.

**Auth:** API key

**Response:**
```json
{
  "channels": [
    {
      "type": "telegram",
      "name": "Telegram",
      "description": "Send alerts via Telegram Bot API",
      "configFields": [
        { "key": "botToken", "label": "Bot Token", "envVar": "TELEGRAM_BOT_TOKEN", "required": true },
        { "key": "chatId", "label": "Chat ID", "envVar": "TELEGRAM_CHAT_ID", "required": true }
      ],
      "configured": true
    }
  ]
}
```

`configured` is `true` when the required env vars for a channel are present at server boot. Channel types: `telegram`, `discord`, `email`, `slack`, `webhook`, `pagerduty`, `teams`, `ntfy`, `gotify`, `pushover`.

```bash
curl http://localhost:8001/api/alerts/channels \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### POST /api/alerts/test-all

Iterate over every **active** alert (`isActive = true`) and dispatch a test notification through each one. Returns per-alert delivery results in the same shape as `POST /api/alerts/:id/test`.

**Auth:** API key

**Response (200):**
```json
{
  "message": "Tested 3 alert(s)",
  "results": [
    { "id": "uuid", "name": "High Error Rate", "ok": true, "results": [{ "channel": "telegram", "ok": true }] }
  ]
}
```

**Response (200, empty):** `{ "message": "No active alerts to test", "results": [] }`

**Response (500):** `{ "error": "Failed to test alerts" }` (only emitted when the dispatch loop itself throws; per-alert failures stay inside `results`).

```bash
curl -X POST http://localhost:8001/api/alerts/test-all \
  -H "Authorization: Bearer YOUR_API_KEY"
```

---

## Maintenance Windows

### GET /api/maintenance

List maintenance windows with optional filtering.

**Query params:**
- `projectId` (string, optional) — filter by project
- `status` (string, optional) — `active`, `upcoming`, `past`
- `limit` (string, optional, default "50")
- `offset` (string, optional, default "0")

**Response:**
```json
{
  "items": [
    {
      "id": "uuid",
      "projectId": "uuid",
      "name": "Database upgrade",
      "description": "Upgrading to PostgreSQL 18",
      "startsAt": "2026-01-15T02:00:00Z",
      "endsAt": "2026-01-15T04:00:00Z",
      "monitorIds": ["monitor-uuid-1", "monitor-uuid-2"],
      "createdAt": "2026-01-10T00:00:00Z"
    }
  ],
  "total": 5,
  "limit": 50,
  "offset": 0
}
```

```bash
curl "http://localhost:8001/api/maintenance?status=active"
```

### GET /api/maintenance/active/now

Get currently active maintenance windows.

**Query params:**
- `projectId` (string, optional) — filter by project

**Response:**
```json
{
  "items": [...]
}
```

```bash
curl http://localhost:8001/api/maintenance/active/now
```

### GET /api/maintenance/:id

Get single maintenance window.

**Response (200):** Maintenance window object
**Response (404):** `{ "error": "Maintenance window not found" }`

```bash
curl http://localhost:8001/api/maintenance/WINDOW_UUID
```

### POST /api/maintenance

Create a maintenance window.

**Body:**
```json
{
  "projectId": "PROJECT_UUID",
  "name": "Database upgrade",
  "description": "Upgrading to PostgreSQL 18",
  "startsAt": "2026-01-15T02:00:00Z",
  "endsAt": "2026-01-15T04:00:00Z",
  "monitorIds": ["monitor-uuid-1"]
}
```
- `projectId` (string, required)
- `name` (string, required, min 1)
- `description` (string, optional)
- `startsAt` (string, required, ISO datetime)
- `endsAt` (string, required, ISO datetime, must be after startsAt)
- `monitorIds` (array of strings, optional) — empty = suppresses all alerts for project

**Response (200):** Created maintenance window
**Response (400):** Validation error

```bash
curl -X POST http://localhost:8001/api/maintenance \
  -H "Content-Type: application/json" \
  -d '{"projectId":"PROJECT_UUID","name":"DB upgrade","startsAt":"2026-01-15T02:00:00Z","endsAt":"2026-01-15T04:00:00Z"}'
```

### PUT /api/maintenance/:id

Update a maintenance window (partial update).

**Body (all optional):**
```json
{
  "name": "New name",
  "description": "Updated description",
  "startsAt": "2026-01-15T03:00:00Z",
  "endsAt": "2026-01-15T05:00:00Z",
  "monitorIds": ["monitor-uuid-1", "monitor-uuid-3"]
}
```

**Response (200):** Updated maintenance window
**Response (404):** Not found

```bash
curl -X PUT http://localhost:8001/api/maintenance/WINDOW_UUID \
  -H "Content-Type: application/json" \
  -d '{"name":"Extended maintenance"}'
```

### DELETE /api/maintenance/:id

Delete a maintenance window.

**Response (200):** `{ "deleted": true }`
**Response (404):** Not found

```bash
curl -X DELETE http://localhost:8001/api/maintenance/WINDOW_UUID
```

---

## Incidents

### GET /api/incidents

List incidents with optional filtering.

**Query params:**
- `projectId` (string, optional) — filter by project
- `status` (string, optional) — `investigating`, `identified`, `monitoring`, `resolved`
- `limit` (string, optional, default "50")
- `offset` (string, optional, default "0")

**Response:**
```json
{
  "items": [
    {
      "id": "uuid",
      "projectId": "uuid",
      "monitorId": "uuid",
      "title": "API response time degradation",
      "status": "investigating",
      "createdAt": "2026-01-15T10:00:00Z",
      "updatedAt": "2026-01-15T10:30:00Z",
      "resolvedAt": null
    }
  ],
  "total": 3,
  "limit": 50,
  "offset": 0
}
```

```bash
curl "http://localhost:8001/api/incidents?status=investigating"
```

### GET /api/incidents/active

Get active (non-resolved) incidents.

**Query params:**
- `projectId` (string, optional) — filter by project

**Response:**
```json
{
  "items": [...]
}
```

```bash
curl http://localhost:8001/api/incidents/active
```

### GET /api/incidents/:id

Get single incident.

**Response (200):** Incident object
**Response (404):** `{ "error": "Incident not found" }`

```bash
curl http://localhost:8001/api/incidents/INCIDENT_UUID
```

### POST /api/incidents

Create an incident.

**Body:**
```json
{
  "projectId": "PROJECT_UUID",
  "monitorId": "MONITOR_UUID",
  "title": "API response time degradation",
  "status": "investigating"
}
```
- `projectId` (string, required)
- `monitorId` (string, optional) — associated monitor
- `title` (string, required, min 1)
- `status` (string, optional, default "investigating") — one of: `investigating`, `identified`, `monitoring`, `resolved`

**Response (200):** Created incident

```bash
curl -X POST http://localhost:8001/api/incidents \
  -H "Content-Type: application/json" \
  -d '{"projectId":"PROJECT_UUID","title":"API degradation"}'
```

### PUT /api/incidents/:id

Update incident status or title. Status transitions are validated:
- `investigating` -> `identified`, `monitoring`, `resolved`
- `identified` -> `investigating`, `monitoring`, `resolved`
- `monitoring` -> `investigating`, `identified`, `resolved`
- `resolved` -> (terminal, no transitions)

**Body (all optional):**
```json
{
  "title": "Updated title",
  "status": "identified",
  "monitorId": "MONITOR_UUID"
}
```

**Response (200):** Updated incident
**Response (400):** Invalid status transition
**Response (404):** Not found

```bash
curl -X PUT http://localhost:8001/api/incidents/INCIDENT_UUID \
  -H "Content-Type: application/json" \
  -d '{"status":"resolved"}'
```

### DELETE /api/incidents/:id

Delete an incident.

**Response (200):** `{ "deleted": true }`
**Response (404):** Not found

```bash
curl -X DELETE http://localhost:8001/api/incidents/INCIDENT_UUID
```

---

## Admin

### GET /api/admin/retention

Get retention configuration for all tables.

**Auth:** Admin API key (`Authorization: Bearer ADMIN_API_KEY`)

**Response:**
```json
{
  "defaultDays": 30,
  "tables": [
    { "tableName": "events", "retentionDays": 30 },
    { "tableName": "traces", "retentionDays": 30 },
    { "tableName": "logs", "retentionDays": 30 },
    { "tableName": "container_stats", "retentionDays": 30 },
    { "tableName": "host_stats", "retentionDays": 30 },
    { "tableName": "uptime_checks", "retentionDays": 30 },
    { "tableName": "alert_history", "retentionDays": 30 }
  ]
}
```

```bash
curl http://localhost:8001/api/admin/retention \
  -H "Authorization: Bearer ADMIN_API_KEY"
```

### PUT /api/admin/retention/:table

Set retention days for a specific table.

**Auth:** Admin API key

**Body:**
```json
{ "retentionDays": 90 }
```

**Valid tables:** `events`, `traces`, `logs`, `container_stats`, `host_stats`, `uptime_checks`, `alert_history`

**Response (200):**
```json
{ "tableName": "traces", "retentionDays": 90 }
```

```bash
curl -X PUT http://localhost:8001/api/admin/retention/traces \
  -H "Authorization: Bearer ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"retentionDays":90}'
```

### POST /api/admin/cleanup

Trigger immediate retention cleanup.

**Auth:** Admin API key

**Response (200):**
```json
{ "message": "Cleanup complete" }
```

```bash
curl -X POST http://localhost:8001/api/admin/cleanup \
  -H "Authorization: Bearer ADMIN_API_KEY"
```

### GET /api/admin/storage

Per-table on-disk size for every table the retention worker manages (`events`, `traces`, `logs`, `container_stats`, `host_stats`, `uptime_checks`, `alert_history`). Computed via `pg_total_relation_size()` for each table and summed for `totalBytes` / `totalHuman`.

**Auth:** Admin API key

**Response (200):**
```json
{
  "totalBytes": 4294967296,
  "totalHuman": "4.0 GB",
  "tables": [
    { "tableName": "events", "sizeBytes": 2147483648, "sizeHuman": "2.0 GB" },
    { "tableName": "traces", "sizeBytes": 1073741824, "sizeHuman": "1.0 GB" },
    { "tableName": "logs", "sizeBytes": 536870912, "sizeHuman": "512.0 MB" },
    { "tableName": "container_stats", "sizeBytes": 268435456, "sizeHuman": "256.0 MB" },
    { "tableName": "host_stats", "sizeBytes": 134217728, "sizeHuman": "128.0 MB" },
    { "tableName": "uptime_checks", "sizeBytes": 67108864, "sizeHuman": "64.0 MB" },
    { "tableName": "alert_history", "sizeBytes": 67108864, "sizeHuman": "64.0 MB" }
  ]
}
```

Per-table failures (missing relation, DB down) are caught and reported as `sizeBytes: 0, sizeHuman: "unknown"` so the endpoint never fails the whole request. `formatBytes` emits binary units (`B` / `KB` / `MB` / `GB` / `TB`).

```bash
curl http://localhost:8001/api/admin/storage \
  -H "Authorization: Bearer ADMIN_API_KEY"
```

---

## WebSocket Authentication

### WS /ws/logs

WebSocket for real-time log streaming with API key authentication.

**Connect:** `ws://localhost:8001/ws/logs?key=YOUR_API_KEY`

**Authentication methods:**

1. **Query parameter** (recommended): Append `?key=YOUR_API_KEY` to the WebSocket URL
2. **First message**: Send `{ "action": "auth", "key": "YOUR_API_KEY" }` as the first message

If no API key is provided in the query parameter, the server sends `{ "type": "auth_required" }` and waits for an auth message. Unauthenticated connections are closed with code 4001.

**After authentication:**

**Send (JSON):**
```json
{ "action": "subscribe", "containerId": "abc123" }
```
```json
{ "action": "subscribe_all" }
```
```json
{ "action": "unsubscribe" }
```

**Receive (JSON):**
```json
{ "type": "authenticated", "projectId": "uuid" }
```
```json
{ "type": "log", "data": { "container_id": "abc123", "message": "...", "stream": "stdout", "timestamp": "..." } }
```
```json
{ "type": "recent", "data": [...] }
```
```json
{ "type": "ping" }
```

```javascript
// With query param auth
const ws = new WebSocket("ws://localhost:8001/ws/logs?key=YOUR_API_KEY");
ws.onopen = () => ws.send(JSON.stringify({ action: "subscribe_all" }));
ws.onmessage = (e) => console.log(JSON.parse(e.data));

// With first-message auth
const ws2 = new WebSocket("ws://localhost:8001/ws/logs");
ws2.onopen = () => ws2.send(JSON.stringify({ action: "auth", key: "YOUR_API_KEY" }));
ws2.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.type === "authenticated") {
    ws2.send(JSON.stringify({ action: "subscribe_all" }));
  }
};
```

---

## Logs Download (Wave 5 W5.4)

### GET /api/logs/download

Download log entries as a JSON-lines (`.jsonl`) file.

**Auth:** API key

**Query params:**
- `container` (string, optional) — filter by container ID
- `level` (string, optional) — filter by level (error, warn, info, debug)
- `from` (ISO datetime, optional)
- `to` (ISO datetime, optional)
- `limit` (number, optional, capped at 10 000)

**Response (200):** `Content-Type: application/x-ndjson` — one JSON log record per line.

```bash
curl "http://localhost:8001/api/logs/download?container=abc123&from=2026-06-20T00:00:00Z" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -o logs.jsonl
```

---

## Tenant Health (Wave 4 OBS2.3c)

### GET /api/tenant/:tenantId/health

Cross-project health aggregate for embedding in dashboards / admin UIs.

**Auth:** Admin API key (`Authorization: Bearer ADMIN_API_KEY`)

**Path params:**
- `tenantId` (string) — tenant identifier (matches `projects.tenantId`)

**Response (200):**
```json
{
  "tenantId": "acme",
  "projects": 3,
  "totalIssues": 47,
  "openIssues": 12,
  "avgUptime": 99.92,
  "lastError": { "ago": "8m", "message": "TypeError: cannot read property 'x' of undefined" },
  "checkedAt": "2026-06-20T12:34:56Z"
}
```

```bash
curl http://localhost:8001/api/tenant/acme/health \
  -H "Authorization: Bearer ADMIN_API_KEY"
```

---

## Embed (Wave 4 OBS2.4)

### GET /api/embed/*

Proxied views (issues, uptime, infrastructure, logs, traces) for embedding in `hiai-dashboard` and `hiai-admin` without re-implementing the API client. Returns HTML fragments with a thin wrapper.

**Auth:** Admin API key

**Query params:**
- `projectId` (uuid, required) — scope to a single project
- `view` (string, required) — one of `issues` | `uptime` | `infrastructure` | `logs` | `traces`

```bash
curl "http://localhost:8001/api/embed/issues?projectId=PROJECT_UUID" \
  -H "Authorization: Bearer ADMIN_API_KEY"
```

---

## Admin Bridge (Wave 4 OBS2.4)

### /api/admin-bridge/*

Cross-tenant admin operations used by `hiai-admin` to read aggregated state without needing direct DB access. Endpoints mirror the read-only subsets of the regular admin API but resolve projects by `tenantId` instead of `projectId`.

**Auth:** Admin API key

Common endpoints:
- `GET /api/admin-bridge/projects?tenantId=acme` — list projects in a tenant
- `GET /api/admin-bridge/storage?tenantId=acme` — per-project storage usage
- `POST /api/admin-bridge/cleanup` — trigger tenant-scoped cleanup

```bash
curl "http://localhost:8001/api/admin-bridge/projects?tenantId=acme" \
  -H "Authorization: Bearer ADMIN_API_KEY"
```

---

## Projects (B.1)

Project lifecycle — create, list, rotate keys, delete, and per-project rate-limit override. Every project owns a single API key (the Bearer token clients send in `Authorization`); the key is bcrypt-hashed at rest, and only the first 8 characters (`keyPrefix`) are returned by the read paths.

### GET /api/projects

List all projects in the workspace, ordered by creation time. Only the key **prefix** is exposed (`apiKeyPreview = "${keyPrefix}..."`) — the full plaintext key is never returned after creation.

**Auth:** API key

**Response (200):**
```json
{
  "projects": [
    {
      "id": "uuid",
      "name": "Production API",
      "slug": "production-api",
      "keyPrefix": "ho_a1b2c3d4",
      "apiKeyPreview": "ho_a1b2c3d4...",
      "createdAt": "2026-06-01T12:00:00Z"
    }
  ]
}
```

```bash
curl http://localhost:8001/api/projects \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### POST /api/projects

Create a new project. An API key of the form `ho_<uuid32>` is auto-generated, bcrypt-hashed, and stored. The plaintext key is returned **only in this response** — it cannot be recovered later. If lost, use `POST /api/projects/:id/rotate-key` to issue a new one.

The `slug` is derived from `name` (lowercased, non-alphanumerics replaced with `-`, leading/trailing dashes stripped).

**Auth:** API key

**Body:**
```json
{
  "name": "Production API"
}
```
- `name` (string, required, 1-100 chars)

**Response (201):**
```json
{
  "project": {
    "id": "uuid",
    "name": "Production API",
    "slug": "production-api",
    "keyPrefix": "ho_a1b2c3d4",
    "createdAt": "2026-06-01T12:00:00Z"
  },
  "apiKey": "ho_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"
}
```

```bash
curl -X POST http://localhost:8001/api/projects \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"Production API"}'
```

### POST /api/projects/:id/rotate-key

Issue a new API key for the project. The old key is invalidated immediately. The new plaintext key is returned once and masked for display.

**Auth:** API key

**Path params:**
- `id` (uuid, required) — project ID

**Response (200):**
```json
{
  "apiKey": "ho_0f1e2d3c4b5a69788796a5b4c3d2e1f0",
  "apiKeyPreview": "ho_0f1e2d..."
}
```

**Response (404):** `{ "error": "Project not found" }`

```bash
curl -X POST http://localhost:8001/api/projects/PROJECT_UUID/rotate-key \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### DELETE /api/projects/:id

Delete a project and all of its associated data. Performed inside a single transaction; grandchildren (alert history, monitor checks) are removed before the parents and the project row.

Cascaded children: `alerts` → `alert_history`; `uptime_monitors` → `uptime_checks`; `events`, `issues`, `traces`, `notification_config`, `maintenance_windows`, `incidents`, then the project itself.

**Auth:** API key

**Path params:**
- `id` (uuid, required) — project ID

**Response (200):**
```json
{ "deleted": true }
```

**Response (404):** `{ "error": "Project not found" }`

```bash
curl -X DELETE http://localhost:8001/api/projects/PROJECT_UUID \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### PUT /api/projects/:id/rate-limit

Override the per-project rate limit (the 3-bucket `IP + API-key + Project` limit applied by the Redis sliding-window middleware). `null` reverts the project to the global path-based default. Omitted fields are left unchanged. After a successful update the in-process rate-limiter cache is busted so the new limit takes effect immediately (best-effort — failure is non-fatal).

**Auth:** API key

**Path params:**
- `id` (uuid, required) — project ID

**Body:**
```json
{
  "rateLimit": 1000,
  "rateLimitWindowMs": 60000
}
```
- `rateLimit` (integer, optional, 1-1 000 000) — max requests per window; `null` clears the override
- `rateLimitWindowMs` (integer, optional, 1 000-86 400 000) — window size in ms (1s-24h); `null` clears the override

**Response (200):**
```json
{
  "project": {
    "id": "uuid",
    "name": "Production API",
    "slug": "production-api",
    "rateLimit": 1000,
    "rateLimitWindowMs": 60000
  }
}
```

**Response (404):** `{ "error": "Project not found" }`

```bash
curl -X PUT http://localhost:8001/api/projects/PROJECT_UUID/rate-limit \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"rateLimit":1000,"rateLimitWindowMs":60000}'
```

---

## Dashboard (B.2)

Aggregated overview for the main dashboard and the `hiai-dashboard` / `hiai-admin` embed tiles (`/embed/dashboard`). A single endpoint powers 24-hour sparklines, recent activity lists, and overall health status — the route is project-scoped when `projectId` (or `tenantId`) is supplied and global otherwise.

### GET /api/dashboard

Returns error / trace counts for the last 24 hours, the 5 most recent issues, the 10 most recent events, all active monitors with 24h uptime, active alert count, 24 hourly error and trace buckets (zero-filled for missing hours), the current health status, and the active container count.

**Auth:** API key

**Query params:**
- `projectId` (uuid, optional) — scope all aggregates to a single project
- `tenantId` (string, optional) — alias for `projectId` per `docs/EMBED.md` §"Scope Parameters" (OBS2.3b); non-UUID tenant identifiers used by `hiai-admin` work transparently

**Response (200):**
```json
{
  "projectsCount": 3,
  "activeIssues": 12,
  "activeAlerts": 2,
  "healthStatus": "degraded",
  "recentEvents": [
    {
      "id": "uuid",
      "projectId": "uuid",
      "message": "TypeError: cannot read property 'x' of undefined",
      "exceptionType": "TypeError",
      "level": "error",
      "createdAt": "2026-06-27T12:30:00Z"
    }
  ],
  "monitors": [
    {
      "id": "uuid",
      "name": "API Health",
      "url": "https://api.example.com/health",
      "active": true,
      "uptime24h": 99.95,
      "isUp": true
    }
  ],
  "errorCount24h": 47,
  "uptimePercent": 98.5,
  "activeContainers": 6,
  "traceCount24h": 1820,
  "recentIssues": [
    {
      "id": "uuid",
      "title": "Database connection timeout",
      "type": "error",
      "count": 23,
      "status": "unresolved",
      "lastSeen": "2026-06-27T12:25:00Z"
    }
  ],
  "monitorStatuses": [
    {
      "id": "uuid",
      "name": "API Health",
      "url": "https://api.example.com/health",
      "active": true,
      "isUp": true
    }
  ],
  "alertCount": 2,
  "errorBuckets": [
    { "hour": "2026-06-26T13:00:00.000Z", "count": 0 },
    { "hour": "2026-06-26T14:00:00.000Z", "count": 3 }
  ],
  "traceBuckets": [
    { "hour": "2026-06-26T13:00:00.000Z", "count": 124 },
    { "hour": "2026-06-26T14:00:00.000Z", "count": 138 }
  ]
}
```

Field semantics:
- `healthStatus` — `"healthy"` when no active monitors exist or all are ≥ 99.9% uptime; `"degraded"` when at least one is between 99.0% and 99.9%; `"down"` when at least one is below 99.0%
- `errorBuckets` / `traceBuckets` — exactly 24 entries, one per hour, oldest first, zero-filled for hours with no data
- `projectsCount` — `1` when scoped to a single project, otherwise the total project count in the workspace
- `errorCount24h` / `traceCount24h` — counts where `level = 'error'` and `createdAt >= now - 24h` (errors) or `startTime >= now - 24h` (traces)

```bash
# Global overview
curl http://localhost:8001/api/dashboard \
  -H "Authorization: Bearer YOUR_API_KEY"

# Project-scoped (via projectId)
curl "http://localhost:8001/api/dashboard?projectId=PROJECT_UUID" \
  -H "Authorization: Bearer YOUR_API_KEY"

# Project-scoped (via tenantId alias)
curl "http://localhost:8001/api/dashboard?tenantId=acme" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

---

## Releases (B.6)

Release tracking with deployment health. Each release is a `(project, version, environment)` tuple, optionally with a `deployedAt` timestamp. The `/health` sub-endpoint reports new issues, error rate, and a derived health score since the deployment window.

### GET /api/releases

List releases, newest first. Results are paginated; pass `projectId` to scope to a single project, or `environment` to filter by environment.

**Auth:** API key

**Query params:**
- `projectId` (uuid, optional) — filter by project
- `environment` (string, optional) — one of `production`, `staging`, `development`
- `limit` (string, optional, default `50`) — capped by `parseLimit`
- `offset` (string, optional, default `0`)

**Response (200):**
```json
{
  "data": [
    {
      "id": "uuid",
      "projectId": "uuid",
      "version": "1.4.2",
      "environment": "production",
      "deployedAt": "2026-06-25T08:00:00Z",
      "createdAt": "2026-06-25T07:55:00Z"
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0
}
```

```bash
curl "http://localhost:8001/api/releases?projectId=PROJECT_UUID&environment=production" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### GET /api/releases/:id

Get a single release by ID.

**Auth:** API key

**Path params:**
- `id` (uuid, required) — release ID

**Response (200):** `Release` object (same shape as a list entry)

**Response (404):** `{ "error": "Release not found" }`

```bash
curl http://localhost:8001/api/releases/RELEASE_UUID \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### POST /api/releases

Create a release. `environment` defaults to `production`; `deployedAt` is optional and can be backdated to mark a release as already deployed.

**Auth:** API key

**Body:**
```json
{
  "projectId": "uuid",
  "version": "1.4.2",
  "environment": "production",
  "deployedAt": "2026-06-25T08:00:00Z"
}
```
- `projectId` (uuid, required)
- `version` (string, required, min length 1)
- `environment` (string, optional, default `production`) — one of `production`, `staging`, `development`
- `deployedAt` (ISO datetime, optional)

**Response (201):** Created `Release` object

```bash
curl -X POST http://localhost:8001/api/releases \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"projectId":"PROJECT_UUID","version":"1.4.2","environment":"production","deployedAt":"2026-06-25T08:00:00Z"}'
```

### PUT /api/releases/:id

Partial update — only fields present in the body are touched. At least one updatable field must be supplied (otherwise `400`).

**Auth:** API key

**Path params:**
- `id` (uuid, required) — release ID

**Body:**
```json
{
  "version": "1.4.3",
  "environment": "staging",
  "deployedAt": "2026-06-26T10:00:00Z"
}
```
- `version` (string, optional, min length 1)
- `environment` (string, optional) — one of `production`, `staging`, `development`
- `deployedAt` (ISO datetime, optional)

**Response (200):** Updated `Release` object

**Response (400):** `{ "error": "No valid fields to update" }`

**Response (404):** `{ "error": "Release not found" }`

```bash
curl -X PUT http://localhost:8001/api/releases/RELEASE_UUID \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"deployedAt":"2026-06-26T10:00:00Z"}'
```

### GET /api/releases/:id/health

Deployment health for a single release. The window starts at `deployedAt` (or `createdAt` if not set) and runs to "now". `healthScore` is derived from new-issues-per-hour: `< 5` → `green`, `< 20` → `yellow`, otherwise `red`.

**Auth:** API key

**Path params:**
- `id` (uuid, required) — release ID

**Response (200):**
```json
{
  "releaseId": "uuid",
  "version": "1.4.2",
  "environment": "production",
  "newIssuesCount": 3,
  "errorRate": 0.45,
  "healthScore": "green",
  "windowHours": 48.5
}
```

**Response (404):** `{ "error": "Release not found" }`

```bash
curl http://localhost:8001/api/releases/RELEASE_UUID/health \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### DELETE /api/releases/:id

Delete a release. Only the release row is removed; issues and events are not touched.

**Auth:** API key

**Path params:**
- `id` (uuid, required) — release ID

**Response (200):** `{ "deleted": true }`

**Response (404):** `{ "error": "Release not found" }`

```bash
curl -X DELETE http://localhost:8001/api/releases/RELEASE_UUID \
  -H "Authorization: Bearer YOUR_API_KEY"
```

---

## Notification Config (B.12)

Per-project notification channel configuration. Channel settings are stored in the database, encrypted at rest with the `ENCRYPTION_KEY` env var (sensitive fields are encrypted; non-sensitive fields are stored as plaintext). When no DB row exists for a channel, the dispatcher falls back to the corresponding `*_WEBHOOK_URL` / `*_BOT_TOKEN` / `SMTP_*` environment variables.

The base path is `/api/notifications` (channel-keyed, not ID-keyed) — the dispatcher upserts on `(projectId, channel)`.

### GET /api/notifications

List notification channel configs. Sensitive fields in `config` (e.g. `botToken`, `webhookUrl`, `token`, `password`, `userKey`, `apiKey`, `routingKey`, `secret`) are masked as `abcd••••efgh` in the response; original values are never returned over the wire.

**Auth:** API key

**Query params:**
- `projectId` (string, optional) — filter to a single project

**Response (200):**
```json
{
  "notifications": [
    {
      "id": "uuid",
      "projectId": "uuid",
      "channel": "telegram",
      "config": {
        "botToken": "abcd••••efgh",
        "chatId": "-1001234567890"
      },
      "enabled": true,
      "configured": true,
      "createdAt": "2026-06-01T12:00:00Z",
      "updatedAt": "2026-06-15T08:30:00Z"
    }
  ]
}
```

```bash
curl "http://localhost:8001/api/notifications?projectId=PROJECT_UUID" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### GET /api/notifications/:channel

Get the config for a single channel. If a DB row exists it is returned (with `source: "db"`); otherwise the env-var fallback is returned (with `source: "env"`).

Valid channels: `telegram`, `discord`, `email`, `slack`, `webhook`, `pagerduty`, `teams`, `ntfy`, `gotify`, `pushover`.

**Auth:** API key

**Path params:**
- `channel` (string, required) — one of the channels listed above

**Query params:**
- `projectId` (string, optional) — scope to a single project

**Response (200):**
```json
{
  "id": "uuid",
  "projectId": "uuid",
  "channel": "discord",
  "config": {
    "webhookUrl": "abcd••••efgh"
  },
  "enabled": true,
  "configured": true,
  "source": "db",
  "createdAt": "2026-06-01T12:00:00Z",
  "updatedAt": "2026-06-15T08:30:00Z"
}
```

**Response (400):** `{ "error": "Invalid channel. Must be: telegram, discord, email, slack, webhook, pagerduty, teams, ntfy, gotify, pushover" }`

```bash
curl "http://localhost:8001/api/notifications/telegram?projectId=PROJECT_UUID" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### PUT /api/notifications/:channel

Upsert a channel config. If a row for `(projectId, channel)` exists it is updated; otherwise a new row is inserted. Sensitive fields in `config` are encrypted at rest with `ENCRYPTION_KEY` (when set) — the server only ever returns masked values on read.

**Auth:** API key

**Path params:**
- `channel` (string, required) — one of the channels listed above

**Body:**
```json
{
  "projectId": "uuid",
  "config": {
    "botToken": "1234567890:ABCDEFG...",
    "chatId": "-1001234567890"
  },
  "enabled": true
}
```
- `projectId` (string, required)
- `config` (record of string→string, required) — channel-specific keys (e.g. `botToken` + `chatId` for telegram; `webhookUrl` for discord; `host`/`port`/`user`/`pass`/`from`/`to` for email; `webhookUrl` for slack / teams; `url` + `secret` for webhook; `routingKey` for pagerduty; `topic` + `server` for ntfy; `server` + `token` for gotify; `userKey` + `token` for pushover)
- `enabled` (boolean, optional, default `true`)

**Response (200) — updated:** `{ "id": "uuid", "channel": "telegram", "updated": true }`

**Response (201) — created:** `{ "id": "uuid", "channel": "telegram", "created": true }`

**Response (400):** `{ "error": "Invalid channel. Must be: ..." }`

```bash
curl -X PUT http://localhost:8001/api/notifications/telegram \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"projectId":"PROJECT_UUID","config":{"botToken":"1234567890:ABCDEFG","chatId":"-1001234567890"},"enabled":true}'
```

### POST /api/notifications/:channel/test

Send a test alert through the channel. Resolves credentials from the DB row for `projectId` and falls back to env vars (`TELEGRAM_BOT_TOKEN` / `DISCORD_WEBHOOK_URL` / `SMTP_USER` / etc.) when no DB config is present. Returns the notifier's `{ ok, error? }` result.

**Auth:** API key

**Path params:**
- `channel` (string, required) — one of the channels listed above

**Query params:**
- `projectId` (string, optional) — scope the test to a specific project's DB config

**Response (200):**
```json
{ "ok": true }
```

**Response (400):** Specific validation error (e.g. `{ "error": "No chat ID configured" }`, `{ "error": "No webhook URL configured" }`, `{ "error": "No recipient configured" }`, `{ "error": "No routing key configured" }`, `{ "error": "No topic configured" }`, `{ "error": "No server URL configured" }`, `{ "error": "No user key configured" }`, `{ "error": "Invalid channel. Must be: ..." }`)

```bash
curl -X POST "http://localhost:8001/api/notifications/telegram/test?projectId=PROJECT_UUID" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### DELETE /api/notifications/:channel

Delete the channel config row. Falls back to `404` if no matching row exists.

**Auth:** API key

**Path params:**
- `channel` (string, required) — one of the channels listed above

**Query params:**
- `projectId` (string, optional) — scope deletion to a single project

**Response (200):** `{ "deleted": true }`

**Response (404):** `{ "error": "Not found" }`

```bash
curl -X DELETE "http://localhost:8001/api/notifications/telegram?projectId=PROJECT_UUID" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

---

## Team (B.3)

Project-scoped team membership management. Each row in `team_members` belongs to exactly one project; the same email may exist in different projects (uniqueness is per `(projectId, email)`). Roles are one of `owner`, `admin`, `member`, `viewer` — the role gate is enforced in higher-level middleware (admin actions require `owner`/`admin`).

### GET /api/team

List team members for a project, ordered by creation time (newest first). When `projectId` is omitted the query returns members across all projects — callers are expected to scope the request to the project they administer.

**Auth:** API key

**Query params:**
- `projectId` (uuid, optional) — scope to a single project
- `limit` (string, optional, default `100`, max `500`) — page size
- `offset` (string, optional, default `0`) — page offset

**Response (200):**
```json
{
  "data": [
    {
      "id": "uuid",
      "projectId": "uuid",
      "name": "Alice Engineer",
      "email": "alice@example.com",
      "role": "admin",
      "createdAt": "2026-06-01T12:00:00Z",
      "updatedAt": "2026-06-15T08:30:00Z"
    }
  ],
  "total": 1,
  "limit": 100,
  "offset": 0
}
```

```bash
curl "http://localhost:8001/api/team?projectId=PROJECT_UUID" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### POST /api/team

Invite (add) a team member to a project. Returns `409` if a member with the same email already exists within the same project.

**Auth:** API key

**Body:**
```json
{
  "projectId": "uuid",
  "name": "Alice Engineer",
  "email": "alice@example.com",
  "role": "member"
}
```
- `projectId` (uuid, required)
- `name` (string, required, min length 1)
- `email` (string, required, valid email)
- `role` (enum, optional, default `"member"`) — one of `owner`, `admin`, `member`, `viewer`

**Response (201):**
```json
{
  "id": "uuid",
  "projectId": "uuid",
  "name": "Alice Engineer",
  "email": "alice@example.com",
  "role": "member",
  "createdAt": "2026-06-27T12:00:00Z",
  "updatedAt": "2026-06-27T12:00:00Z"
}
```

**Response (409):** `{ "error": "Team member with this email already exists in this project" }`

```bash
curl -X POST http://localhost:8001/api/team \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"projectId":"PROJECT_UUID","name":"Alice Engineer","email":"alice@example.com","role":"member"}'
```

### PUT /api/team/:id

Update one or more fields on an existing team member (`name`, `email`, `role`). When `email` is changed, the route re-checks uniqueness inside the same project and returns `409` on collision.

**Auth:** API key

**Path params:**
- `id` (uuid, required) — team member ID

**Body:**
```json
{
  "name": "Alice E.",
  "email": "alice@example.com",
  "role": "admin"
}
```
- `name` (string, optional, min length 1)
- `email` (string, optional, valid email)
- `role` (enum, optional) — one of `owner`, `admin`, `member`, `viewer`

**Response (200):** the updated row
```json
{
  "id": "uuid",
  "projectId": "uuid",
  "name": "Alice E.",
  "email": "alice@example.com",
  "role": "admin",
  "createdAt": "2026-06-01T12:00:00Z",
  "updatedAt": "2026-06-27T12:05:00Z"
}
```

**Response (404):** `{ "error": "Team member not found" }`

**Response (409):** `{ "error": "Team member with this email already exists in this project" }`

```bash
curl -X PUT http://localhost:8001/api/team/MEMBER_UUID \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"role":"admin"}'
```

### DELETE /api/team/:id

Remove a team member from the project. Returns `404` if the row does not exist.

**Auth:** API key

**Path params:**
- `id` (uuid, required) — team member ID

**Response (200):** `{ "deleted": true }`

**Response (404):** `{ "error": "Team member not found" }`

```bash
curl -X DELETE http://localhost:8001/api/team/MEMBER_UUID \
  -H "Authorization: Bearer YOUR_API_KEY"
```

---

## Search (B.4)

Unified cross-project search across `issues`, `events`, and `traces`. Matching is case-insensitive substring (`ILIKE %q%`) on the title (issues), message (events), or name (traces); `%` and `_` in the query are escaped so they match literally. Each match row is annotated with its `projectName` resolved from the `projects` table.

If `q` is empty or its trimmed length is `< 2`, the route short-circuits with empty arrays for all three buckets (no DB hit).

### GET /api/search

**Auth:** API key

**Query params:**
- `q` (string, required, min length 1) — search query; trimmed length `< 2` returns empty buckets
- `projectId` (uuid, optional) — scope all three buckets to a single project
- `limit` (string, optional, default `50`) — per-bucket cap

**Response (200):**
```json
{
  "issues": [
    {
      "id": "uuid",
      "title": "Database connection timeout",
      "type": "error",
      "status": "unresolved",
      "count": 23,
      "projectId": "uuid",
      "projectName": "Production API",
      "lastSeen": "2026-06-27T12:25:00Z"
    }
  ],
  "events": [
    {
      "id": "uuid",
      "message": "TypeError: cannot read property 'x' of undefined",
      "exceptionType": "TypeError",
      "level": "error",
      "projectId": "uuid",
      "projectName": "Production API",
      "createdAt": "2026-06-27T12:30:00Z"
    }
  ],
  "traces": [
    {
      "id": "uuid",
      "name": "agent.workflow.run",
      "agent": null,
      "workflow": null,
      "durationMs": 1820,
      "status": "ok",
      "projectId": "uuid",
      "projectName": "Production API",
      "startTime": "2026-06-27T12:31:00Z"
    }
  ]
}
```

Field semantics:
- `agent` / `workflow` on traces — currently always `null` (reserved for future Mastra enrichment)
- `projectName` — resolved by `IN` lookup against the `projects` table for any project ID returned in the buckets; falls back to `"Unknown"` if the project was deleted

```bash
curl "http://localhost:8001/api/search?q=timeout&projectId=PROJECT_UUID&limit=20" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

---

## Saved Searches (B.5)

User-saved search queries for the issues/events/traces explorer. A saved search captures the raw `query` string, an optional structured `filters` blob, and an optional `projectId` scope.

### GET /api/saved-searches

List saved searches, newest first. When `projectId` is supplied the list is scoped to that project; otherwise all saved searches in the workspace are returned.

**Auth:** API key

**Query params:**
- `projectId` (string, optional) — scope to a single project

**Response (200):**
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Recent timeouts",
      "query": "timeout",
      "filters": { "level": "error", "since": "24h" },
      "projectId": "uuid",
      "createdAt": "2026-06-27T12:00:00Z"
    }
  ]
}
```

```bash
curl "http://localhost:8001/api/saved-searches?projectId=PROJECT_UUID" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### POST /api/saved-searches

Persist a new saved search.

**Auth:** API key

**Body:**
```json
{
  "name": "Recent timeouts",
  "query": "timeout",
  "filters": { "level": "error", "since": "24h" },
  "projectId": "uuid"
}
```
- `name` (string, required)
- `query` (string, required)
- `filters` (record of string→unknown, optional) — structured filters, persisted as-is
- `projectId` (string, optional) — null = workspace-wide

**Response (200):**
```json
{
  "data": {
    "id": "uuid",
    "name": "Recent timeouts",
    "query": "timeout",
    "filters": { "level": "error", "since": "24h" },
    "projectId": "uuid",
    "createdAt": "2026-06-27T12:00:00Z"
  }
}
```

```bash
curl -X POST http://localhost:8001/api/saved-searches \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"Recent timeouts","query":"timeout","filters":{"level":"error","since":"24h"}}'
```

### DELETE /api/saved-searches/:id

Delete a saved search.

**Auth:** API key

**Path params:**
- `id` (string, required) — saved search ID

**Response (200):**
```json
{ "data": { "id": "uuid", "name": "Recent timeouts", "query": "timeout" } }
```

**Response (404):** `{ "error": "Saved search not found" }`

```bash
curl -X DELETE http://localhost:8001/api/saved-searches/SAVED_SEARCH_UUID \
  -H "Authorization: Bearer YOUR_API_KEY"
```

---

## Comments (B.11)

Collaboration threads attached to issues. Two route shapes share one plugin: collection routes under `/api/issues/:id/comments` and a single-resource delete under `/api/comments/:id`. Both bodies and author names are bounded (10 KB / 200 chars) to defend against unbounded-storage DoS.

### GET /api/issues/:id/comments

List comments on an issue, newest first. The issue is verified to exist before the query; a missing issue returns `404`.

**Auth:** API key

**Path params:**
- `id` (uuid, required) — issue ID

**Query params:**
- `limit` (string, optional, default `50`) — page size
- `offset` (string, optional, default `0`) — page offset

**Response (200):**
```json
{
  "data": [
    {
      "id": "uuid",
      "issueId": "uuid",
      "authorName": "Alice",
      "body": "Repro confirmed on staging.",
      "createdAt": "2026-06-27T12:00:00Z"
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0
}
```

**Response (404):** `{ "error": "Issue not found" }`

```bash
curl "http://localhost:8001/api/issues/ISSUE_UUID/comments" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### POST /api/issues/:id/comments

Add a comment to an issue. The body and author name are length-capped at the validator (`maxLength`) and re-checked in the handler (`413` on overflow) as defense in depth.

**Auth:** API key

**Path params:**
- `id` (uuid, required) — issue ID

**Body:**
```json
{
  "authorName": "Alice",
  "body": "Repro confirmed on staging."
}
```
- `authorName` (string, required, 1-200 chars)
- `body` (string, required, 1-10 000 chars)

**Response (201):**
```json
{
  "id": "uuid",
  "issueId": "uuid",
  "authorName": "Alice",
  "body": "Repro confirmed on staging.",
  "createdAt": "2026-06-27T12:00:00Z"
}
```

**Response (404):** `{ "error": "Issue not found" }`

**Response (413):**
- `{ "error": "Comment too large", "detail": "Max length: 10000 chars" }`
- `{ "error": "Author name too long", "detail": "Max length: 200 chars" }`

```bash
curl -X POST http://localhost:8001/api/issues/ISSUE_UUID/comments \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"authorName":"Alice","body":"Repro confirmed on staging."}'
```

### DELETE /api/comments/:id

Delete a comment by ID.

**Auth:** API key

**Path params:**
- `id` (uuid, required) — comment ID

**Response (200):** `{ "deleted": true }`

**Response (404):** `{ "error": "Comment not found" }`

```bash
curl -X DELETE http://localhost:8001/api/comments/COMMENT_UUID \
  -H "Authorization: Bearer YOUR_API_KEY"
```

---

## Export (B.13a)

Bulk export endpoints for issues, traces, and logs. The range is clamped to a 90-day window (`MAX_RANGE_DAYS = 90`); if `from`/`to` are omitted, a per-resource default is used (issues = 30 days, traces = 7 days, logs = 7 days). If `from` is later than `to`, the two are swapped. Each response is capped at `10 000` rows.

Format `csv` returns `text/csv` with `Content-Disposition: attachment; filename=...`; format `json` (default) returns `{ data, count }`.

### GET /api/export/issues

Export issue rows whose `lastSeen` falls inside `[from, to]`. Default window: last 30 days.

**Auth:** API key

**Query params:**
- `format` (enum, optional, default `"json"`) — `json` or `csv`
- `from` (date-time, optional) — ISO 8601 lower bound
- `to` (date-time, optional) — ISO 8601 upper bound

**Response (200) — JSON:**
```json
{
  "data": [
    {
      "id": "uuid",
      "title": "Database connection timeout",
      "type": "error",
      "status": "unresolved",
      "count": 23,
      "firstSeen": "2026-06-01T12:00:00Z",
      "lastSeen": "2026-06-27T12:25:00Z"
    }
  ],
  "count": 1
}
```

**Response (200) — CSV:** `Content-Type: text/csv`, header row plus one row per issue, `Content-Disposition: attachment; filename=issues.csv`.

```bash
curl "http://localhost:8001/api/export/issues?format=json&from=2026-06-01T00:00:00Z&to=2026-06-27T23:59:59Z" \
  -H "Authorization: Bearer YOUR_API_KEY"

curl -OJ "http://localhost:8001/api/export/issues?format=csv" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### GET /api/export/traces

Export trace rows whose `startTime` falls inside `[from, to]`. Default window: last 7 days.

**Auth:** API key

**Query params:**
- `format` (enum, optional, default `"json"`) — `json` or `csv`
- `from` (date-time, optional) — ISO 8601 lower bound
- `to` (date-time, optional) — ISO 8601 upper bound

**Response (200) — JSON:**
```json
{
  "data": [
    {
      "id": "uuid",
      "traceId": "abc123",
      "name": "agent.workflow.run",
      "kind": "internal",
      "status": "ok",
      "durationMs": 1820,
      "model": "claude-opus-4",
      "startTime": "2026-06-27T12:31:00Z"
    }
  ],
  "count": 1
}
```

**Response (200) — CSV:** `Content-Type: text/csv`, `Content-Disposition: attachment; filename=traces.csv`.

```bash
curl "http://localhost:8001/api/export/traces?format=csv" \
  -H "Authorization: Bearer YOUR_API_KEY" -OJ
```

### GET /api/export/logs

Export log rows whose `timestamp` falls inside `[from, to]`, optionally filtered by `level` and `containerId`. Default window: last 7 days.

**Auth:** API key

**Query params:**
- `format` (enum, optional, default `"json"`) — `json` or `csv`
- `from` (date-time, optional) — ISO 8601 lower bound
- `to` (date-time, optional) — ISO 8601 upper bound
- `level` (string, optional) — log level filter (e.g. `error`, `warn`, `info`)
- `container` (string, optional) — `containerId` filter

**Response (200) — JSON:**
```json
{
  "data": [
    {
      "id": "uuid",
      "containerId": "abc123",
      "containerName": "api",
      "stream": "stdout",
      "level": "error",
      "message": "TypeError: cannot read property 'x' of undefined",
      "timestamp": "2026-06-27T12:30:00Z"
    }
  ],
  "count": 1
}
```

**Response (200) — CSV:** `Content-Type: text/csv`, `Content-Disposition: attachment; filename=logs.csv`.

```bash
curl "http://localhost:8001/api/export/logs?format=json&level=error&container=abc123" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

---

## Agent Ingest (B.13b)

Ingest endpoint for remote lightweight monitoring agents (the `hiai-observe-agent` binary). The agent POSTs host + container + GPU stats on a periodic schedule; the server validates the body, enforces a per-host rate limit, and writes into the `host_stats`, `container_stats`, `gpu_stats`, and `host_info` tables. This endpoint sits behind the global auth middleware (API key).

### POST /api/agent/ingest

Accept a stats snapshot from one host.

**Auth:** API key (`Authorization: Bearer ...` or `X-Api-Key: ...`)

**Per-host rate limit:** `60` requests per `60_000 ms` per `hostId` — backed by Redis `INCR`/`PEXPIRE`, with an in-memory sliding-window fallback when Redis is offline (fail-open). On overflow the route returns `429` and sets `Retry-After`, `X-RateLimit-Limit`, and `X-RateLimit-Remaining: 0`.

**Headers set on success:**
- `X-RateLimit-Limit: 60`
- `X-RateLimit-Remaining: <remaining>`

**Body:**
```json
{
  "hostId": "host-01",
  "hostStats": {
    "cpu": 12.5,
    "memory": 4096,
    "disk": 120,
    "load": [0.5, 0.4, 0.3],
    "network": { "rx": 1234567, "tx": 7654321 },
    "cores": [10.0, 12.0, 15.0, 11.0]
  },
  "containers": [
    {
      "id": "abc123",
      "name": "api",
      "cpu": 5.2,
      "memory": 512,
      "memoryLimit": 1024,
      "memoryPercent": 50.0,
      "networkRx": 1000,
      "networkTx": 2000,
      "networkRxRate": 100,
      "networkTxRate": 200,
      "blockRead": 0,
      "blockWrite": 0,
      "status": "running",
      "uptimeSeconds": 3600,
      "restartCount": 0,
      "healthStatus": "healthy",
      "image": "myorg/api:latest"
    }
  ],
  "gpu": [
    {
      "gpuIndex": 0,
      "utilizationPercent": 42.0,
      "memoryUsedMb": 8192,
      "memoryTotalMb": 24576,
      "temperatureC": 65
    }
  ],
  "hostInfo": {
    "os": "Ubuntu 24.04",
    "kernel": "6.8.0-31-generic",
    "cpuModel": "AMD EPYC 7763 64-Core",
    "cores": 64,
    "arch": "x86_64",
    "uptime": 86400
  }
}
```

Field schema:
- `hostId` (string, required) — stable per-agent identifier; used as the rate-limit key
- `hostStats` (object, required)
  - `cpu` (number, required) — overall CPU usage percent
  - `memory` (number, required) — memory used in MB
  - `disk` (number, required) — disk used in GB
  - `load` (number[], required) — 1m / 5m / 15m load averages
  - `network` (object, required) — `{ rx: number, tx: number }` cumulative byte counters
  - `cores` (number[], optional) — per-logical-core CPU usage percent
- `containers` (object[], required) — list of container snapshots
  - `id` (string, required), `name` (string, required), `cpu` (number, required), `memory` (number, required)
  - All other container fields are optional and default to `0` / `"unknown"` / `"running"` when omitted
- `gpu` (object[], optional) — list of GPU snapshots
  - `gpuIndex` (number, required), `utilizationPercent` (number, required), `memoryUsedMb` (number, required), `memoryTotalMb` (number, required)
  - `temperatureC` (number | null, optional)
- `hostInfo` (object, optional) — one-shot host metadata; upserted into `host_info` when present

**Response (200):**
```json
{ "ok": true, "hostId": "host-01" }
```

**Response (429):**
```json
{ "error": "Too many requests for this host", "retryAfter": 60 }
```
Plus headers: `Retry-After: 60`, `X-RateLimit-Limit: 60`, `X-RateLimit-Remaining: 0`.

**Response (500):** `{ "error": "Ingest failed" }` (caught and logged server-side).

```bash
curl -X POST http://localhost:8001/api/agent/ingest \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "hostId": "host-01",
    "hostStats": {
      "cpu": 12.5,
      "memory": 4096,
      "disk": 120,
      "load": [0.5, 0.4, 0.3],
      "network": { "rx": 1234567, "tx": 7654321 }
    },
    "containers": [
      { "id": "abc123", "name": "api", "cpu": 5.2, "memory": 512 }
    ]
  }'
```

---

## Source Maps (B.7)

Source map storage for client-side stack trace resolution. Source maps are uploaded per project and per release identifier, written to a local `sourcemaps/<projectId>/<release>.map` directory tree (relative to `process.cwd()`), and downloaded as raw `application/json`. The route plugin is registered with prefix `/api/sourcemaps`.

> **Note:** this route plugin is **not** registered behind the global API-key auth middleware at the time of writing — calls succeed without a Bearer token. Source map files are served back to anyone who knows the URL, so treat the file paths as unguessable secrets (UUID project ID + opaque release name).

### POST /api/sourcemaps/:projectId

Upload a `.map` file for a specific release. Stored at `<cwd>/sourcemaps/<projectId>/<sanitizedRelease>.map`. The `release` form field is sanitized to `[a-zA-Z0-9._-]` (anything else replaced with `_`) before being used as a filename.

**Auth:** none enforced by the route (see note above).

**Path params:**
- `projectId` (UUID, required) — owning project.

**Body:** `multipart/form-data` with two fields:
- `file` (File, required) — the `.map` source map content (any size; written verbatim).
- `release` (string, required) — release identifier (sanitized server-side).

**Response (200):**
```json
{ "uploaded": true, "projectId": "<uuid>", "release": "<release>", "size": 12345 }
```

**Response (400):** `{ "error": "Missing 'file' in form data" }` or `{ "error": "Missing 'release' in form data" }`.

**Response (500):** `{ "error": "Upload failed" }`.

```bash
curl -X POST http://localhost:8001/api/sourcemaps/$PROJECT_ID \
  -F "file=@./main.abc123.js.map" \
  -F "release=main@1.2.3"
```

### GET /api/sourcemaps/:projectId

List the release identifiers of all source maps uploaded for a project. The directory is auto-created on first upload; if no uploads exist yet, the response is `{ "releases": [] }`.

**Auth:** none enforced by the route.

**Path params:**
- `projectId` (UUID, required).

**Response (200):**
```json
{ "releases": ["main@1.2.3", "main@1.2.4"] }
```

```bash
curl http://localhost:8001/api/sourcemaps/$PROJECT_ID
```

### GET /api/sourcemaps/:projectId/:release

Download a previously uploaded source map. The file is read from disk and returned with `Content-Type: application/json`.

**Auth:** none enforced by the route.

**Path params:**
- `projectId` (UUID, required).
- `release` (string, required) — release identifier (sanitized server-side, must match the upload name modulo sanitization).

**Response (200):** raw source map JSON (`Content-Type: application/json`).

**Response (404):** `{ "error": "Source map not found" }`.

```bash
curl -OJ http://localhost:8001/api/sourcemaps/$PROJECT_ID/main@1.2.3
```

### DELETE /api/sourcemaps/:projectId/:release

Delete a single source map file from disk.

**Auth:** none enforced by the route.

**Path params:**
- `projectId` (UUID, required).
- `release` (string, required).

**Response (200):** `{ "deleted": true }`.

**Response (404):** `{ "error": "Source map not found" }`.

```bash
curl -X DELETE http://localhost:8001/api/sourcemaps/$PROJECT_ID/main@1.2.3
```

---

## Badges (B.8)

Lightweight SVG badges for embedding project health on status pages, dashboards, or READMEs. The route plugin is registered with prefix `/api/badges` and looks up the **project slug** (not UUID) plus its first active uptime monitor to render the badge. Two badge variants are exposed: `status` (textual state) and `uptime` (24h success percentage). All responses are SVG with `Cache-Control: public, max-age=60`.

> **Note:** the badges route is **public** — no auth is required and the response is served with public cache headers, which is intentional for embedding.

### GET /api/badges/:slug/status

Render a status badge showing the last check state of the project's first active monitor.

**Auth:** none (public).

**Path params:**
- `slug` (string, required) — `projects.slug`.

**Status colors:**
| Status | Color |
|---|---|
| `operational` / `up` | `#4c1` (green) |
| `degraded` | `#dbab09` (amber) |
| `down` | `#e05d44` (red) |
| anything else / unknown | `#9f9f9f` (grey) |

The status value is derived from the most recent `uptime_checks` row (`success === true` → `operational`, otherwise `down`). If the project has no monitors, the badge shows `unknown`.

**Response (200):** `image/svg+xml` SVG document (height fixed at `22px`, width auto-sized to label + value). Headers: `Content-Type: image/svg+xml`, `Cache-Control: public, max-age=60`.

```bash
curl http://localhost:8001/api/badges/my-project/status
```

### GET /api/badges/:slug/uptime

Render a 24-hour uptime badge showing the percentage of successful checks.

**Auth:** none (public).

**Path params:**
- `slug` (string, required) — `projects.slug`.

**Color thresholds:**
| Uptime | Color |
|---|---|
| `>= 99.9%` | `#4c1` (green) |
| `>= 99%` | `#97CA00` (lime) |
| `>= 95%` | `#dbab09` (amber) |
| `< 95%` | `#e05d44` (red) |
| no checks in last 24h | `#9f9f9f` (grey, value `N/A`) |

The percentage is computed from `uptime_checks` rows in the last 24h (`checkedAt >= NOW() - 24h`) as `round(success / total * 10000) / 100`. If the project has no monitors or no recent checks, the value is `N/A`.

**Response (200):** `image/svg+xml` SVG document (label `<name> uptime`, value `<pct>%` or `N/A`). Headers: `Content-Type: image/svg+xml`, `Cache-Control: public, max-age=60`.

```bash
curl http://localhost:8001/api/badges/my-project/uptime
```

---

## Fingerprint Rules (B.9)

Custom fingerprinting rules override the default issue-grouping algorithm for matching error events. Each rule pairs a regex `pattern` with a `groupBy` field (`message` / `stack` / `type`) and is scoped to a single project. The route plugin is registered with prefix `/api/fingerprint-rules` and uses `src/lib/auth.ts#authorizeProject` for per-request authorization — the API key resolves to a `projectId`, and any cross-project access is rejected with `403`.

> **Note:** the body `pattern` is validated with `new RegExp(pattern)` on POST and PUT — invalid regex returns `400 { "error": "Invalid regex pattern" }`. `groupBy` must be one of `message`, `stack`, `type` (defaults to `message` on POST when omitted).

### GET /api/fingerprint-rules

List fingerprint rules for the authenticated project. Optional `projectId` query must equal the authorized project, otherwise `403`.

**Auth:** API key (`Authorization: Bearer ...` or `X-Api-Key: ...`).

**Query params:**
- `projectId` (UUID, optional) — must match the API key's project.
- `limit` (integer string, optional) — parsed via `parseLimit` (default `50`, max `200`).
- `offset` (integer string, optional) — parsed via `parseOffset` (default `0`).

**Response (200):**
```json
{
  "data": [
    {
      "id": "<uuid>",
      "projectId": "<uuid>",
      "name": "stripe-errors",
      "pattern": "Stripe\\..*Error",
      "groupBy": "message",
      "isActive": true,
      "createdAt": "2026-06-27T10:00:00.000Z"
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0
}
```

**Response (401):** `{ "error": "Invalid API key" }`.
**Response (403):** `{ "error": "Forbidden" }`.

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  "http://localhost:8001/api/fingerprint-rules?limit=50&offset=0"
```

### POST /api/fingerprint-rules

Create a new fingerprint rule.

**Auth:** API key.

**Body:**
```json
{
  "projectId": "<uuid>",
  "name": "stripe-errors",
  "pattern": "Stripe\\..*Error",
  "groupBy": "message",
  "isActive": true
}
```
- `projectId` (UUID, required) — must equal the authorized project.
- `name` (string, required, 1–100 chars) — must be unique per project.
- `pattern` (string, required, 1–500 chars) — JavaScript regex source.
- `groupBy` (`"message"` | `"stack"` | `"type"`, optional, default `message`).
- `isActive` (boolean, optional, default `true`).

**Response (200):** the inserted row (same shape as GET items).

**Response (400):** `{ "error": "Invalid regex pattern" }` or `{ "error": "groupBy must be one of: message, stack, type" }`.
**Response (401):** `{ "error": "Invalid API key" }`.
**Response (403):** `{ "error": "Forbidden" }`.
**Response (409):** `{ "error": "Rule name already exists for this project" }`.

```bash
curl -X POST http://localhost:8001/api/fingerprint-rules \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "'"$PROJECT_ID"'",
    "name": "stripe-errors",
    "pattern": "Stripe\\..*Error",
    "groupBy": "message"
  }'
```

### GET /api/fingerprint-rules/:id

Fetch a single fingerprint rule by ID (must belong to the authorized project).

**Auth:** API key.

**Path params:**
- `id` (UUID, required).

**Response (200):** the rule row.

**Response (401):** `{ "error": "Invalid API key" }`.
**Response (404):** `{ "error": "Not found" }`.

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  http://localhost:8001/api/fingerprint-rules/$RULE_ID
```

### PUT /api/fingerprint-rules/:id

Partially update a fingerprint rule. All body fields are optional; `pattern`, when present, is re-validated as a regex.

**Auth:** API key.

**Path params:**
- `id` (UUID, required).

**Body (all fields optional):**
```json
{
  "name": "stripe-errors-v2",
  "pattern": "Stripe(?:API|\\.\\w+)Error",
  "groupBy": "stack",
  "isActive": false
}
```

**Response (200):** the updated row.

**Response (400):** `{ "error": "Invalid regex pattern" }`.
**Response (401):** `{ "error": "Invalid API key" }`.
**Response (404):** `{ "error": "Not found" }`.

```bash
curl -X PUT http://localhost:8001/api/fingerprint-rules/$RULE_ID \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "isActive": false }'
```

### DELETE /api/fingerprint-rules/:id

Delete a fingerprint rule by ID (must belong to the authorized project).

**Auth:** API key.

**Path params:**
- `id` (UUID, required).

**Response (200):** `{ "ok": true }`.

**Response (401):** `{ "error": "Invalid API key" }`.
**Response (404):** `{ "error": "Not found" }`.

```bash
curl -X DELETE http://localhost:8001/api/fingerprint-rules/$RULE_ID \
  -H "Authorization: Bearer YOUR_API_KEY"
```

---

## Subscribers (B.10)

Status-page email subscribers. The route plugin is registered with prefix `/api/subscribers` and stores rows in the `status_subscribers` table (`id`, `projectId`, `email`, `isVerified`, `createdAt`). Two POST endpoints exist: the authenticated `/` variant (used by the admin UI) and the public `/public` variant (used by the status page itself, no API key required). The public endpoint always inserts with `isVerified: false`; the authenticated endpoint honors `autoVerify` from the request body.

> **Note:** the table column is named `is_verified` / `isVerified`; subscribers are not sent a verification email by this route — verification is a separate `POST /:id/verify` call.

### GET /api/subscribers

List subscribers for the authenticated project, newest first. Optional `projectId` query must equal the authorized project.

**Auth:** API key (`Authorization: Bearer ...`).

**Query params:**
- `projectId` (string, optional) — must match the API key's project.
- `limit` (integer, optional) — clamped to `[1, 500]`, default `100`.
- `offset` (integer, optional) — clamped to `>= 0`, default `0`.

**Response (200):**
```json
{
  "data": [
    {
      "id": "<uuid>",
      "projectId": "<uuid>",
      "email": "user@example.com",
      "isVerified": false,
      "createdAt": "2026-06-27T10:00:00.000Z"
    }
  ],
  "total": 1,
  "limit": 100,
  "offset": 0
}
```

**Response (401):** `{ "error": "Unauthorized" }`.
**Response (403):** `{ "error": "Forbidden" }`.

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  "http://localhost:8001/api/subscribers?limit=100&offset=0"
```

### POST /api/subscribers

Create a subscriber from the admin UI (authenticated). The email is trimmed and lowercased before validation. Honors an `autoVerify` flag — if `true`, the row is inserted with `isVerified: true`.

**Auth:** API key.

**Body:**
```json
{
  "projectId": "<uuid>",
  "email": "user@example.com",
  "autoVerify": false
}
```
- `projectId` (string, required) — must equal the authorized project.
- `email` (string, required) — must match `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`.
- `autoVerify` (boolean, optional, default `false`).

**Response (200):** the inserted row.

**Response (400):** `{ "error": "Invalid email address" }`.
**Response (401):** `{ "error": "Unauthorized" }`.
**Response (403):** `{ "error": "Forbidden" }`.
**Response (409):** `{ "error": "Email already subscribed" }`.
**Response (500):** `{ "error": "Insert failed" }`.

```bash
curl -X POST http://localhost:8001/api/subscribers \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "'"$PROJECT_ID"'",
    "email": "user@example.com"
  }'
```

### POST /api/subscribers/public

Public subscribe endpoint intended for status page visitors — no auth required. The body `projectId` is verified to exist in the `projects` table; the row is always inserted with `isVerified: false`. No authorization is performed against the caller's API key.

**Auth:** none (public).

**Body:**
```json
{
  "projectId": "<uuid>",
  "email": "user@example.com"
}
```

**Response (200):** the inserted row.

**Response (400):** `{ "error": "Invalid email address" }`.
**Response (404):** `{ "error": "Project not found" }`.
**Response (409):** `{ "error": "Email already subscribed" }`.
**Response (500):** `{ "error": "Insert failed" }`.

```bash
curl -X POST http://localhost:8001/api/subscribers/public \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "'"$PROJECT_ID"'",
    "email": "user@example.com"
  }'
```

### DELETE /api/subscribers/:id

Unsubscribe (delete) a subscriber. The subscriber must belong to the authorized project.

**Auth:** API key.

**Path params:**
- `id` (UUID, required).

**Response (200):** `{ "deleted": true, "id": "<uuid>" }`.

**Response (401):** `{ "error": "Unauthorized" }`.
**Response (403):** `{ "error": "Forbidden" }`.
**Response (404):** `{ "error": "Subscriber not found" }`.

```bash
curl -X DELETE http://localhost:8001/api/subscribers/$SUBSCRIBER_ID \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### POST /api/subscribers/:id/verify

Mark a subscriber as verified (admin action). The subscriber must belong to the authorized project. This endpoint does not send an email — it only flips the `is_verified` column to `true`.

**Auth:** API key.

**Path params:**
- `id` (UUID, required).

**Response (200):** the updated row (`isVerified: true`).

**Response (401):** `{ "error": "Unauthorized" }`.
**Response (403):** `{ "error": "Forbidden" }`.
**Response (404):** `{ "error": "Subscriber not found" }`.
**Response (500):** `{ "error": "Update failed" }`.

```bash
curl -X POST http://localhost:8001/api/subscribers/$SUBSCRIBER_ID/verify \
  -H "Authorization: Bearer YOUR_API_KEY"
```

---

## OpenAPI Specification

### GET /api/openapi.json

Returns the full HiAi Observe API description as an **OpenAPI 3.0.3** document, generated programmatically by `src/lib/openapi.ts`. The spec covers every documented route above (paths, parameters, request bodies, response schemas, the `ApiKeyAuth` security scheme, and the component schemas referenced by the endpoints), and is intended to be fed straight into Swagger UI, Stoplight Elements, Redocly, or any OpenAPI-aware client generator.

**Auth:** none — the route is registered in `PUBLIC_PATHS` so it bypasses the API-key middleware. The spec itself documents the security scheme; clients are expected to attach their API key when calling the underlying endpoints.

**Response (200):** `application/json` OpenAPI document.

```json
{
  "openapi": "3.0.3",
  "info": {
    "title": "HiAi Observe API",
    "description": "Unified, self-hosted observability platform for AI Agents and TypeScript backends. Replaces Bugsink + Uptime Kuma + Beszel + Dozzle + LLM tracing in one lightweight container.",
    "version": "0.1.0",
    "license": { "name": "MIT", "url": "https://opensource.org/licenses/MIT" },
    "contact": { "name": "HiAi Observe", "url": "https://github.com/hiai/observe" }
  },
  "servers": [{ "url": "http://localhost:8001", "description": "Local development" }],
  "security": [{ "ApiKeyAuth": [] }],
  "tags": [
    { "name": "Health" },
    { "name": "Projects" },
    { "name": "Issues" },
    { "name": "Events" },
    { "name": "Monitors" },
    { "name": "Alerts" },
    { "name": "Traces" },
    { "name": "Logs" },
    { "name": "Dashboard" },
    { "name": "Embed" },
    { "name": "Releases" },
    { "name": "Team" },
    { "name": "Comments" },
    { "name": "Maintenance" },
    { "name": "Incidents" },
    { "name": "Notifications" },
    { "name": "Search" },
    { "name": "Infrastructure" }
  ],
  "components": {
    "securitySchemes": {
      "ApiKeyAuth": {
        "type": "apiKey",
        "in": "header",
        "name": "Authorization",
        "description": "Bearer token: Authorization: Bearer <api_key>"
      }
    },
    "schemas": { "Error": { "...": "..." }, "Issue": { "...": "..." }, "Monitor": { "...": "..." } }
  },
  "paths": { "...": "one entry per documented route" }
}
```

The `components.schemas` block defines reusable shapes for `Error`, `Project`, `Issue`, `Event`, `Monitor`, `Alert`, `AlertCondition`, `AlertChannel`, and others; response bodies reference them via `$ref` so clients can render typed forms directly.

```bash
# Fetch the spec to disk and feed it to a docs renderer
curl -fsS http://localhost:8001/api/openapi.json -o openapi.json
npx @redocly/cli preview-docs openapi.json
```

> The route is mounted by `openapiRoutes` in `src/index.ts` and is included in the middleware bypass list (`src/middleware/auth.ts` `PUBLIC_PATHS`) — no `Authorization` header is required and no `projectId` is enforced.

