import { Elysia } from "elysia";
import { db } from "../store/db.js";
import { projects, uptimeMonitors, uptimeChecks } from "../store/schema.js";
import { eq, desc, and, gte, count, sql } from "drizzle-orm";

function overallColor(status: string): string {
  switch (status) {
    case "operational": return "#22c55e";
    case "degraded": return "#eab308";
    default: return "#ef4444";
  }
}

function overallLabel(status: string): string {
  switch (status) {
    case "operational": return "All Systems Operational";
    case "degraded": return "Some Systems Degraded";
    default: return "Systems Down";
  }
}

function generateUptimeBars(checks: Array<{ checkedAt: Date; success: boolean }>): string {
  if (checks.length === 0) return "";

  const bars: string[] = [];
  const now = Date.now();
  const hourMs = 3600_000;

  for (let i = 23; i >= 0; i--) {
    const hourStart = now - (i + 1) * hourMs;
    const hourEnd = now - i * hourMs;
    const hourChecks = checks.filter(c => {
      const t = new Date(c.checkedAt).getTime();
      return t >= hourStart && t < hourEnd;
    });

    if (hourChecks.length === 0) {
      bars.push('<span style="display:inline-block;width:12px;height:28px;background:#334155;border-radius:2px;margin:0 1px" title="No data"></span>');
    } else {
      const successRate = hourChecks.filter(c => c.success).length / hourChecks.length;
      const color = successRate >= 0.99 ? "#22c55e" : successRate >= 0.9 ? "#eab308" : "#ef4444";
      bars.push(`<span style="display:inline-block;width:12px;height:28px;background:${color};border-radius:2px;margin:0 1px" title="${(successRate * 100).toFixed(1)}%"></span>`);
    }
  }

  return bars.join("");
}

export const statusPageHtmlRoutes = new Elysia()
  .get("/status/:slug", async ({ params, set }) => {
    const [project] = await db.select().from(projects).where(eq(projects.slug, params.slug)).limit(1);
    if (!project) {
      set.status = 404;
      return new Response("<h1>Status page not found</h1>", { headers: { "Content-Type": "text/html" } });
    }

    const monitors = await db.select({
      id: uptimeMonitors.id,
      name: uptimeMonitors.name,
      url: uptimeMonitors.url,
      active: uptimeMonitors.active,
    }).from(uptimeMonitors).where(eq(uptimeMonitors.projectId, project.id));

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 3600_000);

    const monitorData = await Promise.all(monitors.map(async (m) => {
      // Latest check
      const [latest] = await db.select().from(uptimeChecks)
        .where(eq(uptimeChecks.monitorId, m.id))
        .orderBy(desc(uptimeChecks.checkedAt))
        .limit(1);

      // 24h uptime %
      const [stats] = await db.select({
        total: count(),
        up: sql<number>`COUNT(*) FILTER (WHERE ${uptimeChecks.success} = true)`.mapWith(Number),
      }).from(uptimeChecks)
        .where(and(eq(uptimeChecks.monitorId, m.id), gte(uptimeChecks.checkedAt, twentyFourHoursAgo)));

      const uptimePercent = stats && stats.total > 0 ? (stats.up / stats.total) * 100 : 100;

      // All checks for bars
      const checks = await db.select({
        checkedAt: uptimeChecks.checkedAt,
        success: uptimeChecks.success,
      }).from(uptimeChecks)
        .where(and(eq(uptimeChecks.monitorId, m.id), gte(uptimeChecks.checkedAt, twentyFourHoursAgo)))
        .orderBy(uptimeChecks.checkedAt);

      return {
        name: m.name,
        active: m.active,
        uptimePercent,
        responseTimeMs: latest?.responseTimeMs,
        success: latest?.success ?? true,
        certExpiry: latest?.certExpiry,
        bars: generateUptimeBars(checks),
      };
    }));

    // Determine overall status
    const activeMonitors = monitorData.filter(m => m.active);
    const down = activeMonitors.filter(m => !m.success);
    const degraded = activeMonitors.filter(m => m.success && m.uptimePercent < 99.9);
    let overall = "operational";
    if (down.length > 0) overall = "down";
    else if (degraded.length > 0) overall = "degraded";

    // Check cert expiry warnings
    const certWarnings = monitorData.filter(m => {
      if (!m.certExpiry) return false;
      const daysLeft = (new Date(m.certExpiry).getTime() - Date.now()) / (86400_000);
      return daysLeft < 30;
    });

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${project.name} — Status</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #e2e8f0; min-height: 100vh; display: flex; flex-direction: column; align-items: center; padding: 40px 16px; }
    .container { max-width: 640px; width: 100%; }
    h1 { font-size: 24px; font-weight: 700; margin-bottom: 8px; }
    .overall { display: flex; align-items: center; gap: 10px; padding: 16px 20px; border-radius: 10px; margin-bottom: 24px; font-size: 15px; font-weight: 600; }
    .overall .dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
    .monitor { background: #1e293b; border: 1px solid #334155; border-radius: 10px; padding: 20px; margin-bottom: 12px; }
    .monitor-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .monitor-name { font-weight: 600; font-size: 15px; }
    .monitor-status { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 500; }
    .monitor-meta { display: flex; justify-content: space-between; font-size: 12px; color: #94a3b8; margin-top: 12px; }
    .bars { display: flex; align-items: flex-end; gap: 1px; margin-top: 12px; }
    .cert-warning { background: #713f12; border: 1px solid #a16207; border-radius: 8px; padding: 12px 16px; margin-bottom: 12px; font-size: 13px; color: #fef3c7; }
    .footer { text-align: center; margin-top: 32px; font-size: 12px; color: #64748b; }
    .footer a { color: #60a5fa; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <h1>${project.name}</h1>
    <div class="overall" style="background: ${overallColor(overall)}22; border: 1px solid ${overallColor(overall)}44">
      <span class="dot" style="background: ${overallColor(overall)}"></span>
      <span style="color: ${overallColor(overall)}">${overallLabel(overall)}</span>
    </div>

    ${certWarnings.length > 0 ? `
    <div class="cert-warning">
      ⚠️ SSL certificate expiring soon: ${certWarnings.map(w => w.name).join(", ")}
    </div>` : ""}

    ${monitorData.map(m => `
    <div class="monitor">
      <div class="monitor-header">
        <span class="monitor-name">${m.name}</span>
        <span class="monitor-status" style="color: ${m.success ? "#22c55e" : "#ef4444"}">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${m.success ? "#22c55e" : "#ef4444"}"></span>
          ${m.success ? "Up" : "Down"}
        </span>
      </div>
      <div class="bars">${m.bars}</div>
      <div class="monitor-meta">
        <span>Uptime: ${m.uptimePercent.toFixed(2)}%</span>
        <span>${m.responseTimeMs ? `${m.responseTimeMs}ms` : ""}</span>
      </div>
    </div>`).join("\n")}

    <div class="footer">
      Powered by <a href="https://github.com/your-org/hiai-observe">HiAi Observe</a>
    </div>
  </div>
</body>
</html>`;

    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  });
