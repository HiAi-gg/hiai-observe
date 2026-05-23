import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { healthPlugin } from "./api/health.js";
import { issuesPlugin } from "./api/issues.js";
import { eventsPlugin } from "./api/events.js";
import { sentryIngestPlugin } from "./api/sentry-ingest.js";
import { monitorsPlugin } from "./api/monitors.js";
import { statusPagePlugin } from "./api/status-page.js";
import { infrastructureRoutes } from "./api/infrastructure.js";
import { logsPlugin } from "./api/logs.js";
import { logsWsPlugin } from "./api/logs-ws.js";
import { otlpRoutes } from "./api/otlp.js";
import { tracesRoutes } from "./api/traces.js";
import { alertsRoutes } from "./api/alerts.js";
import { dashboardRoutes } from "./api/dashboard.js";
import { metricsPlugin } from "./middleware/metrics.js";
import { authMiddleware } from "./middleware/auth.js";
import { rateLimiterPlugin } from "./middleware/rate-limiter.js";
import { startUptimeWorker } from "./monitoring/uptime-worker.js";
import { client } from "./store/db.js";

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
  .use(infrastructureRoutes)
  .use(logsPlugin)
  .use(logsWsPlugin)
  .use(otlpRoutes)
  .use(tracesRoutes)
  .use(alertsRoutes)
  .use(dashboardRoutes)
  .listen(port);

console.log(`HiAi Observe running at http://localhost:${app.server?.port}`);

// Start background workers
startUptimeWorker();

// Graceful shutdown
async function shutdown() {
  console.log("Shutting down...");
  try {
    app.server?.stop();
    await client.end();
  } catch (err) {
    console.error("Shutdown error:", err);
  }
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

export type App = typeof app;
