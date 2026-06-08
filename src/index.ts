import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { startAlertWorker, stopAlertWorker } from "./alerts/worker.js";
import { agentIngestPlugin } from "./api/agent-ingest.js";
import { alertsRoutes } from "./api/alerts.js";
import { badgesRoutes } from "./api/badges.js";
import { commentsRoutes } from "./api/comments.js";
import { dashboardRoutes } from "./api/dashboard.js";
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
import { tracesRoutes } from "./api/traces.js";
import { ensureBootstrapProject } from "./lib/bootstrap.js";
import { badRequest, internal, notFound } from "./lib/errors.js";
import { logger } from "./lib/logger.js";
import { openapiRoutes } from "./lib/openapi.js";
import { authGuard, resolveProjectId } from "./middleware/auth.js";
import { metricsPlugin } from "./middleware/metrics.js";
import { rateLimiterPlugin } from "./middleware/rate-limiter.js";
import { requestIdPlugin } from "./middleware/request-id.js";
import { secureHeadersPlugin } from "./middleware/secure-headers.js";
import { startHealthPinger, stopHealthPinger } from "./monitoring/health-pinger.js";
import { startInfraWorker, stopInfraWorker } from "./monitoring/infra-worker.js";
import { startLogWorker, stopLogWorker } from "./monitoring/log-worker.js";
import { startUptimeWorker, stopUptimeWorker } from "./monitoring/uptime-worker.js";
import { client } from "./store/db.js";
import { redis } from "./store/redis.js";
import { startMaintenanceWorker, stopMaintenanceWorker } from "./workers/maintenance.js";
import { adminRoutes, startRetentionWorker, stopRetentionWorker } from "./workers/retention.js";

const port = Number(process.env.PORT) || 8001;

// Warn if CORS is wide open in production
const corsOrigin = process.env.CORS_ORIGIN || false;
if (corsOrigin === "*" && process.env.NODE_ENV === "production") {
  logger.warn(
    "CORS_ORIGIN is '*' in production — this allows any origin to make requests. Consider restricting to specific domains.",
  );
}

if (process.env.NODE_ENV === "production") {
  if (!process.env.REDIS_URL) {
    logger.warn("REDIS_URL is not set — rate limiting and real-time features will not work.");
  }

  const apiKey = process.env.HIAI_OBSERVE_API_KEY;
  if (!apiKey) {
    logger.warn("HIAI_OBSERVE_API_KEY is not set — no bootstrap project will be created. Set it to enable the default project.");
  } else if (apiKey.length < 32) {
    logger.warn("HIAI_OBSERVE_API_KEY is shorter than 32 characters — use a longer key for production.");
  }

  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl && /localhost|127\.0\.0\.1/.test(dbUrl)) {
    logger.warn("DATABASE_URL points to localhost in production — ensure PostgreSQL is properly configured.");
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
  .use(healthPlugin)
  .use(sentryIngestPlugin)
  .use(issuesPlugin)
  .use(eventsPlugin)
  .use(monitorsPlugin)
  .use(statusPagePlugin)
  .use(statusPageHtmlRoutes)
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

    set.status = 500;
    return internal(String(error));
  })
  .listen(port);

logger.info(`HiAi Observe running at http://localhost:${app.server?.port}`, {
  port: app.server?.port,
});

// Provision a default project from HIAI_OBSERVE_API_KEY so a fresh install is
// usable out of the box (idempotent; no-op if unset or already provisioned).
ensureBootstrapProject(process.env.HIAI_OBSERVE_API_KEY).catch((err) => {
  logger.error("Bootstrap project provisioning failed", { error: String(err) });
});

// Start background workers
startUptimeWorker();
startAlertWorker();
startInfraWorker();
if (process.env.HIAI_DISABLE_LOG_WORKER !== "1") {
  startLogWorker();
}
startRetentionWorker();
startMaintenanceWorker();
startHealthPinger();

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
