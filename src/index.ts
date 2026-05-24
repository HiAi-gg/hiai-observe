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
import { metricsPlugin } from "./middleware/metrics.js";
import { authMiddleware } from "./middleware/auth.js";
import { rateLimiterPlugin } from "./middleware/rate-limiter.js";
import { startUptimeWorker, stopUptimeWorker } from "./monitoring/uptime-worker.js";
import { startAlertWorker, stopAlertWorker } from "./alerts/worker.js";
import { startInfraWorker, stopInfraWorker } from "./monitoring/infra-worker.js";
import { startLogWorker, stopLogWorker } from "./monitoring/log-worker.js";
import { startRetentionWorker, stopRetentionWorker } from "./workers/retention.js";
import { client } from "./store/db.js";
import { redis } from "./store/redis.js";

const port = Number(process.env.PORT) || 8001;

const app = new Elysia()
  .use(cors({ origin: process.env.CORS_ORIGIN || false }))
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
  .onError(({ code, error, set }) => {
    const isDev = process.env.NODE_ENV !== "production";
    console.error(`[error] ${code}:`, error);

    if (code === "VALIDATION") {
      set.status = 400;
      return { error: "Invalid request", detail: isDev ? String(error) : undefined };
    }

    if (code === "NOT_FOUND") {
      set.status = 404;
      return { error: "Not found" };
    }

    // All other errors — hide details in production
    set.status = 500;
    return {
      error: "Internal server error",
      detail: isDev ? String(error) : undefined,
    };
  })
  .listen(port);

console.log(`HiAi Observe running at http://localhost:${app.server?.port}`);

// Start background workers
startUptimeWorker();
startAlertWorker();
startInfraWorker();
startLogWorker();
startRetentionWorker();

// Graceful shutdown
async function shutdown() {
  console.log("Shutting down...");
  try {
    // Stop all background workers
    stopUptimeWorker();
    stopAlertWorker();
    stopInfraWorker();
    stopLogWorker();
    stopRetentionWorker();

    // Stop HTTP server
    app.server?.stop();

    // Close Redis connection
    try { await redis.quit(); } catch { /* already closed */ }

    // Close PostgreSQL connection
    await client.end();

    console.log("Shutdown complete");
  } catch (err) {
    console.error("Shutdown error:", err);
  }
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

export type App = typeof app;
