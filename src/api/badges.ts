import { and, desc, eq, gte, sql } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../store/db.js";
import { projects, uptimeChecks, uptimeMonitors } from "../store/schema.js";

const _BADGE_WIDTH = 120;
const BADGE_HEIGHT = 22;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function svgBadge(label: string, value: string, color: string, valueColor?: string): string {
  const labelWidth = label.length * 7 + 12;
  const valueWidth = value.length * 7 + 12;
  const totalWidth = labelWidth + valueWidth;
  const vc = valueColor ?? color;

  const safeLabel = escapeXml(label);
  const safeValue = escapeXml(value);
  const safeColor = escapeXml(vc);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${BADGE_HEIGHT}">
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <rect rx="3" width="${totalWidth}" height="${BADGE_HEIGHT}" fill="#555"/>
  <rect rx="3" x="${labelWidth}" width="${valueWidth}" height="${BADGE_HEIGHT}" fill="${safeColor}"/>
  <rect rx="3" width="${totalWidth}" height="${BADGE_HEIGHT}" fill="url(#s)"/>
  <g fill="#fff" text-anchor="middle" font-family="DejaVu Sans,Verdana,Geneva,sans-serif" font-size="11">
    <text x="${labelWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${safeLabel}</text>
    <text x="${labelWidth / 2}" y="14">${safeLabel}</text>
    <text x="${labelWidth + valueWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${safeValue}</text>
    <text x="${labelWidth + valueWidth / 2}" y="14">${safeValue}</text>
  </g>
</svg>`;
}

function statusColor(status: string): string {
  switch (status) {
    case "operational":
      return "#4c1";
    case "up":
      return "#4c1";
    case "degraded":
      return "#dbab09";
    case "down":
      return "#e05d44";
    default:
      return "#9f9f9f";
  }
}

async function getMonitorStatus(
  slug: string,
): Promise<{ name: string; status: string; uptime: number | null }> {
  // Look up project by slug
  const [project] = await db.select().from(projects).where(eq(projects.slug, slug)).limit(1);
  if (!project) return { name: slug, status: "unknown", uptime: null };

  // Get first active monitor for this project
  const [monitor] = await db
    .select()
    .from(uptimeMonitors)
    .where(and(eq(uptimeMonitors.projectId, project.id), eq(uptimeMonitors.active, true)))
    .limit(1);

  if (!monitor) return { name: project.name, status: "unknown", uptime: null };

  // Get last check
  const [lastCheck] = await db
    .select()
    .from(uptimeChecks)
    .where(eq(uptimeChecks.monitorId, monitor.id))
    .orderBy(desc(uptimeChecks.checkedAt))
    .limit(1);

  const status = lastCheck?.success ? "operational" : "down";

  // Calculate 24h uptime
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const checks = await db
    .select({
      total: sql<number>`count(*)`,
      successCount: sql<number>`count(*) filter (where ${uptimeChecks.success} = true)`,
    })
    .from(uptimeChecks)
    .where(and(eq(uptimeChecks.monitorId, monitor.id), gte(uptimeChecks.checkedAt, since24h)));

  const total = checks[0]?.total ?? 0;
  const success = checks[0]?.successCount ?? 0;
  const uptime = total > 0 ? Math.round((success / total) * 10000) / 100 : null;

  return { name: monitor.name, status, uptime };
}

export const badgesRoutes = new Elysia({ prefix: "/api/badges" })
  .get(
    "/:slug/status",
    async ({ params, set }) => {
      const { name, status } = await getMonitorStatus(params.slug);
      const color = statusColor(status);
      const label = name.length > 20 ? `${name.slice(0, 18)}..` : name;
      const value = status.charAt(0).toUpperCase() + status.slice(1);

      set.headers["Content-Type"] = "image/svg+xml";
      set.headers["Cache-Control"] = "public, max-age=60";
      return svgBadge(label, value, color);
    },
    {
      params: t.Object({ slug: t.String() }),
    },
  )
  .get(
    "/:slug/uptime",
    async ({ params, set }) => {
      const { name, uptime } = await getMonitorStatus(params.slug);
      const label = name.length > 20 ? `${name.slice(0, 18)}..` : name;
      const value = uptime !== null ? `${uptime}%` : "N/A";
      const color =
        uptime !== null
          ? uptime >= 99.9
            ? "#4c1"
            : uptime >= 99
              ? "#97CA00"
              : uptime >= 95
                ? "#dbab09"
                : "#e05d44"
          : "#9f9f9f";

      set.headers["Content-Type"] = "image/svg+xml";
      set.headers["Cache-Control"] = "public, max-age=60";
      return svgBadge(`${label} uptime`, value, color);
    },
    {
      params: t.Object({ slug: t.String() }),
    },
  );
