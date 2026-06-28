# Auth Bridge: JWT ↔ API-key

**Статус:** Дизайн-решение, фаза OBS2.3a  
**Дата:** 2026-06-18  
**Контекст:** [HIAI_CONVENTIONS.md](../../HIAI_CONVENTIONS.md) §5, §6 · [todo.md](../todo.md) OBS2

---

## Проблема

`hiai-observe` и хосты экосистемы (`hiai-admin`, `hiai-dashboard`) используют принципиально разные модели аутентификации. При встраивании observe как модуля по plugin-контракту (§6) возникает необходимость в auth-мосте.

### hiai-observe (текущее)

| Аспект | Реализация |
|--------|-----------|
| **Auth** | API Key (Bearer token) |
| **Хранение** | bcrypt hash в колонке `projects.apiKeyHash`, prefix-индекс (`keyPrefix CHAR(8)`) |
| **Верификация** | `Bun.password.verify(apiKey, hash)` с LRU-кешем (60s TTL, max 1000) |
| **Пользователи** | Нет. API key = учётная запись проекта |
| **Сессии** | Нет |
| **Изоляция** | По `projectId` — каждый API key принадлежит одному проекту |
| **Роли** | `admin` / `member` / `readonly` (на уровне API key) · [src/lib/rbac.ts](../src/lib/rbac.ts) |
| **Middleware** | Elysia `derive()` + `onBeforeHandle(authGuard)` → `resolveProjectId()` → `lookupProject()` · [src/middleware/auth.ts](../src/middleware/auth.ts) |
| **Публичные пути** | `/api/health`, `/health`, `/metrics`, `/api/status/:slug`, `/v1/traces`, `/v1/metrics` |
| **Конфигурация** | `HIAI_OBSERVE_API_KEY` (bootstrap), `ADMIN_API_KEY` (retention worker) |

### hiai-admin (хост)

| Аспект | Реализация |
|--------|-----------|
| **Auth** | Better Auth (JWT, сессии, SSO) |
| **Хранение** | PostgreSQL через Drizzle adapter |
| **Сессии** | 7 дней, cookie-based, refresh каждые 24h |
| **Изоляция** | По `tenantId` (таблица `user_tenant_access`) |
| **Роли** | `super_admin` / `tenant_admin` / `staff` + RBAC-матрица |
| **Middleware** | `hooks.server.ts` → `auth.api.getSession()` + `userService.getByEmail()` |
| **Прокси** | `/api/[plugin]/[...path]/+server.ts` → mintBackendToken (HS256) или forward api-key |
| **Plugin-контракт** | §6: `ProxyConfig.auth: 'jwt' \| 'api-key'` |

### hiai-dashboard (хост)

| Аспект | Реализация |
|--------|-----------|
| **Auth** | Внутренний operator tool, один оператор |
| **Мультитенантность** | Нет |
| **Текущая интеграция** | HTTP-прокси на :8001 |

### Ключевое расхождение

```
observe:  API Key → projectId          (нет понятия user/tenant)
admin:    JWT → userId → tenantId[]    (нет понятия API key)
dashboard: без auth                     (один оператор)
```

При запросе admin → observe через plugin-proxy нужно преобразовать JWT-сессию пользователя в API-key авторизацию observe, сохранив tenant-изоляцию.

---

## Анализ вариантов

### Вариант A: Proxy-трансляция (на стороне admin)

**Описание:** Admin proxy перехватывает запрос, валидирует сессию Better Auth, маппит tenant → observe-project → API-key, добавляет `?tenantId=` query param. Observe **не знает** о Better Auth — продолжает работать с API keys.

**Схема потока:**
```
Browser (admin UI, tenant=X)
  │  Cookie: better-auth.session_token
  ▼
hooks.server.ts → auth.api.getSession() → user { id, email, role, tenantIds: [X] }
  │
  ▼
Plugin proxy /api/observe/dashboard
  │  1. Проверка: user.tenantIds.includes(tenantId) ✓
  │  2. Резолв: tenantId → observe API key (из plugin settings DB)
  │  3. Инжект: Authorization: Bearer <observe_api_key>
  │  4. Добавка: ?tenantId=X → observe
  ▼
hiai-observe :8001
  │  1. resolveProjectId(apiKey) → bcrypt verify → projectId
  │  2. query.tenantId → фильтрация данных
  │  3. RBAC check (readonly для health-запросов)
  ▼
  [{ monitor, uptime, issues }]  ← только данные tenant X
```

**Плюсы:**
- ✅ **Observe не меняется** — продолжает работать с API keys, не знает о Better Auth/JWT
- ✅ **Single responsibility** — observe = приёмник телеметрии, admin = auth provider
- ✅ **Обратная совместимость** — существующие API-key клиенты (Mastra exporter, Sentry SDK, OTLP) не затрагиваются
- ✅ **Безопасность** — observe не видит пользовательские JWT, не участвует в SSO-контуре, no token leakage
- ✅ **Использует существующую инфраструктуру** — proxy handler `+server.ts` уже есть, нужно только расширить для api-key режима
- ✅ **Гранулярный контроль** — admin решает, какой tenant к какому observe-project маппится
- ✅ **Расширяемость** — добавление нового tenant = новый observe project + API key

**Минусы:**
- ❌ Admin должен хранить observe API keys и маппинг tenant→project
- ❌ Двойной запрос (admin → observe) добавляет latency (~2-5ms на локальной сети)
- ❌ Admin proxy — дополнительная точка отказа (mitigated: observe всё ещё доступен напрямую для API-key клиентов)

**Сложность реализации:**
- В **admin:** M (4h) — расширение proxy handler для api-key injection + tenant→API-key маппинг в plugin settings
- В **observe:** S (1h) — поддержка `?tenantId=` в list-эндпоинтах (уже запланировано в OBS2.3b)

---

### Вариант B: JWT в observe

**Описание:** Observe учится принимать JWT (Better Auth shared secret), маппит tenantId → projectId, валидирует токен напрямую. Observe становится aware of Better Auth.

**Плюсы:**
- ✅ Нет промежуточного proxy — прямой запрос admin → observe
- ✅ Не нужно хранить API keys в admin

**Минусы:**
- ❌ **Observe должен знать Better Auth secret** — shared secret между админкой и модулем телеметрии
- ❌ **Observe участвует в SSO-контуре** — нарушение single responsibility
- ❌ **Сложная миграция** — нужно менять всю auth-инфраструктуру observe: `resolveApiKey()`, `lookupProject()`, middleware, RBAC
- ❌ **Два режима auth** — поддержка и JWT, и API-key одновременно → удвоение поверхности атаки
- ❌ **Token leakage risk** — observe как OSS-проект может быть развёрнут третьими лицами; наличие Better Auth secret в его конфиге — риск
- ❌ **Ломает обратную совместимость** — Sentry DSN, OTLP-клиенты ожидают API key, не JWT
- ❌ **Observe не готов к JWT** — нет понятия пользователь, сессия, tenant; нужно добавлять `users`/`sessions` таблицы
- ❌ **JWT verification overhead** — bcrypt lookup (текущий) быстрее чем JWT verify + DB lookup для tenant→project маппинга
- ❌ **hiai-dashboard** — внутренний инструмент без Better Auth, всё равно нужен API key для него

**Сложность реализации:**
- В **observe:** XL (16+h) — полная переработка auth middleware + JWT verification + tenant mapping + двойной режим
- В **admin:** S (1h) — убрать API key из plugin config

---

### Вариант C: Read-only public endpoints

**Описание:** Выделить read-only публичные эндпоинты в observe (без auth), как status-page. Admin/dashboard запрашивают их напрямую. Только для просмотра.

**Плюсы:**
- ✅ Минимальная сложность — добавить path в `PUBLIC_PATHS`
- ✅ Нет auth-моста вообще
- ✅ Подходит для health-карточки tenant

**Минусы:**
- ❌ **Только read-only** — нельзя управлять алертами, проектами, мониторами через admin
- ❌ **Data leak** — любой, кто знает URL observe, видит данные всех tenant
- ❌ **Нет tenant-изоляции** — без auth не знаем, кто запрашивает
- ❌ **Не подходит для write-операций** — алерты, maintenance windows, incidents требуют auth
- ❌ **Не соответствует §6** — plugin-контракт предполагает полноценную интеграцию, не только health

**Сложность реализации:**
- В **observe:** S (0.5h) — добавить `/api/tenant-health` в PUBLIC_PATHS
- В **admin:** S (0.5h) — прямой fetch без auth

---

## Рекомендация

### ✅ Вариант A — Proxy-трансляция (на стороне admin)

**Обоснование по критериям:**

| Критерий | A (proxy) | B (JWT в observe) | C (read-only) | Вывод |
|----------|-----------|-------------------|---------------|-------|
| **Сложность в observe** | 🟢 S (1h) | 🔴 XL (16+h) | 🟢 S (0.5h) | A выигрывает — observe почти не меняется |
| **Сложность в admin** | 🟡 M (4h) | 🟢 S (1h) | 🟢 S (0.5h) | Приемлемо — admin уже имеет proxy-инфраструктуру |
| **Соответствие §6** | 🟢 Полное | 🟡 Частичное | 🔴 Только health | A использует plugin-контракт как задумано |
| **Обратная совместимость** | 🟢 Полная | 🔴 Ломается | 🟢 Полная | B требует ломать Sentry/OTLP/Mastra клиентов |
| **Безопасность** | 🟢 Observe изолирован | 🔴 Shared secret leak | 🔴 Нет auth совсем | A — observe не в SSO-контуре |
| **Single responsibility** | 🟢 observe=телеметрия | 🔴 observe=auth provider | 🟢 observe=телеметрия | A сохраняет границы |
| **Расширяемость** | 🟢 1 tenant=1 project | 🟡 Двойной режим auth | 🔴 Только просмотр | A масштабируется добавлением API keys |

### Почему не B

1. **Observe — OSS-проект с MIT-лицензией.** Он разворачивается третьими лицами независимо от экосистемы HiAi. Внедрение Better Auth secret в его конфиг создаёт неоправданную связность и риск утечки секрета.
2. **Observe спроектирован вокруг API keys.** 5 форматов авторизации (Bearer, Basic, Sentry DSN, X-API-Key, raw), bcrypt + LRU cache, RBAC на уровне ключа — всё это становится мёртвым кодом при переходе на JWT.
3. **Observe не имеет понятия «пользователь».** Добавление таблиц `users`, `sessions`, tenant-маппинга — это scope creep, превращающий телеметрический модуль в auth-провайдера.
4. **Конвенции (§5) требуют единого Better Auth для SSO**, но **не** требуют, чтобы каждый модуль сам валидировал JWT. Наоборот, §6 явно предусматривает `auth: 'api-key'` для случаев, когда модуль не должен знать о пользователе.
5. **hiai-dashboard** — внутренний инструмент без Better Auth. При варианте B dashboard всё равно нужен API key, что приводит к поддержке двух режимов auth в observe.

### Почему не C

1. **Недостаточно для plugin-контракта** — §6 требует, чтобы модуль мог полноценно управляться через admin (не только просмотр).
2. **Безопасность** — public эндпоинты раскрывают данные всех tenant любому, кто знает URL observe.
3. **Тупиковый путь** — даже если сейчас нужна только health-карточка, позже потребуется управление алертами/мониторами через admin.

### Ключевое архитектурное решение

**Admin — единственный держатель маппинга tenant → observe-project → API-key.** Observe остаётся stateless относительно мультитенантности: он получает `?tenantId=` query param и фильтрует данные. Admin гарантирует, что пользователь видит только данные своих tenant.

Это соответствует:
- **§5** — данные изолируются по `tenantId` на уровне сервиса (admin — тот сервис, который обеспечивает изоляцию)
- **§6** — `proxy.auth: 'api-key'` означает, что модуль не проверяет пользовательский JWT, а proxy обеспечивает авторизацию
- **Single responsibility** — observe = приёмник/анализатор телеметрии, admin = auth/RBAC/мультитенантность

---

## Архитектура выбранного варианта

### Общая схема

```
┌──────────────────────────────────────────────────────────────────────┐
│                        hiai-admin (SvelteKit)                         │
│                                                                      │
│  ┌───────────────────┐    ┌──────────────────────────────────────┐  │
│  │ hooks.server.ts    │    │ /api/observe/[...path]/+server.ts    │  │
│  │                    │    │                                      │  │
│  │ auth.api           │    │ 1. auth guard (tenant access check)  │  │
│  │  .getSession()     │───▶│ 2. resolve observe config:           │  │
│  │                    │    │    tenantId → API key mapping         │  │
│  │ user {             │    │ 3. inject Authorization header:      │  │
│  │   id, email,       │    │    Bearer <observe_api_key>           │  │
│  │   role,            │    │ 4. append query param:               │  │
│  │   tenantIds: [X]   │    │    ?tenantId=X                        │  │
│  │ }                  │    │ 5. fetch observe backend              │  │
│  └───────────────────┘    └──────────────┬───────────────────────┘  │
│                                          │                           │
│  ┌───────────────────────────────────────┼───────────────────────┐  │
│  │ Plugin Settings DB                    │                       │  │
│  │                                       │                       │  │
│  │ plugin_settings:                      │                       │  │
│  │   plugin_id: "hiai-observe"           │                       │  │
│  │   tenant_id:  "tenant_X"              │                       │  │
│  │   api_key:     "ho_abc123..."         │                       │  │
│  │   project_id:  "uuid-of-project-X"    │                       │  │
│  └───────────────────────────────────────┼───────────────────────┘  │
└──────────────────────────────────────────┼──────────────────────────┘
                                           │
                                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│                        hiai-observe (:8001)                           │
│                                                                      │
│  ┌───────────────────┐    ┌──────────────────────────────────────┐  │
│  │ Auth Middleware    │    │ API Routes                           │  │
│  │                    │    │                                      │  │
│  │ resolveProjectId() │    │ GET /api/dashboard?tenantId=X        │  │
│  │   ↓                │───▶│   → filter by projects.tenant_id     │  │
│  │ lookupProject()    │    │                                      │  │
│  │   ↓                │    │ GET /api/tenant/:tenantId/health     │  │
│  │ bcrypt verify      │    │   → aggregated per-tenant stats      │  │
│  │   ↓                │    │                                      │  │
│  │ projectId + role   │    │ GET /api/monitors?tenantId=X         │  │
│  └───────────────────┘    │   → filter by tenant                  │  │
│                           └──────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

### Token flow

```
1. Browser → admin:  Cookie: better-auth.session_token=xxx
2. Admin hooks:      auth.api.getSession() → user { id, email, role, tenantIds: [X] }
3. Admin proxy:      tenantId X → observe API key "ho_abc123..."
4. Admin → observe:  GET /api/dashboard?tenantId=X
                     Authorization: Bearer ho_abc123...
5. Observe auth:     resolveProjectId("ho_abc123...") → bcrypt verify → projectId
6. Observe RBAC:     checkReadAccess(projectId) → ✓ (readonly+ for GET)
7. Observe query:    SELECT ... FROM monitors WHERE tenant_id = 'X'
8. Observe → admin:  [{ monitor1, monitor2, ... }]
9. Admin → browser:  JSON response (tenant X data only)
```

### Tenant → Project mapping

Admin хранит маппинг в plugin settings (БД `hiai-admin`):

```sql
-- В hiai-admin backend (не в observe!)
CREATE TABLE plugin_tenant_config (
  plugin_id   TEXT NOT NULL,        -- "hiai-observe"
  tenant_id   TEXT NOT NULL,        -- UUID тенанта
  observe_api_key TEXT NOT NULL,    -- API key observe (зашифрован)
  observe_project_id TEXT,          -- UUID проекта в observe (для прямых ссылок)
  observe_url TEXT NOT NULL,        -- URL observe бэкенда
  created_at  TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (plugin_id, tenant_id)
);
```

**Рекомендация:** 1 tenant = 1 observe project. Admin API создаёт observe project (через observe API) при регистрации tenant, сохраняет API key в `plugin_tenant_config`.

### Query param контракт

Observe принимает опциональный `?tenantId=` на всех list-эндпоинтах:

| Endpoint | Параметр | Поведение |
|----------|---------|-----------|
| `GET /api/dashboard` | `?tenantId=X` | Фильтрация проектов по `tenant_id` |
| `GET /api/monitors` | `?tenantId=X` | Фильтрация мониторов проекта tenant |
| `GET /api/issues` | `?tenantId=X` | Фильтрация issues |
| `GET /api/alerts` | `?tenantId=X` | Фильтрация алертов |
| `GET /api/tenant/:tenantId/health` | — | Агрегированный health срез |
| `POST /api/alerts` | — | Создание через API key (write — только admin/member) |

---

## План реализации

### Что меняется в observe

| # | Изменение | Файл | Усилие | Описание |
|---|-----------|------|--------|----------|
| 1 | Добавить `tenant_id` в таблицу `projects` | `src/store/schema.ts` | 0.5h | `tenant_id TEXT` (nullable, без default) |
| 2 | Миграция БД | `drizzle/` | 0.5h | `ALTER TABLE projects ADD COLUMN tenant_id TEXT` |
| 3 | Фильтрация по `?tenantId=` в list-эндпоинтах | `src/api/dashboard.ts`, `monitors.ts`, `issues.ts`, `alerts.ts`, `events.ts`, `traces.ts`, `logs.ts` | 4h | WHERE `tenant_id = query.tenantId` если параметр передан |
| 4 | Health-эндпоинт per-tenant | Новый `src/api/tenant-health.ts` | 3h | `GET /api/tenant/:tenantId/health` → `{ tenantId, projects, openIssues, avgUptime, lastError }` |
| 5 | RBAC: tenant-health — read-only доступ | `src/middleware/auth.ts` | 0.5h | Добавить `/api/tenant/` в PUBLIC_PATHS или разрешить с api-key |
| 6 | Документация | `docs/EMBED.md` | 0.5h | Описать `?tenantId=` и `/api/tenant/:tenantId/health` |
| **Итого observe** | | | **~9h** | |

### Что меняется в admin

| # | Изменение | Файл | Усилие | Описание |
|---|-----------|------|--------|----------|
| 1 | Plugin-манифест hiai-observe | `app/src/lib/plugins/hiai-observe.ts` | 1h | `HiAiPlugin` с `proxy.auth: 'api-key'` |
| 2 | Tenant→API-key маппинг в БД | `backend/src/db/schema/plugin-tenant-config.ts` | 1h | Новая таблица `plugin_tenant_config` |
| 3 | API для управления маппингом | `backend/src/api/routes/plugin-config.ts` | 2h | CRUD для plugin_tenant_config |
| 4 | Расширение proxy handler для api-key injection | `app/src/routes/api/[plugin]/[...path]/+server.ts` | 2h | Для `auth: 'api-key'`: резолвить API key из plugin_tenant_config, инжектить в Authorization |
| 5 | TenantId injection в query param | `app/src/routes/api/[plugin]/[...path]/+server.ts` | 1h | Добавлять `?tenantId=X` к URL observe |
| 6 | Health-карточка tenant в UI | `app/src/routes/(admin)/tenants/[id]/+page.svelte` | 2h | Fetch `/api/tenant/:tenantId/health` через proxy |
| 7 | Создание observe project при регистрации tenant | `backend/src/api/routes/tenants.ts` | 1.5h | POST /api/observe/projects через observe API, сохранить API key |
| **Итого admin** | | | **~10.5h** | |

### Что меняется в dashboard

| # | Изменение | Файл | Усилие | Описание |
|---|-----------|------|--------|----------|
| 1 | Замена HTTP-прокси на observe API key auth | `dashboard/src/routes/observe/` | 2h | API key из env, не самописный прокси |
| **Итого dashboard** | | | **~2h** | |

### Порядок выполнения

```
Шаг 1 (observe):  schema.ts + миграция (tenant_id)
Шаг 2 (observe):  tenant-health endpoint + ?tenantId= фильтрация
Шаг 3 (admin):    plugin_tenant_config таблица + API
Шаг 4 (admin):    расширение proxy handler
Шаг 5 (admin):    plugin-манифест
Шаг 6 (admin):    tenant health карточка
Шаг 7 (dashboard): замена прокси
```

---

## Риски и митигации

| Риск | Вероятность | Влияние | Митигация |
|------|------------|---------|-----------|
| `tenant_id` миграция ломает обратную совместимость | Низкая | Высокое | Nullable, без default. Существующие проекты = NULL → без фильтрации. Все текущие API-key клиенты продолжают работать. |
| Admin proxy добавляет latency | Средняя | Низкое | Локальная сеть (Docker): +2-5ms. Для health-карточки tenant — допустимо. Для high-frequency запросов — кеширование на стороне admin (Redis, 60s TTL). |
| API key observe хранится в admin БД | Средняя | Высокое | Шифрование at rest (AES-256-GCM, как `jwtSecretEncrypted` в site_adapters). Доступ только через admin backend API. |
| Proxy handler не форвардит query params корректно | Низкая | Среднее | Существующий handler уже форвардит `search` (строка 35-36 `+server.ts`). Добавить тест: `?tenantId=X` → observe получает `?tenantId=X`. |
| Несколько tenant → один observe project → смешивание данных | Средняя | Критическое | Рекомендация: 1 tenant = 1 observe project. Admin API создаёт observe project при регистрации tenant. Валидация: admin proxy проверяет `tenant_id` маппинг перед запросом. |
| Dashboard embed ломает observe SPA-роутинг | Средняя | Высокое | iframe с настраиваемым `X-Frame-Options`. Альтернатива: прямые API-запросы с API key из env dashboard. |
| Admin ↔ observe network partition | Низкая | Среднее | Health-check на стороне admin: `GET /api/health` observe (уже есть). При недоступности — degraded state в UI, не блокирует admin. |

---

## Альтернативный сценарий: hiai-dashboard

Dashboard — внутренний операторский инструмент, без Better Auth. Для него:

- **Не нужен proxy-мост.** Dashboard использует observe напрямую через API key (из env `HIAI_OBSERVE_API_KEY`).
- **Без tenant-фильтрации.** Оператор видит все проекты (полный обзор платформы).
- **Замена HTTP-прокси** на прямые API-запросы с `Authorization: Bearer <api_key>`.

Это соответствует U3.4 из [HIAI_ECOSYSTEM_UNIFICATION_PLAN.md](../../HIAI_ECOSYSTEM_UNIFICATION_PLAN.md):

> dashboard: довести `/observe` от HTTP-прокси до embed по контракту

---

## Приложение: Сравнение с существующими adapters

Admin уже имеет несколько adapter-паттернов:

| Adapter | `proxy.auth` | Механизм | Хранилище секрета |
|---------|-------------|----------|-------------------|
| `hiai-post` | `'jwt'` | mintBackendToken (HS256) | `siteAdapters.jwtSecretEncrypted` |
| `hiai-store` | `'jwt'` | mintBackendToken (HS256) | `siteAdapters.jwtSecretEncrypted` |
| `umami` | `'api-key'` | forward caller creds (текущий) | env / plugin config |
| **`hiai-observe`** | **`'api-key'`** | **inject API key from plugin config** (новый) | **`plugin_tenant_config.observe_api_key`** |

Отличие observe от umami: для umami достаточно форвардить оригинальный auth header (umami имеет собственный механизм). Для observe нужно **инжектировать** API key (который admin знает из конфига), а не форвардить пользовательский JWT.

---

## Заключение

**Вариант A (proxy-трансляция) утверждён** как архитектурное решение для auth-моста между hiai-observe и хостами экосистемы.

Ключевые принципы:
1. **Observe не знает о Better Auth** — продолжает работать с API keys
2. **Admin — держатель маппинга** tenant → observe-project → API-key
3. **1 tenant = 1 observe project** — изоляция данных на уровне проекта
4. **API key injection** — admin proxy добавляет `Authorization: Bearer <api_key>` и `?tenantId=`
5. **Обратная совместимость** — Sentry/OTLP/Mastra клиенты не затрагиваются

---

## Observe-side implementation

На стороне observe мост реализован как набор server-to-server endpoint'ов под префиксом `/api/admin/*`, защищённых **отдельным** shared secret `ADMIN_API_KEY` (а не проектным API key). Это позволяет hiai-admin-proxy управлять проектами для tenant'ов, не получая доступа к данным существующих проектов.

### Endpoints

| Метод | Путь | Описание |
|-------|------|----------|
| `POST` | `/api/admin/projects` | Создать observe-проект (опц. `tenantId`) и минтить API key. Идемпотентно по `tenantId` — если проект существует, ключ ротируется и возвращается `{ rotated: true }`. |
| `GET` | `/api/admin/projects` | Список всех проектов (без `apiKeyHash` / `apiKey`, только превью префикса). Используется admin-proxy для bootstrap'а маппинга. |
| `POST` | `/api/admin/projects/:id/rotate-key` | Форс-ротация ключа существующего проекта. Возвращает новый plaintext **один раз**. |
| `GET` | `/api/admin/tenants/:tenantId` | Резолв `tenantId` → `project { id, keyPrefix, name, ... }`. Lookup-путь, по которому admin-proxy на каждый входящий запрос находит нужный API key. Возвращает 404 если tenant не provisioned. |

### Auth model

Все четыре endpoint'а используют единый `requireAdminKey()` ([src/lib/admin-auth.ts](../src/lib/admin-auth.ts)):

- **Заголовок:** `Authorization: Bearer <ADMIN_API_KEY>` (raw token тоже принимается для back-compat)
- **Сравнение:** `crypto.timingSafeEqual()` — constant-time, чтобы не давать тайминг-оракула
- **Если `ADMIN_API_KEY` не сконфигурирован** → **403 endpoint disabled** (fail-closed: безопаснее, чем failing open)
- **Невалидный / отсутствующий токен** → **401**

`/api/admin/*` добавлен в `PUBLIC_PATHS` ([src/middleware/auth.ts](../src/middleware/auth.ts)) — глобальный `authGuard` его **пропускает**, авторизацию делает сам handler через `requireAdminKey()`. Это намеренно: admin-прокси использует серверный shared secret, а не проектный API key.

### Ключевой flow

```
1. admin-proxy POST /api/admin/projects {name: "Acme", tenantId: "tenant-X"}
   → observe создаёт project {id, tenantId: "tenant-X"}, минтит API key "ho_..."
   → response: { project: {...}, apiKey: "ho_..." (одноразово) }

2. admin-proxy шифрует "ho_..." и сохраняет в plugin_tenant_config.observe_api_key

3. На каждый входящий запрос пользователя tenant X:
   admin-proxy GET /api/admin/tenants/tenant-X
   → { tenantId: "tenant-X", project: {id, keyPrefix: "ho_abcd12...", ...} }
   (если 404 — tenant не provisioned, admin-proxy вызывает шаг 1)

4. admin-proxy делает fetch к observe backend:
   GET /api/dashboard?tenantId=tenant-X
   Authorization: Bearer ho_...
   → observe authGuard → resolveProjectId → projectId
   → tenantScopePlugin нормализует ?tenantId= → ?project_id=projectId
   → handler фильтрует по projectId
```

### Threat model & key rotation

- **Кто видит plaintext API key?** Только вызывающий в момент `POST /api/admin/projects` (или `/rotate-key`). Observe хранит только `apiKeyHash` (bcrypt) + `keyPrefix` (8 символов для narrowing). Plaintext невосстановим.
- **Компрометация `ADMIN_API_KEY`?** Может позволить злоумышленнику минтить ключи для tenant'ов. Митигация: (a) ограничить `ADMIN_API_KEY` только на admin-proxy (server-to-server, не в браузере), (b) rotation через смену env + рестарт. Endpoint'ы также позволяют форс-ротацию per-project через `/rotate-key` — это **не** зависит от `ADMIN_API_KEY` (тоже использует его), но даёт операционный рычаг.
- **Утечка `observe_api_key` из БД admin?** API key шифруется at rest (AES-256-GCM, как `jwtSecretEncrypted` в `site_adapters`). За хранение отвечает admin; observe не имеет доступа к admin БД.
- **Audit log?** Каждый mint/rotate пишет `logger.info(...)` с `projectId` + `tenantId`. Для централизованного audit'а admin-proxy должен заворачивать свои вызовы в свой audit trail (вне scope observe).

### Backwards compatibility

- Существующие 5 форматов auth (Bearer, Basic, Sentry DSN, X-API-Key, raw) **не затрагиваются** — это всё ещё проектные API keys. `ADMIN_API_KEY` — ортогональный механизм.
- Sentry SDK, OTLP, Mastra exporter — продолжают работать как раньше (используют проектный API key из env).
- `lookupProject()` остаётся без изменений — `requireAdminKey()` идёт мимо неё.
- LRU cache (60s TTL) для bcrypt-проверок проектных ключей — без изменений.

### Файлы

- **Routes:** [src/api/admin-bridge.ts](../src/api/admin-bridge.ts) — 4 endpoint'а
- **Auth helper:** [src/lib/admin-auth.ts](../src/lib/admin-auth.ts) — `requireAdminKey()` с constant-time compare
- **Public paths:** [src/middleware/auth.ts](../src/middleware/auth.ts) — `PUBLIC_PATHS` включает `/api/admin`
- **Hash/lookup:** [src/lib/auth.ts](../src/lib/auth.ts) — `hashApiKey()`, `lookupProject()` (existing, не модифицированы)
- **Schema:** [src/store/schema.ts](../src/store/schema.ts) — `projects.tenantId` (nullable, indexed), `projects.apiKeyHash`, `projects.keyPrefix`
- **Tenant-scope routing:** [src/middleware/tenant-scope.ts](../src/middleware/tenant-scope.ts) — нормализует `?tenantId=` → `?project_id=`

### Тестирование

- [tests/api/admin-bridge.test.ts](../tests/api/admin-bridge.test.ts) — 15 тестов: mint, idempotency, rotate, tenant resolution, auth failure modes, public-path classification
- [tests/lib/admin-auth.test.ts](../tests/lib/admin-auth.test.ts) — 9 тестов: timing-safe compare, fail-closed, missing/short/wrong token
- [tests/workers/retention.test.ts](../tests/workers/retention.test.ts) — 14 тестов: показывают, что существующие `/api/admin/cleanup`, `/api/admin/retention` и т.д. используют тот же `requireAdminKey()` (т.е. конвенция унифицирована)
