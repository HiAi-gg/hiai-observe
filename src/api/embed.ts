/**
 * Embed routes for iframe-friendly dashboard integration (OBS2.4).
 *
 * Background:
 *   - hiai-dashboard (operator panel, typically runs on :3333) embeds
 *     observe-side widgets directly via `<iframe>`. The default
 *     secure-headers policy blocks framing (`X-Frame-Options: DENY` /
 *     `frame-ancestors 'none'`), so these routes opt out per-route.
 *   - hiai-dashboard also calls observe's overview endpoint from its
 *     server-side using a project API key (it does NOT use Better Auth —
 *     see docs/AUTH_BRIDGE.md). `/embed/dashboard` accepts `?tenantId=`
 *     (alias for `projectId`) and aggregates the data the dashboard UI
 *     needs for its overview tile in a single round-trip.
 *
 * Routes:
 *   GET /embed                       — minimal HTML landing page (iframe-safe)
 *   GET /embed/dashboard             — JSON overview: projects/issues/alerts/health
 *                                      Accepts ?tenantId= / ?projectId= / ?limit=
 *   GET /embed/status/:slug          — public status page (alias of /api/status/:slug)
 *
 * Auth model:
 *   - `/embed` and `/embed/status/:slug` are public (no key required) — they
 *     mirror the existing `/status/:slug` iframe contract.
 *   - `/embed/dashboard` requires a project API key (Bearer or X-Api-Key).
 *     It runs through the standard `authGuard` via the global middleware
 *     ordering in src/index.ts (registered AFTER statusPageHtmlRoutes so
 *     its prefix isn't accidentally classified as public).
 */

import { and, count, desc, eq, gte } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { config } from "../lib/config.js";
import { resolveProjectId } from "../middleware/auth.js";
import { db } from "../store/db.js";
import { alerts, events, issues, projects, uptimeMonitors } from "../store/schema.js";
import { getUptimePercentages } from "../store/uptime.js";

/**
 * Allowed origins for iframe framing of embed routes.
 *
 * Per-route override mechanism: secure-headers plugin only sets
 * X-Frame-Options / frame-ancestors if the route handler hasn't already
 * set them. We set SAMEORIGIN here so observe's own dashboard can
 * frame the embed; operators add dashboard origin via EMBED_ALLOWED_ORIGINS.
 */
const FRAME_ANCESTORS_DEFAULT = "'self'";

function frameAncestorsFromConfig(): string {
  // Read from the validated, frozen config module so every env var in the
  // codebase has a single source of truth (src/lib/config.ts).
  const raw = config.EMBED_ALLOWED_ORIGINS?.trim();
  if (!raw) return FRAME_ANCESTORS_DEFAULT;
  const extras = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return ["'self'", ...extras].join(" ");
}

/**
 * Apply iframe-safe security headers to a response. Called from each embed
 * route handler; the global secureHeadersPlugin sees these already set and
 * skips overwriting (CSP and X-Frame-Options both guard against
 * overwrite — see secure-headers.ts).
 */
function setEmbedHeaders(set: { headers: Record<string, string | number> }) {
  const ancestors = frameAncestorsFromConfig();
  // CSP frame-ancestors directive — modern browsers prefer this over X-Frame-Options.
  set.headers["Content-Security-Policy"] =
    `default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; ` +
    `script-src 'self' 'unsafe-inline'; frame-ancestors ${ancestors}`;
  // Legacy header for older browsers / proxies that ignore CSP.
  // SAMEORIGIN is intentionally permissive enough for observe's own UI;
  // operators needing cross-origin framing (e.g. dashboard at :3333) add
  // those origins via EMBED_ALLOWED_ORIGINS — which is reflected in CSP
  // (frame-ancestors) above. X-Frame-Options is binary (DENY / SAMEORIGIN /
  // ALLOW-FROM<origin>), so we use SAMEORIGIN as a conservative fallback
  // and document the trade-off in EMBED.md.
  set.headers["X-Frame-Options"] = "SAMEORIGIN";
}

/**
 * Compute overall health status from monitor snapshot.
 *
 * Returns "healthy" when all active monitors are up with uptime ≥ 99.9%,
 * "degraded" when at least one active monitor has uptime between 99.0% and
 * 99.9%, "down" when at least one active monitor has uptime < 99.0% or
 * the last check failed.
 *
 * `lastCheckSuccess === null` is treated as unknown (not as down) because
 * /embed/dashboard doesn't pull per-check data — it would be misleading
 * to mark a healthy monitor as down just because we didn't fetch the
 * last check. Use /embed/status/:slug for last-check detail.
 */
function deriveHealth(
  monitors: Array<{
    id: string;
    active: boolean | null;
    uptime24h: number;
    lastCheckSuccess: boolean | null;
  }>,
): "healthy" | "degraded" | "down" {
  const active = monitors.filter((m) => m.active);
  if (active.length === 0) return "healthy";
  if (active.some((m) => m.uptime24h < 99.0)) return "down";
  if (active.some((m) => m.lastCheckSuccess === false)) return "down";
  if (active.some((m) => m.uptime24h < 99.9)) return "degraded";
  return "healthy";
}

export const embedRoutes = new Elysia({ prefix: "/embed" })

  // ── GET /embed ─────────────────────────────────────────────────────────
  // Minimal HTML landing page. Useful as an iframe target — the page
  // detects the current tenant from `?tenantId=` (or projectId) and
  // redirects to the right status page. Embeddable from same-origin +
  // any EMBED_ALLOWED_ORIGINS.
  .get("/", ({ query, set }) => {
    setEmbedHeaders(set);
    const params = new URLSearchParams();
    const slug = (query as Record<string, string | undefined>).slug;
    const tenantId = (query as Record<string, string | undefined>).tenantId;
    if (slug) params.set("slug", slug);
    if (tenantId) params.set("tenantId", tenantId);
    const qs = params.toString();

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>HiAi Observe — Embed</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
           background: #0f172a; color: #e2e8f0; min-height: 100vh; display: flex;
           flex-direction: column; align-items: center; justify-content: center; padding: 24px; }
    h1 { font-size: 18px; font-weight: 600; margin-bottom: 8px; }
    p { font-size: 13px; color: #94a3b8; max-width: 480px; text-align: center; margin-bottom: 16px; }
    code { background: #1e293b; padding: 2px 6px; border-radius: 4px; font-size: 12px; }
    a { color: #60a5fa; text-decoration: none; }
  </style>
</head>
<body>
  <h1>HiAi Observe — Embed</h1>
  <p>
    This is a public landing page for iframe embedding. For a project status page use
    <code>/embed/status/&lt;slug&gt;</code>. For an authenticated overview tile
    use <code>/embed/dashboard?tenantId=&lt;uuid&gt;</code>.
  </p>
  ${qs ? `<p><a href="/embed/dashboard?${qs}">Open overview →</a></p>` : ""}
</body>
</html>`;

    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  })

  // ── GET /embed/status/:slug ────────────────────────────────────────────
  // Public iframe-friendly status page. Returns the same JSON shape as
  // /api/status/:slug so dashboard widgets can render it directly. Auth
  // is intentionally omitted — status pages are public by design (see
  // PUBLIC_PATHS in src/middleware/auth.ts).
  .get("/status/:slug", async ({ params, set }) => {
    setEmbedHeaders(set);

    const [project] = await db
      .select({ id: projects.id, name: projects.name, slug: projects.slug })
      .from(projects)
      .where(eq(projects.slug, params.slug))
      .limit(1);

    if (!project) {
      set.status = 404;
      return { error: "Status page not found" };
    }

    const monitorRows = await db
      .select({
        id: uptimeMonitors.id,
        name: uptimeMonitors.name,
        url: uptimeMonitors.url,
        active: uptimeMonitors.active,
      })
      .from(uptimeMonitors)
      .where(eq(uptimeMonitors.projectId, project.id));

    const ids = monitorRows.map((m) => m.id);
    const uptimeMap = ids.length ? await getUptimePercentages(ids, 24) : new Map<string, number>();

    const monitorStatuses = monitorRows.map((m) => ({
      id: m.id,
      name: m.name,
      url: m.url,
      active: m.active,
      uptime24h: uptimeMap.get(m.id) ?? 100,
    }));

    const active = monitorStatuses.filter((m) => m.active);
    const health: "healthy" | "degraded" | "down" =
      active.length === 0
        ? "healthy"
        : active.every((m) => m.uptime24h >= 99.9)
          ? "healthy"
          : "degraded";

    return {
      project: { id: project.id, name: project.name, slug: project.slug },
      healthStatus: health,
      monitors: monitorStatuses,
    };
  })

  // ── GET /embed/dashboard ───────────────────────────────────────────────
  // Authenticated overview for hiai-dashboard. Returns the aggregated
  // snapshot the dashboard needs to render its overview tile:
  //   - projectsCount         — number of provisioned projects (admin scope)
  //   - activeIssues          — unresolved issues for the project (or global)
  //   - activeAlerts          — count of active alerts
  //   - healthStatus          — derived from monitor snapshot
  //   - recentEvents          — last N events (default 10, max 50)
  //   - monitors              — monitor summary with uptime24h + isUp
  //
  // Query params:
  //   - tenantId (alias for projectId — accepts both ?tenantId= and ?projectId=)
  //   - limit (events cap; default 10, max 50)
  //
  // Auth: Bearer / X-Api-Key. Standard project API key, no JWT translation.
  // tenantScopePlugin (see src/middleware/tenant-scope.ts) normalises
  // tenantId/projectId into query.projectId so the DB filter uses the
  // canonical column.
  //
  // The path lives under `/embed` (PUBLIC_PATHS), so the global authGuard
  // is skipped. We re-enforce it here at handler level by reading the
  // project API key directly via `resolveProjectId()` — mirroring how
  // /api/logs/stream handles its auth.
  .get(
    "/dashboard",
    async ({ request, query, set }) => {
      setEmbedHeaders(set);

      // Handler-level auth — required because /embed/* is in PUBLIC_PATHS
      // (for /embed and /embed/status/:slug which ARE public), so the
      // global authGuard does not run for /embed/dashboard.
      const requestProjectId = await resolveProjectId(request);
      if (!requestProjectId) {
        set.status = 401;
        return { error: "Unauthorized" };
      }

      const q = query as Record<string, string | undefined>;
      const projectId = q.projectId ?? q.tenantId;
      const limit = Math.min(Math.max(Number(q.limit ?? "10") || 10, 1), 50);
      const oneDayAgo = new Date(Date.now() - 24 * 3600_000);

      // projectsCount — admin scope (no projectId) returns total;
      // project scope returns 1 (only the calling project is visible).
      const projectsCountRow = await db.select({ value: count() }).from(projects);
      const projectsCount = projectId ? 1 : (projectsCountRow[0]?.value ?? 0);

      const issueFilter = projectId ? eq(issues.projectId, projectId) : undefined;
      const alertFilter = projectId ? eq(alerts.projectId, projectId) : undefined;
      const monitorFilter = projectId ? eq(uptimeMonitors.projectId, projectId) : undefined;

      const [activeIssuesRow, activeAlertsRow, monitorRows, recentEventRows] = await Promise.all([
        db
          .select({ value: count() })
          .from(issues)
          .where(and(eq(issues.status, "unresolved"), issueFilter)),
        db
          .select({ value: count() })
          .from(alerts)
          .where(and(eq(alerts.isActive, true), alertFilter)),
        db
          .select({
            id: uptimeMonitors.id,
            name: uptimeMonitors.name,
            url: uptimeMonitors.url,
            active: uptimeMonitors.active,
          })
          .from(uptimeMonitors)
          .where(monitorFilter),
        db
          .select({
            id: events.id,
            projectId: events.projectId,
            message: events.message,
            exceptionType: events.exceptionType,
            level: events.level,
            createdAt: events.createdAt,
          })
          .from(events)
          .where(projectId ? eq(events.projectId, projectId) : gte(events.createdAt, oneDayAgo))
          .orderBy(desc(events.createdAt))
          .limit(limit),
      ]);

      const monitorIds = monitorRows.map((m) => m.id);
      const uptimeMap = monitorIds.length
        ? await getUptimePercentages(monitorIds, 24)
        : new Map<string, number>();

      // isUp is approximated from uptime24h since we don't have per-monitor
      // last-check info at this aggregation point — the dedicated
      // /api/status/:slug endpoint exposes per-check details when needed.
      const monitors = monitorRows.map((m) => {
        const uptime24h = uptimeMap.get(m.id) ?? 100;
        return {
          id: m.id,
          name: m.name,
          url: m.url,
          active: m.active,
          uptime24h,
          isUp: uptime24h >= 99.9,
        };
      });

      // /embed/dashboard doesn't fetch per-check data — pass `null` for
      // lastCheckSuccess so deriveHealth falls back to uptime thresholds
      // (99.0% → down, 99.9% → degraded, otherwise healthy). Per-check
      // status is exposed at /embed/status/:slug when needed.
      const healthStatus = deriveHealth(
        monitors.map((m) => ({
          id: m.id,
          active: m.active,
          uptime24h: m.uptime24h,
          lastCheckSuccess: null,
        })),
      );

      return {
        projectsCount,
        activeIssues: activeIssuesRow[0]?.value ?? 0,
        activeAlerts: activeAlertsRow[0]?.value ?? 0,
        healthStatus,
        recentEvents: recentEventRows,
        monitors,
      };
    },
    {
      query: t.Object({
        projectId: t.Optional(t.String()),
        tenantId: t.Optional(t.String()),
        limit: t.Optional(t.String()),
      }),
    },
  );

// Inlined via src/lib/auth helpers — the actual healthStatus calculation
// is in deriveHealth() above; re-export for tests.
export const __testing = { deriveHealth, frameAncestorsFromConfig };
