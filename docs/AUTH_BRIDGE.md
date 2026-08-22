# Auth bridge (observe side)

HiAi Observe does **not** implement Better Auth, SSO, or user sessions.

Host applications (`hiai-admin`, `hiai-dashboard`) authenticate their own users, then call observe with a **project API key** or the instance **`ADMIN_API_KEY`**.

## Project API key

- Header: `Authorization: Bearer <key>` or `X-Api-Key: <key>`
- Resolves to exactly one `projects.id`
- All list/get/mutate queries are forced to that project
- Query `?projectId=` / `?tenantId=` is allowed only when it matches the key (else 403)

## Admin API key

- Env: `ADMIN_API_KEY`
- Compared with SHA-256 + `timingSafeEqual` (`src/lib/admin-auth.ts`)
- Required for:
  - `POST /api/projects`, `DELETE /api/projects/:id`
  - `/api/admin/*` (admin-bridge)
  - `GET /api/tenant/:tenantId/health`
  - `GET /api/health/details`
  - Host Docker logs (`logs.project_id IS NULL`)
- Optional `?projectId=` still scopes an admin call to one project

## `projects.api_role`

Per-project role on the key itself (`admin` | `member` | `readonly`), not a user account:

- `readonly` — GET only (`checkWriteAccess`)
- `member` — read/write
- `admin` — plus key rotation for **that** project (`checkAdminAccess`)

This is not multi-user RBAC. See ROADMAP `PM-RBAC`.

## Embed

`GET /embed` and `GET /embed/status/:slug` are public.
`GET /embed/dashboard` requires a project (or admin) key and never returns other tenants' data.
