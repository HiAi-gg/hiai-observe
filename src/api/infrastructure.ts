/**
 * Infrastructure monitoring API — Elysia plugin.
 */

import { Elysia, t } from "elysia";
import { collectDockerStats } from "../monitoring/docker-collector.js";
import { collectHostStats } from "../monitoring/host-collector.js";
import {
  getContainerStatsByContainer,
  getLatestContainerStats,
  getHostStatsHistory,
  getLatestHostStats,
  getContainerLogCounts,
} from "../store/infra.js";

export const infrastructureRoutes = new Elysia({ prefix: "/api/infrastructure" })

  .get("/containers", async ({ set }) => {
    try {
      const [stats, logCounts] = await Promise.all([
        collectDockerStats(),
        getContainerLogCounts().catch(() => new Map()),
      ]);
      const containersWithLogs = stats.map((s) => ({
        ...s,
        log_count_24h: logCounts.get(s.id) ?? 0,
      }));
      return { containers: containersWithLogs, count: stats.length };
    } catch (err) {
      set.status = 503;
      return { error: "Docker unavailable", details: String(err) };
    }
  })

  .get(
    "/containers/:id",
    async ({ params, query }) => {
      const from = query.from ? new Date(query.from) : new Date(Date.now() - 3600_000);
      const to = query.to ? new Date(query.to) : new Date();
      const stats = await getContainerStatsByContainer(params.id, from, to);
      return { containerId: params.id, data: stats, count: stats.length };
    },
    {
      query: t.Object({
        from: t.Optional(t.String()),
        to: t.Optional(t.String()),
      }),
    }
  )

  .get("/host", async ({ set }) => {
    try {
      const stats = await collectHostStats();
      return stats;
    } catch (err) {
      set.status = 503;
      return { error: "Host stats unavailable", details: String(err) };
    }
  })

  .get(
    "/host/history",
    async ({ query }) => {
      const from = query.from ? new Date(query.from) : new Date(Date.now() - 3600_000);
      const to = query.to ? new Date(query.to) : new Date();
      const stats = await getHostStatsHistory(from, to);
      return { data: stats, count: stats.length };
    },
    {
      query: t.Object({
        from: t.Optional(t.String()),
        to: t.Optional(t.String()),
      }),
    }
  )

  .get("/overview", async ({ set }) => {
    try {
      const [containers, host, latestContainers, latestHost] = await Promise.all([
        collectDockerStats().catch(() => []),
        collectHostStats().catch(() => null),
        getLatestContainerStats().catch(() => []),
        getLatestHostStats().catch(() => null),
      ]);

      return {
        containers: {
          current: containers,
          count: containers.length,
          historical: latestContainers.length,
        },
        host: {
          current: host,
          historical: latestHost,
        },
      };
    } catch (err) {
      set.status = 503;
      return { error: "Overview unavailable", details: String(err) };
    }
  });
