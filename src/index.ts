import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { healthPlugin } from "./api/health.js";
import { issuesPlugin } from "./api/issues.js";
import { eventsPlugin } from "./api/events.js";
import { sentryIngestPlugin } from "./api/sentry-ingest.js";
import { monitorsPlugin } from "./api/monitors.js";
import { statusPagePlugin } from "./api/status-page.js";
import { statusPageHtmlRoutes } from "./api/status-page-html.js";
import { infrastructureRoutes } from "./api/infrastructure.js";
import { logsPlugin } from "./api/logs.js";
import { logsWsPlugin } from "./api/logs-ws.js";
import { otlpRoutes } from "./api/otlp.js";
import { tracesRoutes } from "./api/traces.js";
import { alertsRoutes } from "./api/alerts.js";
import { dashboardRoutes } from "./api/dashboard.js";
import { projectsRoutes } from "./api/projects.js";
import { exportRoutes } from "./api/export.js";
import { adminRoutes } from "./workers/retention.js";
import { notificationsRoutes } from "./api/notifications.js";
import { sourcemapsRoutes } from "./api/sourcemaps.js";
import { maintenanceRoutes } from "./api/maintenance.js";
import { incidentsRoutes } from "./api/incidents.js";
import { agentIngestPlugin } from "./api/agent-ingest.js";
import { releasesRoutes } from "./api/releases.js";
import { teamRoutes } from "./api/team.js";
import { commentsRoutes } from "./api/comments.js";
import { savedSearchesPlugin } from "./api/saved-searches.js";
import { searchRoutes } from "./api/search.js";
import { badgesRoutes } from "./api/badges.js";
import { openapiRoutes } from "./lib/openapi.js";
import { metricsPlugin } from "./middleware/metrics.js";
import { authMiddleware } from "./middleware/auth.js";
import { rateLimiterPlugin } from "./middleware/rate-limiter.js";
import { requestIdPlugin } from "./middleware/request-id.js";
import { startUptimeWorker, stopUptimeWorker } from "./monitoring/uptime-worker.js";
import { startAlertWorker, stopAlertWorker } from "./alerts/worker.js";
import { startInfraWorker, stopInfraWorker } from "./monitoring/infra-worker.js";
import { startLogWorker, stopLogWorker } from "./monitoring/log-worker.js";
import { startRetentionWorker, stopRetentionWorker } from "./workers/retention.js";
import { startMaintenanceWorker, stopMaintenanceWorker } from "./workers/maintenance.js";
import { startHealthPinger, stopHealthPinger } from "./monitoring/health-pinger.js";
import { client } from "./store/db.js";
import { redis } from "./store/redis.js";
import { logger } from "./lib/logger.js";
import { badRequest, notFound, internal } from "./lib/errors.js";

const port = Number(process.env.PORT) || 8001;

// Warn if CORS is wide open in production
const corsOrigin = process.env.CORS_ORIGIN || false;
if (corsOrigin === "*" && process.env.NODE_ENV === "production") {
  logger.warn("CORS_ORIGIN is '*' in production — this allows any origin to make requests. Consider restricting to specific domains.");
}

const app = new Elysia()
  .use(requestIdPlugin)
  .use(cors({ origin: corsOrigin }))
  .use(metricsPlugin)
  .use(authMiddleware)
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

logger.info(`HiAi Observe running at http://localhost:${app.server?.port}`, { port: app.server?.port });

// Start background workers
startUptimeWorker();
startAlertWorker();
startInfraWorker();
startLogWorker();
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
    try { await redis.quit(); } catch { /* already closed */ }

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
