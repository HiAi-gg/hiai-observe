import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { startAlertWorker, stopAlertWorker } from "./alerts/worker.js";
import { adminBridgeRoutes } from "./api/admin-bridge.js";
import { agentIngestPlugin } from "./api/agent-ingest.js";
import { alertsRoutes } from "./api/alerts.js";
import { badgesRoutes } from "./api/badges.js";
import { commentsRoutes } from "./api/comments.js";
import { dashboardRoutes } from "./api/dashboard.js";
import { embedRoutes } from "./api/embed.js";
import { eventsPlugin } from "./api/events.js";
import { exportRoutes } from "./api/export.js";
import { fingerprintRulesPlugin } from "./api/fingerprint-rules.js";
import { healthPlugin } from "./api/health.js";
import { incidentsRoutes } from "./api/incidents.js";
import { infrastructureRoutes } from "./api/infrastructure.js";
import { issuesPlugin } from "./api/issues.js";
import { logsPlugin } from "./api/logs.js";
import { logsWsPlugin } from "./api/logs-ws.js";
import { maintenanceRoutes } from "./api/maintenance.js";
import { monitorsPlugin } from "./api/monitors.js";
import { notificationsRoutes } from "./api/notifications.js";
import { otlpRoutes } from "./api/otlp.js";
import { projectsRoutes } from "./api/projects.js";
import { releasesRoutes } from "./api/releases.js";
import { savedSearchesPlugin } from "./api/saved-searches.js";
import { searchRoutes } from "./api/search.js";
import { sentryIngestPlugin } from "./api/sentry-ingest.js";
import { sourcemapsRoutes } from "./api/sourcemaps.js";
import { statusPagePlugin } from "./api/status-page.js";
import { statusPageHtmlRoutes } from "./api/status-page-html.js";
import { subscribersPlugin } from "./api/subscribers.js";
import { teamRoutes } from "./api/team.js";
import { tenantHealthPlugin } from "./api/tenant-health.js";
import { tracesRoutes } from "./api/traces.js";
import { ensureBootstrapProject } from "./lib/bootstrap.js";
import { config, formatConfigSummary, summarizeConfig } from "./lib/config.js";
import { badRequest, internal, notFound } from "./lib/errors.js";
import { logger } from "./lib/logger.js";
import { openapiRoutes } from "./lib/openapi.js";
import { authGuard, resolveProjectId } from "./middleware/auth.js";
import { metricsPlugin } from "./middleware/metrics.js";
import { rateLimiterPlugin } from "./middleware/rate-limiter.js";
import { requestIdPlugin } from "./middleware/request-id.js";
import { secureHeadersPlugin } from "./middleware/secure-headers.js";
import { tenantScopePlugin } from "./middleware/tenant-scope.js";
import { startHealthPinger, stopHealthPinger } from "./monitoring/health-pinger.js";
import { startInfraWorker, stopInfraWorker } from "./monitoring/infra-worker.js";
import { startLogWorker, stopLogWorker } from "./monitoring/log-worker.js";
import { startUptimeWorker, stopUptimeWorker } from "./monitoring/uptime-worker.js";
import { client } from "./store/db.js";
import { redis } from "./store/redis.js";
import { startMaintenanceWorker, stopMaintenanceWorker } from "./workers/maintenance.js";
import { adminRoutes, startRetentionWorker, stopRetentionWorker } from "./workers/retention.js";

const port = config.PORT;

/**
 * Parse CORS_ORIGIN into the shape @elysiajs/cors expects.
 *
 * Accepted forms (see lib/config.ts → CORS_ORIGIN for the contract):
 *   - "*"            → string (allow all; warns in production)
 *   - "false" / ""   → false (disable CORS)
 *   - "a,b,c"        → string[] (comma-separated allowlist)
 *   - "single"       → string
 */
function parseCorsOrigin(raw: string | undefined): string | string[] | false {
  if (!raw) return false;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.toLowerCase() === "false") return false;
  if (trimmed === "*") return "*";
  // Comma-separated allowlist
  if (trimmed.includes(",")) {
    return trimmed
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return trimmed;
}

const corsOrigin = parseCorsOrigin(config.CORS_ORIGIN);
if (corsOrigin === "*" && config.NODE_ENV === "production") {
  logger.warn(
    "CORS_ORIGIN is '*' in production — this allows any origin to make requests. Consider restricting to specific domains.",
  );
}

if (config.NODE_ENV === "production") {
  // REDIS_URL has a default, so it's always set. Surface the warning when the
  // operator hasn't customised it.
  if (config.REDIS_URL === "redis://localhost:6379") {
    logger.warn("REDIS_URL is not set — rate limiting and real-time features will not work.");
  }

  const apiKey = config.HIAI_OBSERVE_API_KEY;
  if (!apiKey) {
    logger.warn(
      "HIAI_OBSERVE_API_KEY is not set — no bootstrap project will be created. Set it to enable the default project.",
    );
  } else if (apiKey.length < 32) {
    logger.warn(
      "HIAI_OBSERVE_API_KEY is shorter than 32 characters — use a longer key for production.",
    );
  }

  const dbUrl = config.DATABASE_URL;
  if (dbUrl && /localhost|127\.0\.0\.1/.test(dbUrl)) {
    logger.warn(
      "DATABASE_URL points to localhost in production — ensure PostgreSQL is properly configured.",
    );
  }
}

// ── Startup configuration summary ──────────────────────────────────────────
// Single structured line that tells operators exactly which env vars are set
// vs defaulted vs missing. Surfaces optional-but-important omissions (telegram
// tokens, SMTP creds, etc.) without failing boot. Schema has already validated
// by the time we reach this point — see `src/lib/config.ts`.
{
  const summary = summarizeConfig();
  logger.info(formatConfigSummary(summary), {
    setCount: summary.set.length,
    defaultedCount: summary.defaulted.length,
    missingCount: summary.missing.length,
    set: summary.set,
    defaulted: summary.defaulted,
    missing: summary.missing,
  });

  // In any environment, surface the notifier vars that the operator didn't
  // configure — these are documented in .env.example and commonly forgotten.
  const importantMissing = summary.missing.filter((k) =>
    /^(TELEGRAM|DISCORD|SMTP_|SLACK_|WEBHOOK_|PAGERDUTY|TEAMS|NTFY|GOTIFY|PUSHOVER)_/.test(k),
  );
  if (importantMissing.length > 0) {
    logger.warn(`Optional notifier variables not set: ${importantMissing.join(", ")}`, {
      missing: importantMissing,
    });
  }
}

const app = new Elysia()
  .use(requestIdPlugin)
  .use(secureHeadersPlugin)
  .use(cors({ origin: corsOrigin }))
  .use(metricsPlugin)
  .derive(async ({ request }) => {
    const projectId = await resolveProjectId(request);
    return { projectId };
  })
  .onBeforeHandle(authGuard)
  .use(rateLimiterPlugin)
  .use(tenantScopePlugin)
  .use(healthPlugin)
  .use(sentryIngestPlugin)
  .use(issuesPlugin)
  .use(eventsPlugin)
  .use(monitorsPlugin)
  .use(statusPagePlugin)
  .use(statusPageHtmlRoutes)
  .use(embedRoutes)
  .use(infrastructureRoutes)
  .use(logsPlugin)
  .get("/api/observe/logs/stream", ({ request, set }) => {
    const url = new URL(request.url);
    set.redirect = "/api/logs/stream" + url.search;
  })
  .use(logsWsPlugin)
  .use(otlpRoutes)
  .use(tracesRoutes)
  .use(alertsRoutes)
  .use(dashboardRoutes)
  .use(projectsRoutes)
  .use(exportRoutes)
  .use(adminRoutes)
  .use(adminBridgeRoutes)
  .use(notificationsRoutes)
  .use(sourcemapsRoutes)
  .use(maintenanceRoutes)
  .use(incidentsRoutes)
  .use(agentIngestPlugin)
  .use(releasesRoutes)
  .use(teamRoutes)
  .use(commentsRoutes)
  .use(savedSearchesPlugin)
  .use(searchRoutes)
  .use(badgesRoutes)
  .use(fingerprintRulesPlugin)
  .use(subscribersPlugin)
  .use(tenantHealthPlugin)
  .use(openapiRoutes)
  .onError(({ code, error, set }) => {
    logger.error(`${code}`, { error: String(error) });

    if (code === "VALIDATION") {
      set.status = 400;
      return badRequest("Invalid request", String(error));
    }

    if (code === "NOT_FOUND") {
      set.status = 404;
      return notFound("Not found");
    }

    if (code === "PARSE") {
      set.status = 400;
      return badRequest("Parse error", String(error));
    }

    // Preserve status if it was already set to an error status
    if (typeof set.status === "number" && set.status >= 400) {
      return { error: String(error) };
    }

    set.status = 500;
    return internal(String(error));
  })
  .listen(port);

logger.info(`HiAi Observe running at http://localhost:${app.server?.port}`, {
  port: app.server?.port,
});

// Provision a default project from HIAI_OBSERVE_API_KEY so a fresh install is
// usable out of the box (idempotent; no-op if unset or already provisioned).
ensureBootstrapProject(config.HIAI_OBSERVE_API_KEY).catch((err) => {
  logger.error("Bootstrap project provisioning failed", { error: String(err) });
});

// Start background workers
startUptimeWorker();
startAlertWorker();
startInfraWorker();
if (config.HIAI_DISABLE_LOG_WORKER !== "1") {
  startLogWorker();
}
startRetentionWorker();
startMaintenanceWorker();
startHealthPinger();

// ── Process-level safety net for known runtime issues ────────────────────
// The Node `internalConnectMultipleTimeout` callback can fire on a
// destroyed socket context after a `Bun.connect` is orphaned by a
// `Promise.race` timer. The resulting uncaught exception
// (`TypeError: null is not an object (evaluating 'context')`) crashes
// the process even though the orphan connect is irrelevant to whatever
// the user was doing. We catch it here, log a warning, and keep the
// process alive.
//
// Both checks (tcp-check and ping-check) have been hardened to
// `.catch()` the orphan connect promise, but this handler is the
// last line of defense in case a future code path regresses.
process.on("uncaughtException", (err) => {
  const msg = err instanceof Error ? err.message : String(err);
  if (
    msg.includes("internalConnectMultipleTimeout") ||
    msg.includes("evaluating 'context'") ||
    msg.includes("connectionAttemptTimeout")
  ) {
    logger.warn("Suppressed known internal net-callback error", { error: msg });
    return;
  }
  // Re-throw anything else: better to crash visibly than to swallow
  // a real bug.
  logger.error("Uncaught exception (will crash)", {
    error: msg,
    stack: err instanceof Error ? err.stack : undefined,
  });
  throw err;
});

process.on("unhandledRejection", (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  if (
    msg.includes("internalConnectMultipleTimeout") ||
    msg.includes("evaluating 'context'") ||
    msg.includes("connectionAttemptTimeout")
  ) {
    logger.warn("Suppressed known internal net-callback rejection", { error: msg });
    return;
  }
  logger.error("Unhandled promise rejection", { error: msg });
});

// Graceful shutdown
async function shutdown() {
  logger.info("Shutting down...");
  try {
    // Stop all background workers
    stopUptimeWorker();
    stopAlertWorker();
    stopInfraWorker();
    stopLogWorker();
    stopRetentionWorker();
    stopMaintenanceWorker();
    stopHealthPinger();

    // Stop HTTP server
    app.server?.stop();

    // Close Redis connection
    try {
      await redis.quit();
    } catch {
      /* already closed */
    }

    // Close PostgreSQL connection
    await client.end();

    logger.info("Shutdown complete");
  } catch (err) {
    logger.error("Shutdown error", { error: String(err) });
  }
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

export type App = typeof app;
