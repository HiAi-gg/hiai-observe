# HiAi Observe — Embed API Contract

> Публичный API-контракт для встраивания hiai-observe как модуля в хосты экосистемы HiAi.
> Связано: [HIAI_CONVENTIONS.md §6](https://github.com/HiAi-gg/hiai-eco/blob/dev/HIAI_CONVENTIONS.md#%D0%A8%D0%B0%D0%B1%D0%BB%D0%BE%D0%BD-6-pluginproxy-%D0%BA%D0%BE%D0%BD%D1%82%D1%80%D0%B0%D0%BA%D1%82) (Plugin/Proxy контракт)

---

## Plugin Manifest

Манифест плагина (по [HIAI_CONVENTIONS.md §6](../../HIAI_CONVENTIONS.md#6-plugin--proxy-%D0%BA%D0%BE%D0%BD%D1%82%D1%80%D0%B0%D0%BA%D1%82))
лежит в корне репозитория: **[`plugin.json`](../plugin.json)**.

Он декларирует с точки зрения модуля (а не хоста) всё, что нужно для встраивания:

- `id`, `name`, `version`, `description`, `icon` — идентификация плагина.
- `navGroups` — предлагаемые пункты сайдбара для хоста.
- `proxy` — `{ prefix, target, auth: 'api-key', rateLimit }` (env-переопределяемый).
- `entrypoints` — базовые URL, health/openapi, ingest-эндпоинты (Sentry, OTLP, agent).
- `auth` — режимы аутентификации (bearer / api-key-header / sentry-dsn / ws-query) и ссылка на [AUTH_BRIDGE.md](AUTH_BRIDGE.md).
- `scope` — модель тенантов (`?projectId=` / `?tenantId=`, 1 tenant = 1 observe project), ссылка на этот документ.
- `ui` — тема `theme-observe`, токены `@hiai/ui/styles/tokens.css`, компоненты `@hiai/ui`.
- `endpoints` — полный список public / read / write / websocket эндпоинтов.
- `config` — обязательные/дефолтные/опциональные env-переменные (зеркало `src/lib/config.ts`).
- `conventions` — обратные ссылки на HIAI_CONVENTIONS, EMBED, AUTH_BRIDGE, OpenAPI.

Хосты (`hiai-admin`, `hiai-dashboard`) читают `plugin.json` для автодискавери и конфигурации
proxy/proxy-auth согласно §6, а конкретные сигнатуры/тела запросов — из этого документа.

---

## Overview

HiAi Observe — это единая платформа наблюдаемости (Sentry + Uptime Kuma + Beszel + Dozzle + LLM-трейсинг) для экосистемы HiAi, работающая на порту **8001**. Модуль предоставляет REST API и WebSocket-интерфейсы для интеграции с хостами (hiai-admin, hiai-dashboard, сайты) без привязки к конкретной технологии.

**Базовый URL:** `http://localhost:8001`

**Типы аутентификации:**
- Bearer API Key (`Authorization: Bearer ho_...`)
- Sentry DSN (`http://apikey@localhost:8001/1`)
- Публичные эндпоинты (без auth)
- WebSocket аутентификация через query-параметр `?key=...`

---

## Authentication

### Формат API Key

Все ключи имеют формат: `ho_<hex>` и scoped на проект. Ключ автоматически создается при первом старте с переменной окружения `HIAI_OBSERVE_API_KEY` или может быть сгенерирован командой:

```bash
bun run gen-key "My Project"
```

### Способы передачи ключа

1. **Bearer token** (рекомендуемый):
   ```http
   Authorization: Bearer ho_your_project_key
   ```

2. **Sentry DSN** (для совместимости):
   ```
   http://ho_your_project_key@localhost:8001/1
   ```

3. **Заголовок X-Api-Key:**
   ```http
   X-Api-Key: ho_your_project_key
   ```

4. **WebSocket query-параметр:**
   ```
   ws://localhost:8001/ws/logs?key=ho_your_project_key
   ```

---

## Scope Parameters

HiAi Observe оперирует понятием **проект** (project). В контексте embed-интеграции проект = тенант:

- Каждый проект имеет свой API-ключ (`ho_<hex>`).
- Все ключи, события, трейсы, мониторы, алерты, логи привязаны к `projectId`.
- Для мультитенантного встраивания создайте отдельный проект на тенант через `POST /api/projects`.

Фильтрация по проекту выполняется query-параметром `projectId` (UUID).

**Поддерживаемые варианты передачи scope:**

| Формат | Пример | Когда использовать |
|--------|--------|---------------------|
| Query `projectId` | `?projectId=UUID` | Когда API-ключ имеет доступ к нескольким проектам (admin-роль) |
| Авто-scope по ключу | (без параметра) | Когда ключ привязан к одному проекту (member-роль) — backend фильтрует автоматически |
| Query `tenant_id` | `?tenant_id=UUID` | Алиас для `projectId` (для совместимости с admin-тенантами hiai-admin) — алиас маппится 1:1 на `projectId` в роутере |

**Пример:**
```http
GET /api/issues?projectId=UUID&status=unresolved
GET /api/traces?projectId=UUID&workflowName=generate-article
GET /api/issues?tenant_id=UUID&status=unresolved   # алиас projectId
```

### Embed URL Pattern

Для встраивания в iframe из `hiai-admin` или `hiai-dashboard`:

```
http://localhost:8001/embed?projectId=UUID&key=ho_xxx
```

Или через серверный proxy:

```
GET /api/observe/embed/dashboard?projectId=UUID
Authorization: Bearer ho_xxx
```

**Важно:** API-ключ не должен попадать в URL в production — используйте server-side proxy или postMessage для передачи ключа во фронтенд.

---

## Endpoints

### 🏥 Health

| Метод | Путь | Аутентификация | Описание |
|-------|------|----------------|----------|
| `GET` | `/api/health` | Публичный | Каноническая проверка здоровья экосистемы HiAi. Возвращает статус, версию, аптайм, состояние зависимостей (PostgreSQL, Redis, диск), здоровье воркеров и последнюю ошибку. Возвращает 503 только если и PostgreSQL, и Redis недоступны. |
| `GET` | `/health` | Публичный | Legacy-алиас для `/api/health` (для обратной совместимости). |
| `GET` | `/metrics` | Публичный | Prometheus-метрики в формате OpenMetrics. |

**Пример ответа `/api/health`:**
```json
{
  "status": "ok",
  "version": "0.1.8",
  "uptime": 123456,
  "memory": { "usedMb": 256, "totalMb": 1024 },
  "disk": { "usedGb": 45.2, "totalGb": 100 },
  "dependencies": {
    "postgres": "up",
    "redis": "up",
    "disk": "up"
  },
  "workers": {
    "uptime": "up",
    "retention": "up",
    "maintenance": "up"
  },
  "lastError": null
}
```

---

### 📊 Dashboard

| Метод | Путь | Аутентификация | Описание |
|-------|------|----------------|----------|
| `GET` | `/api/dashboard` | API Key | Агрегированные метрики дашборда: количество ошибок за 24ч, аптайм, активные контейнеры, количество трейсов за 24ч, последние инциденты, статус мониторов, количество алертов, распределение ошибок и трейсов. |

**Параметры:**
- `projectId` (uuid, optional) — фильтр по проекту

**Пример ответа:**
```json
{
  "errorCount24h": 15,
  "uptimePercent": 99.95,
  "activeContainers": 8,
  "traceCount24h": 42,
  "recentIssues": [
    { "id": "uuid", "title": "TypeError in app.ts", "status": "unresolved", "count": 5 }
  ],
  "monitorStatuses": [
    { "id": "uuid", "name": "API Health", "status": "operational", "uptime24h": 99.95 }
  ],
  "alertCount": 3,
  "errorBuckets": [
    { "type": "TypeError", "count": 12 },
    { "type": "ReferenceError", "count": 3 }
  ],
  "traceBuckets": [
    { "model": "gpt-4o", "totalTokens": 15000, "durationMs": 1200 }
  ]
}
```

---

### 🐛 Issues (Ошибки)

| Метод | Путь | Аутентификация | Описание |
|-------|------|----------------|----------|
| `GET` | `/api/issues` | API Key | Список инцидентов с фильтрацией и пагинацией. |
| `GET` | `/api/issues/{id}` | API Key | Детали инцидента с 5 последними событиями. |
| `PATCH` | `/api/issues/{id}` | API Key | Обновление статуса инцидента (`unresolved`, `resolved`, `ignored`) или назначение. |
| `DELETE` | `/api/issues/{id}` | API Key | Удаление инцидента и всех связанных событий. |
| `POST` | `/api/issues/merge` | API Key | Слияние нескольких инцидентов в один целевой. |

**Параметры `GET /api/issues`:**
- `projectId` (uuid, optional) — фильтр по проекту
- `status` (string, optional) — `unresolved`, `resolved`, `ignored`
- `search` (string, optional) — текстовый поиск по заголовку
- `environment` (string, optional) — фильтр по окружению
- `level` (string, optional) — `error`, `warning`, `info`
- `limit` (string, optional, default "50", max 200)
- `offset` (string, optional, default "0")

**Пример ответа `GET /api/issues`:**
```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "projectId": "550e8400-e29b-41d4-a716-446655440001",
      "title": "TypeError: Cannot read property 'x' of undefined",
      "type": "error",
      "fingerprint": "abc123def456",
      "status": "unresolved",
      "count": 42,
      "firstSeen": "2026-01-01T00:00:00Z",
      "lastSeen": "2026-01-02T10:30:00Z",
      "assignedTo": null,
      "environment": "production",
      "metadata": {}
    }
  ],
  "total": 100,
  "limit": 50,
  "offset": 0
}
```

**Тело `PATCH /api/issues/{id}`:**
```json
{ "status": "resolved", "assignedTo": "user-uuid" }
```

**Тело `POST /api/issues/merge`:**
```json
{
  "targetIssueId": "550e8400-e29b-41d4-a716-446655440002",
  "sourceIssueIds": ["550e8400-e29b-41d4-a716-446655440003"]
}
```

---

### 📝 Events (События)

| Метод | Путь | Аутентификация | Описание |
|-------|------|----------------|----------|
| `GET` | `/api/events` | API Key | Список событий с фильтрацией и пагинацией. |
| `GET` | `/api/events/{id}` | API Key | Детали конкретного события. |

**Параметры `GET /api/events`:**
- `issueId` (uuid, optional) — фильтр по инциденту
- `projectId` (uuid, optional) — фильтр по проекту
- `limit` (string, optional, default "50", max 200)
- `offset` (string, optional, default "0")

**Пример ответа `GET /api/events`:**
```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440004",
      "projectId": "550e8400-e29b-41d4-a716-446655440001",
      "issueId": "550e8400-e29b-41d4-a716-446655440000",
      "message": "Something broke",
      "exceptionType": "TypeError",
      "stackTrace": "[{\"filename\":\"app.ts\",\"function\":\"main\",\"lineno\":42}]",
      "level": "error",
      "tags": { "environment": "production" },
      "context": {},
      "fingerprint": "abc123",
      "sdk": "@sentry/node@8.0.0",
      "createdAt": "2026-01-01T00:00:00Z"
    }
  ],
  "total": 50,
  "limit": 50,
  "offset": 0
}
```

---

### 📈 Monitors / Uptime (Мониторинг)

| Метод | Путь | Аутентификация | Описание |
|-------|------|----------------|----------|
| `GET` | `/api/monitors` | API Key | Список всех мониторов с аптаймом за 24 часа. |
| `POST` | `/api/monitors` | API Key | Создание нового монитора. |
| `GET` | `/api/monitors/{id}` | API Key | Детали монитора с последней проверкой. |
| `PUT` | `/api/monitors/{id}` | API Key | Обновление монитора. |
| `DELETE` | `/api/monitors/{id}` | API Key | Удаление монитора и всей истории проверок. |
| `GET` | `/api/monitors/{id}/checks` | API Key | История проверок монитора с пагинацией и фильтрацией по времени. |
| `GET` | `/api/monitors/groups` | API Key | Список групп мониторов. |

**Параметры `GET /api/monitors`:**
- `project_id` (string, optional) — фильтр по проекту
- `group` (string, optional) — фильтр по группе
- `hours` (integer, optional) — аптайм за N часов (по умолчанию 24)

**Тело `POST /api/monitors`:**
```json
{
  "name": "API Health",
  "url": "https://api.example.com/health",
  "type": "http",
  "group": "production",
  "interval_seconds": 30,
  "project_id": "550e8400-e29b-41d4-a716-446655440001",
  "method": "GET",
  "headers": {},
  "body": null,
  "ignore_ssl": false,
  "max_redirects": 5,
  "keyword": "ok"
}
```

**Пример ответа `GET /api/monitors`:**
```json
{
  "monitors": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440005",
      "projectId": "550e8400-e29b-41d4-a716-446655440001",
      "name": "API Health",
      "url": "https://api.example.com/health",
      "type": "http",
      "monitorGroup": "production",
      "intervalSeconds": 30,
      "active": true,
      "createdAt": "2026-01-01T00:00:00Z",
      "uptime24h": 99.95
    }
  ]
}
```

---

### 🚨 Status Page (Статусные страницы)

| Метод | Путь | Аутентификация | Описание |
|-------|------|----------------|----------|
| `GET` | `/api/status/{slug}` | Публичный | Публичная JSON-страница статуса проекта по слагу. |
| `GET` | `/status/{slug}` | Публичный | Публичная HTML-страница статуса проекта (для встраивания в iframes). |
| `GET` | `/api/status/{slug}/history` | Публичный | История аптайма мониторов за 30 дней. |

**Параметры:**
- `slug` (string) — слаг проекта
- `days` (number, optional, 1-90, default 30) — период истории

**Пример ответа `GET /api/status/my-project`:**
```json
{
  "project": {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "name": "My Project",
    "slug": "my-project"
  },
  "overall": "operational",
  "monitors": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440005",
      "name": "API Health",
      "url": "https://api.example.com/health",
      "active": true,
      "uptime24h": 99.95,
      "lastCheck": {
        "success": true,
        "statusCode": 200,
        "responseTimeMs": 145
      }
    }
  ]
}
```

**Значения `overall`:** `operational`, `degraded`, `down`

---

### 🖥️ Infrastructure (Инфраструктура)

| Метод | Путь | Аутентификация | Описание |
|-------|------|----------------|----------|
| `GET` | `/api/infrastructure/containers` | API Key | Текущая статистика Docker-контейнеров (live). |
| `GET` | `/api/infrastructure/containers/{id}` | API Key | История статистики конкретного контейнера. |
| `GET` | `/api/infrastructure/host` | API Key | Текущее состояние хоста (CPU, память, диск, нагрузка). |
| `GET` | `/api/infrastructure/host/history` | API Key | История состояния хоста за период. |
| `GET` | `/api/infrastructure/overview` | API Key | Комбинированная сводка по контейнерам и хосту. |

**Параметры `GET /api/infrastructure/containers/{id}`:**
- `from` (ISO datetime, optional, default 1h ago)
- `to` (ISO datetime, optional, default now)

**Пример ответа `GET /api/infrastructure/containers`:**
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

---

### 📜 Logs (Логи)

| Метод | Путь | Аутентификация | Описание |
|-------|------|----------------|----------|
| `GET` | `/api/logs` | API Key | Поиск логов с фильтрацией. |
| `GET` | `/api/logs/containers` | API Key | Список контейнеров с доступными логами. |
| `DELETE` | `/api/logs` | API Key | Очистка логов до указанного времени. |
| `GET` | `/api/logs/stats` | API Key | Статистика логов за 24 часа. |
| `GET` | `/api/logs/volume` | API Key | Объем логов за интервалы времени. |
| `WS` | `/ws/logs` | API Key (query) | WebSocket для live-просмотра логов. |

**Параметры `GET /api/logs`:**
- `container` (string, optional) — фильтр по ID контейнера
- `level` (string, optional) — фильтр по уровню (`error`, `warn`, `info`, `debug`)
- `search` (string, optional) — текстовый поиск
- `regex` (string, optional) — поиск по регулярному выражению
- `fuzzy` (string, optional) — нечеткий поиск
- `from` (ISO datetime, optional)
- `to` (ISO datetime, optional)
- `limit` (number, optional, default 100)
- `offset` (number, optional, default 0)

**Пример ответа `GET /api/logs`:**
```json
{
  "data": {
    "logs": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440006",
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

**WebSocket `/ws/logs`:**

- **Подключение:** `ws://localhost:8001/ws/logs?key=YOUR_API_KEY`
- **Аутентификация:** через query-параметр `key` или первое сообщение `{ "action": "auth", "key": "..." }`
- **Команды:**
  - `{ "action": "subscribe", "containerId": "abc123" }` — подписаться на конкретный контейнер
  - `{ "action": "subscribe_all" }` — подписаться на все логи
  - `{ "action": "unsubscribe" }` — отписаться

---

### 🔍 Traces (Трейсы)

| Метод | Путь | Аутентификация | Описание |
|-------|------|----------------|----------|
| `GET` | `/api/traces` | API Key | Список трейсов с фильтрацией. |
| `GET` | `/api/traces/{id}` | API Key | Детали трейса со всей span-иерархией. |
| `GET` | `/api/traces/stats` | API Key | Агрегированная статистика по токенам и латентности. |
| `GET` | `/api/traces/workflows` | API Key | Список запусков workflow (Mastra). |
| `GET` | `/api/traces/workflows/{id}` | API Key | Детали workflow с полным деревом spans. |

**Параметры `GET /api/traces`:**
- `projectId` (string, optional)
- `traceId` (string, optional)
- `workflowName` (string, optional) — фильтр по названию workflow
- `agentName` (string, optional) — фильтр по названию агента
- `status` (string, optional)
- `from` (ISO datetime, optional)
- `to` (ISO datetime, optional)
- `limit` (string, optional, default "50", max 200)
- `offset` (string, optional, default "0")

**Параметры `GET /api/traces/stats`:**
- `projectId` (uuid, required)
- `from` (ISO datetime, optional)
- `to` (ISO datetime, optional)
- `groupBy` (string, optional, default "model") — `model`, `agent`, `workflow`

**Пример ответа `GET /api/traces/stats`:**
```json
{
  "tokenUsage": {
    "byModel": [
      {
        "model": "gpt-4o",
        "promptTokens": 10000,
        "completionTokens": 5000,
        "totalTokens": 15000,
        "estimatedCost": 0.15
      }
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

---

### 🚨 Alerts (Алерты)

| Метод | Путь | Аутентификация | Описание |
|-------|------|----------------|----------|
| `GET` | `/api/alerts` | API Key | Список правил алертов. |
| `POST` | `/api/alerts` | API Key | Создание нового алерта. |
| `GET` | `/api/alerts/{id}` | API Key | Детали алерта с историей триггеров. |
| `PUT` | `/api/alerts/{id}` | API Key | Обновление алерта. |
| `DELETE` | `/api/alerts/{id}` | API Key | Удаление алерта. |
| `POST` | `/api/alerts/{id}/test` | API Key | Тестирование алерта (отправка во все каналы). |
| `POST` | `/api/alerts/test-all` | API Key | Тестирование всех активных алертов. |
| `GET` | `/api/alerts/history` | API Key | История триггеров алертов. |
| `GET` | `/api/alerts/channels` | API Key | Список доступных каналов уведомлений. |

**Параметры `GET /api/alerts`:**
- `projectId` (string, optional)
- `search` (string, optional) — поиск по названию
- `limit` (string, optional, default "50")
- `offset` (string, optional, default "0")

**Тело `POST /api/alerts`:**
```json
{
  "name": "High Error Rate",
  "projectId": "550e8400-e29b-41d4-a716-446655440001",
  "severity": "critical",
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

**Типы условий:**
- `error_rate` — частота ошибок
- `uptime_down` — недоступность монитора
- `resource_threshold` — порог ресурсов (CPU/память/диск)
- `trace_error` — ошибки в трейсах
- `token_usage` — превышение токенов

**Типы каналов:**
`telegram`, `discord`, `email`, `slack`, `webhook`, `pagerduty`, `teams`, `ntfy`, `gotify`, `pushover`

---

### 🤖 AI Analytics (AI-аналитика)

| Метод | Путь | Аутентификация | Описание |
|-------|------|----------------|----------|
| `GET` | `/api/traces/stats` | API Key | Статистика токенов и латентности (см. раздел Traces). |
| `GET` | `/api/traces/workflows` | API Key | Список workflow (Mastra) с фильтрацией. |
| `POST` | `/api/agent/ingest` | API Key | Инжест AI-агентов (альтернатива OTLP/Sentry). |

**Тело `POST /api/agent/ingest`:**
```json
{
  "type": "mastra",
  "data": {
    "workflow": "article-generator",
    "steps": [
      {
        "name": "fetch-data",
        "model": "gpt-4o",
        "tokens": { "prompt": 1000, "completion": 500 },
        "durationMs": 800,
        "status": "success"
      }
    ]
  }
}
```

---

### 🔎 Search (Поиск)

| Метод | Путь | Аутентификация | Описание |
|-------|------|----------------|----------|
| `GET` | `/api/search` | API Key | Юнифицированный поиск по инцидентам, событиям и трейсам. |

**Параметры:**
- `q` (string, required) — поисковый запрос
- `projectId` (uuid, optional) — фильтр по проекту
- `limit` (string, optional, default 50)

**Пример ответа:**
```json
{
  "issues": [...],
  "events": [...],
  "traces": [...]
}
```

---

### 📦 Export (Экспорт)

| Метод | Путь | Аутентификация | Описание |
|-------|------|----------------|----------|
| `GET` | `/api/export/issues` | API Key | Экспорт инцидентов в CSV. |
| `GET` | `/api/export/traces` | API Key | Экспорт трейсов в JSONL. |
| `GET` | `/api/export/logs` | API Key | Экспорт логов в JSONL. |

**Параметры:**
- `projectId` (uuid, optional) — фильтр по проекту
- `from` (ISO datetime, optional)
- `to` (ISO datetime, optional)

---

### 🎯 Embedding Patterns (Способы встраивания)

HiAi Observe поддерживает три основных паттерна интеграции с хостами экосистемы:

#### 1️⃣ Proxy (Плагин hiai-admin)

Хост (например, hiai-admin) выступает в роли прокси, перенаправляя запросы к observe с префиксом `/api/observe/...`.

**Конфигурация плагина (HIAI_CONVENTIONS.md §6):**
```yaml
plugins:
  observe:
    type: proxy
    target: http://localhost:8001
    prefix: /api/observe
    auth: inherit  # Наследует аутентификацию от хоста
```

**Пример запроса через прокси:**
```http
GET /api/observe/api/dashboard?projectId=UUID
Authorization: Bearer host_admin_key
```

**Преимущества:**
- Единая точка аутентификации
- Прозрачная маршрутизация
- Поддержка всех эндпоинтов observe

---

#### 2️⃣ Direct API (hiai-dashboard)

Хост напрямую вызывает API observe с собственным API ключом.

**Пример интеграции:**
```typescript
const response = await fetch('http://localhost:8001/api/dashboard?projectId=UUID', {
  headers: { 'Authorization': 'Bearer ho_project_key' }
});
const data = await response.json();
```

**Преимущества:**
- Максимальная гибкость
- Полный контроль над запросами
- Поддержка всех фич observe

---

#### 3️⃣ iframe (Статусные страницы)

Публичные статусные страницы могут быть встроены в хосты через iframe без аутентификации.

**Пример:**
```html
<iframe
  src="http://localhost:8001/status/my-project"
  width="100%"
  height="600px"
  frameborder="0">
</iframe>
```

**Преимущества:**
- Простота внедрения
- Нет необходимости в API ключах
- Автоматическое обновление статуса

---

## 🖥️ Dashboard Integration (hiai-dashboard)

> Наблюдательная часть со стороны **hiai-observe**. Сторона hiai-dashboard
> строится отдельно в репозитории hiai-dashboard и использует эндпоинты ниже.

**hiai-dashboard** — операторская панель (запускается на `:3333`), которая
встраивает observe через два канала:

1. **Серверный proxy** (предпочтительно) — dashboard получает данные через
   прямые API-вызовы к observe с собственным API-ключом. Dashboard не
   использует Better Auth (см. `docs/AUTH_BRIDGE.md`).
2. **iframe-встраивание** — публичные статусные страницы и обзорные
   виджеты рендерятся прямо в DOM dashboard.

### Базовые требования

| Что | Значение |
|-----|----------|
| Auth | Прямой API-ключ (`ho_<hex>`) — Bearer или `X-Api-Key` |
| CORS | `CORS_ORIGIN` должен включать `http://localhost:3333` (или прод-origin). По умолчанию CORS выключен. |
| Embed frame ancestors | `EMBED_ALLOWED_ORIGINS=http://localhost:3333` — чтобы dashboard мог фреймить `/embed/*` и `/status/*`. По умолчанию только `'self'`. |
| Rate-limit | `/embed/*`, `/status/*`, `/api/status/*` — без троттлинга (public); `/api/dashboard` и `/embed/dashboard` — 200 req/min/key (достаточно для polling-виджетов). |
| Tenant scoping | `?tenantId=<uuid>` — алиас `?projectId=`. Плагин `tenantScopePlugin` нормализует оба варианта. |

### Dashboard-specific эндпоинты

#### `GET /embed/dashboard?tenantId=<uuid>` — обзорный виджет

Используется hiai-dashboard для одной агрегированной плитки "Observe".

**Аутентификация:** project API key (Bearer или X-Api-Key).

**Параметры:**
- `tenantId` (string, optional) — алиас для `projectId`
- `projectId` (uuid, optional) — прямой project scope
- `limit` (int, optional, default 10, max 50) — размер `recentEvents`

**Ответ:**
```json
{
  "projectsCount": 1,
  "activeIssues": 3,
  "activeAlerts": 1,
  "healthStatus": "healthy",
  "recentEvents": [
    {
      "id": "uuid",
      "projectId": "uuid",
      "message": "TypeError: cannot read property",
      "exceptionType": "TypeError",
      "level": "error",
      "createdAt": "2026-06-19T10:00:00Z"
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
  ]
}
```

**Пример вызова из dashboard (server-side):**
```typescript
const apiKey = process.env.HIAI_OBSERVE_API_KEY; // dashboard-tenant's project key
const res = await fetch(
  `http://localhost:8001/embed/dashboard?tenantId=${tenantId}`,
  { headers: { Authorization: `Bearer ${apiKey}` } }
);
const overview = await res.json();
```

**Пример встраивания в iframe:**
```html
<iframe
  src="http://localhost:8001/embed?tenantId=<uuid>"
  width="100%"
  height="400"
  frameborder="0">
</iframe>
```

> Iframe-страница `/embed` тоже iframe-friendly — `X-Frame-Options: SAMEORIGIN`,
> `Content-Security-Policy: frame-ancestors 'self' <embed-allowed-origins>`.

#### `GET /embed/status/<slug>` — публичный статус (JSON)

Iframe-friendly JSON-версия публичной статус-страницы. Тот же контракт,
что и `GET /api/status/<slug>`, но со relaxed headers для фрейминга.

#### `GET /status/<slug>` — публичный статус (HTML)

Полноценная HTML-страница статуса для встраивания в dashboard без
аутентификации. CSP `frame-ancestors 'self' <embed-allowed-origins>`.

#### `GET /api/dashboard?tenantId=<uuid>` — расширенная агрегация

Расширенная версия `/embed/dashboard` с дополнительными полями
(`errorCount24h`, `traceBuckets`, `errorBuckets`, `activeContainers`,
`uptimePercent` и т.д.). Используется, когда dashboard нужна полная
аналитика, а не только обзорный снимок.

### Конфигурация observe для dashboard

Минимальный `.env`:
```bash
# Auth — ключ dashboard-tenant'а в observe
HIAI_OBSERVE_API_KEY=ho_<dashboard-tenant-key>

# CORS — разрешить dashboard-фронтенду делать XHR к /api/* и /embed/*
CORS_ORIGIN=http://localhost:3333,http://localhost:5174

# Frame ancestors — разрешить dashboard фреймить /embed/* и /status/*
EMBED_ALLOWED_ORIGINS=http://localhost:3333
```

После изменения `.env` — `bun run dev` (или restart контейнера).

### Чего dashboard **не должен** делать

- ❌ Не пробрасывать ключи пользователей через Better Auth — observe
  работает только с собственными API-ключами (`ho_<hex>`).
- ❌ Не обращаться к `/api/admin/*` — это серверный канал между
  hiai-admin-proxy и observe (см. `docs/AUTH_BRIDGE.md`).
- ❌ Не встраивать `/embed/dashboard` в браузерный iframe с прямым
  API-ключом в URL — это публичная утечка ключа. Серверный fetch или
  postMessage из dashboard-приложения.

---

Все эндпоинты документированы в формате OpenAPI 3.0 и доступны публично:

```http
GET /api/openapi.json
```

**Пример ответа:**
```json
{
  "openapi": "3.0.3",
  "info": {
    "title": "HiAi Observe API",
    "version": "0.1.0",
    "license": { "name": "MIT" }
  },
  "servers": [{ "url": "http://localhost:8001" }],
  "paths": { ... }
}
```

---

## Rate Limiting (Ограничение запросов)

- **Лимит:** 1000 запросов в минуту на API ключ
- **Заголовки ответа:**
  - `X-RateLimit-Limit: 1000`
  - `X-RateLimit-Remaining: 950`
  - `X-RateLimit-Reset: 30` (секунд до сброса)

При превышении лимита возвращается HTTP 429 с телом:
```json
{ "error": "Rate limit exceeded", "retryAfter": 30 }
```

---

## MCP Server (Для AI-агентов)

HiAi Observe предоставляет Model Context Protocol (MCP) сервер для интеграции с AI-агентами (Claude Code, Cursor, Copilot и др.):

```json
{
  "mcpServers": {
    "hiai-observe": {
      "command": "npx",
      "args": ["-y", "-p", "@hiai-gg/hiai-observe", "hiai-observe-mcp"],
      "env": {
        "HIAI_OBSERVE_URL": "http://localhost:8001",
        "HIAI_OBSERVE_API_KEY": "ho_your_key"
      }
    }
  }
}
```

**Доступные инструменты MCP:**
- `observe_dashboard` — получение агрегированных данных дашборда
- `observe_list_issues` — список инцидентов
- `observe_uptime` — статус мониторов
- `observe_ai_cost` — аналитика токенов
- `observe_traces` — трейсы и workflow
- `observe_logs` — логи
- `observe_search` — унифицированный поиск

---

## SDK и CLI

Для удобства интеграции доступны:

### TypeScript SDK
```typescript
import { HiaiObserveClient } from "@hiai-gg/hiai-observe";

const client = new HiaiObserveClient({
  endpoint: "http://localhost:8001",
  apiKey: "ho_your_key"
});

const issues = await client.issues.list({ projectId: "UUID" });
```

### CLI
```bash
# Установка
bun add -g @hiai-gg/hiai-observe

# Получение дашборда
HIAI_OBSERVE_API_KEY=ho_your_key hiai-observe dashboard

# Анализ токенов
HIAI_OBSERVE_API_KEY=ho_your_key hiai-observe ai-cost --group-by model
```

---

## Best Practices (Рекомендации)

1. **Безопасность:**
   - Храните API ключи в секретах хоста, никогда не коммитьте в код
   - Используйте разные ключи для разных проектов
   - Ограничивайте доступ по IP при необходимости

2. **Производительность:**
   - Кешируйте результаты `/api/dashboard` и `/api/status/*` на стороне хоста
   - Используйте пагинацию (`limit`/`offset`) для больших наборов данных
   - Подписывайтесь на WebSocket `/ws/logs` для live-данных вместо опроса

3. **Мониторинг:**
   - Настройте алерты на критичные метрики (например, `error_rate > 10%`)
   - Используйте `/api/health` для проверки здоровья observe
   - Следите за `/metrics` для Prometheus

4. **Интеграция:**
   - Для hiai-admin используйте паттерн **Proxy**
   - Для hiai-dashboard используйте **Direct API**
   - Для публичных статусных страниц используйте **iframe**

---

## Примеры интеграций

### Пример 1: Проверка здоровья деплоя

```bash
#!/bin/bash
API_KEY="ho_your_key"
PROJECT_ID="550e8400-e29b-41d4-a716-446655440001"

# Проверяем здоровье
HEALTH=$(curl -s -H "Authorization: Bearer $API_KEY" "http://localhost:8001/api/health")
if [[ $(echo "$HEALTH" | jq -r '.status') != "ok" ]]; then
  echo "❌ Observe unhealthy: $HEALTH"
  exit 1
fi

# Проверяем ошибки за последние 24 часа
ERRORS=$(curl -s -H "Authorization: Bearer $API_KEY" \
  "http://localhost:8001/api/issues?projectId=$PROJECT_ID&status=unresolved&limit=1")
if [[ $(echo "$ERRORS" | jq -r '.total') -gt 0 ]]; then
  echo "❌ Found unresolved issues: $ERRORS"
  exit 1
fi

echo "✅ Deploy is healthy!"
```

### Пример 2: Встраивание статусных страниц

```html
<div class="status-page-embed">
  <h3>Service Status</h3>
  <iframe
    src="http://localhost:8001/status/my-project"
    width="100%"
    height="500px"
    style="border: 1px solid #ddd; border-radius: 8px;"
    onload="this.style.height = this.contentWindow.document.body.scrollHeight + 'px';">
  </iframe>
</div>
```

### Пример 3: Интеграция с CI/CD

```yaml
# .github/workflows/deploy.yml
name: Deploy
on: [push]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Check Observe health
        run: |
          HEALTH=$(curl -s http://localhost:8001/api/health)
          if [[ $(echo "$HEALTH" | jq -r '.status') != "ok" ]]; then
            echo "Observe is unhealthy!"
            exit 1
          fi
      
      - name: Run tests
        run: bun test
        env:
          HIAI_OBSERVE_API_KEY: ${{ secrets.HIAI_OBSERVE_API_KEY }}
```

---

## Версии и совместимость

- **Текущая версия:** v0.1.8
- **API версия:** v1 (стабильный контракт)
- **Совместимость:** обратная совместимость сохраняется внутри major-версии

Список изменений: [CHANGELOG.md](CHANGELOG.md)

---

## Контакты и поддержка

- **Репозиторий:** https://github.com/HiAi-gg/hiai-observe
- **Документация:** https://github.com/HiAi-gg/hiai-observe/tree/dev/docs
- **Сообщество:** https://github.com/HiAi-gg/hiai-observe/discussions
- **Баги:** https://github.com/HiAi-gg/hiai-observe/issues

---

> **📌 Важно:** Документ обновляется в соответствии с текущей версией API. Для актуальной информации всегда проверяйте `/api/openapi.json` или [README.md](README.md).