# HiAi Observe — API Reference

Base URL: `http://localhost:8001`

Authentication: Bearer token or Basic auth (`apikey:`) in `Authorization` header, or `X-Api-Key` header. Some endpoints require a valid project API key; others are unauthenticated.

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

OTLP HTTP trace export (JSON format). Accepts standard OpenTelemetry `resourceSpans` payload.

**Auth:** Bearer token, Basic auth, or `X-Api-Key` header (project API key)

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

### POST /v1/metrics

OTLP HTTP metrics export (JSON format).

**Auth:** Same as `/v1/traces`

**Body:**
```json
{
  "resourceMetrics": [...]
}
```

**Response (200):** `{}`

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
