/**
 * Infrastructure monitoring API — Elysia plugin.
 * Supports multi-host filtering via ?hostId=xxx query parameter.
 */

import { Elysia, t } from "elysia";
import { collectDockerStats } from "../monitoring/docker-collector.js";
import { collectHostStats } from "../monitoring/host-collector.js";
import {
  getContainerLogCounts,
  getContainerStatsByContainer,
  getGpuStatsHistory,
  getHostStatsHistory,
  getLatestContainerStats,
  getLatestGpuStats,
  getLatestHostStats,
  listHosts,
} from "../store/infra.js";

export const infrastructureRoutes = new Elysia({ prefix: "/api/infrastructure" })

  .get(
    "/containers",
    async ({ set, query }) => {
      try {
        const hostId = query.hostId ?? undefined;
        const [stats, logCounts] = await Promise.all([
          collectDockerStats(),
          getContainerLogCounts().catch(() => new Map()),
        ]);
        const containersWithLogs = stats.map((s) => ({
          ...s,
          log_count_24h: logCounts.get(s.id) ?? 0,
        }));
        return { containers: containersWithLogs, count: stats.length, hostId: hostId ?? "local" };
      } catch (err) {
        set.status = 503;
        return { error: "Docker unavailable", detail: String(err) };
      }
    },
    {
      query: t.Object({
        hostId: t.Optional(t.String()),
      }),
    },
  )

  .get(
    "/containers/:id",
    async ({ params, query }) => {
      const from = query.from ? new Date(query.from) : new Date(Date.now() - 3600_000);
      const to = query.to ? new Date(query.to) : new Date();
      const hostId = query.hostId ?? undefined;
      const stats = await getContainerStatsByContainer(params.id, from, to, hostId);
      return { containerId: params.id, data: stats, count: stats.length };
    },
    {
      query: t.Object({
        from: t.Optional(t.String()),
        to: t.Optional(t.String()),
        hostId: t.Optional(t.String()),
      }),
    },
  )

  .get(
    "/host",
    async ({ set, query }) => {
      try {
        const hostId = query.hostId ?? undefined;
        // If hostId is specified and not "local", return from DB
        if (hostId && hostId !== "local") {
          const latest = await getLatestHostStats(hostId);
          if (!latest) {
            set.status = 404;
            return { error: "Host not found", hostId };
          }
          return latest;
        }
        const stats = await collectHostStats();
        return stats;
      } catch (err) {
        set.status = 503;
        return { error: "Host stats unavailable", detail: String(err) };
      }
    },
    {
      query: t.Object({
        hostId: t.Optional(t.String()),
      }),
    },
  )

  .get(
    "/host/history",
    async ({ query }) => {
      const from = query.from ? new Date(query.from) : new Date(Date.now() - 3600_000);
      const to = query.to ? new Date(query.to) : new Date();
      const hostId = query.hostId ?? undefined;
      const stats = await getHostStatsHistory(from, to, hostId);
      return { data: stats, count: stats.length };
    },
    {
      query: t.Object({
        from: t.Optional(t.String()),
        to: t.Optional(t.String()),
        hostId: t.Optional(t.String()),
      }),
    },
  )

  .get(
    "/overview",
    async ({ set, query }) => {
      try {
        const hostId = query.hostId ?? undefined;
        const [containers, host, latestContainers, latestHost] = await Promise.all([
          collectDockerStats().catch(() => []),
          collectHostStats().catch(() => null),
          getLatestContainerStats(hostId).catch(() => []),
          getLatestHostStats(hostId).catch(() => null),
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
          hostId: hostId ?? "local",
        };
      } catch (err) {
        set.status = 503;
        return { error: "Overview unavailable", detail: String(err) };
      }
    },
    {
      query: t.Object({
        hostId: t.Optional(t.String()),
      }),
    },
  )

  // List all known hosts
  .get("/hosts", async () => {
    const hosts = await listHosts();
    return { hosts, count: hosts.length };
  })

  // GPU stats — latest per host
  .get(
    "/gpu",
    async ({ query }) => {
      const hostId = query.hostId ?? undefined;
      const stats = await getLatestGpuStats(hostId);
      return { gpus: stats, count: stats.length };
    },
    {
      query: t.Object({
        hostId: t.Optional(t.String()),
      }),
    },
  )

  // GPU stats history
  .get(
    "/gpu/history",
    async ({ query }) => {
      const from = query.from ? new Date(query.from) : new Date(Date.now() - 3600_000);
      const to = query.to ? new Date(query.to) : new Date();
      const hostId = query.hostId ?? undefined;
      const stats = await getGpuStatsHistory(from, to, hostId);
      return { data: stats, count: stats.length };
    },
    {
      query: t.Object({
        from: t.Optional(t.String()),
        to: t.Optional(t.String()),
        hostId: t.Optional(t.String()),
      }),
    },
  );
