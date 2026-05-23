import { Elysia, t } from "elysia";
import { searchLogs, getLogContainers, clearLogs } from "../store/logs.js";

export const logsPlugin = new Elysia({ prefix: "/api/logs" })
  .get(
    "/",
    async ({ query }) => {
      const { container, level, search, from, to, limit, offset } = query;

      const result = await searchLogs({
        container: container || undefined,
        level: level || undefined,
        search: search || undefined,
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
        limit: limit ? Number(limit) : 100,
        offset: offset ? Number(offset) : 0,
      });

      return { data: result };
    },
    {
      query: t.Object({
        container: t.Optional(t.String()),
        level: t.Optional(t.String()),
        search: t.Optional(t.String()),
        from: t.Optional(t.String()),
        to: t.Optional(t.String()),
        limit: t.Optional(t.Numeric()),
        offset: t.Optional(t.Numeric()),
      }),
    }
  )
  .get("/containers", async () => {
    const containers = await getLogContainers();
    return { data: containers };
  })
  .delete(
    "/",
    async ({ query }) => {
      const before = query.before ? new Date(query.before) : undefined;
      const deleted = await clearLogs(before);
      return { deleted };
    },
    {
      query: t.Object({
        before: t.Optional(t.String()),
      }),
    }
  );
