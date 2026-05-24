import { Elysia, t } from "elysia";
import {
  getMonitors,
  getMonitor,
  createMonitor,
  updateMonitor,
  deleteMonitor,
  getChecks,
  getUptimePercentage,
  getUptimePercentages,
  getMonitorGroups,
} from "../store/uptime.js";

export const monitorsPlugin = new Elysia({ prefix: "/api/monitors" })
  .get("/", async ({ query }) => {
    const monitors = await getMonitors(query.project_id, query.group);

    const ids = monitors.map((m) => m.id);
    const hours = query.hours ?? 24;
    const uptimeMap = await getUptimePercentages(ids, hours);

    const withUptime = monitors.map((m) => ({
      ...m,
      uptime24h: uptimeMap.get(m.id) ?? 100,
    }));

    return { monitors: withUptime };
  }, {
    query: t.Object({
      project_id: t.Optional(t.String()),
      group: t.Optional(t.String()),
      hours: t.Optional(t.Number({ minimum: 1, maximum: 8760 })),
    }),
  })

  .get("/groups", async ({ query }) => {
    const groups = await getMonitorGroups(query.project_id);
    return { groups };
  }, {
    query: t.Object({
      project_id: t.Optional(t.String()),
    }),
  })

  .get("/:id", async ({ params: { id }, set }) => {
    const monitor = await getMonitor(id);
    if (!monitor) { set.status = 404; return { error: "Monitor not found" }; }

    const uptime24h = await getUptimePercentage(id, 24);
    return { monitor: { ...monitor, uptime24h } };
  })

  .post("/", async ({ body, set }) => {
    try {
      const monitor = await createMonitor({
        name: body.name,
        url: body.url,
        intervalSeconds: body.interval_seconds ?? 60,
        projectId: body.project_id,
        type: body.type,
        monitorGroup: body.group,
      });
      return { monitor };
    } catch (err: unknown) {
      set.status = 400;
      return { error: err instanceof Error ? err.message : "Unknown error" };
    }
  }, {
    body: t.Object({
      name: t.String({ minLength: 1 }),
      url: t.String({ format: "uri" }),
      type: t.Optional(t.String()),
      group: t.Optional(t.String()),
      interval_seconds: t.Optional(t.Number({ minimum: 10 })),
      project_id: t.String(),
    }),
  })

  .put("/:id", async ({ params: { id }, body }) => {
    const monitor = await updateMonitor(id, {
      name: body.name,
      url: body.url,
      intervalSeconds: body.interval_seconds,
      active: body.active,
    });
    return { monitor };
  }, {
    body: t.Object({
      name: t.Optional(t.String({ minLength: 1 })),
      url: t.Optional(t.String({ format: "uri" })),
      interval_seconds: t.Optional(t.Number({ minimum: 10 })),
      active: t.Optional(t.Boolean()),
    }),
  })

  .delete("/:id", async ({ params: { id } }) => {
    await deleteMonitor(id);
    return { deleted: true };
  })

  .get("/:id/checks", async ({ params: { id }, query }) => {
    const result = await getChecks(id, {
      limit: query.limit,
      offset: query.offset,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
    });
    return result;
  }, {
    query: t.Object({
      limit: t.Optional(t.Number({ minimum: 1, maximum: 200 })),
      offset: t.Optional(t.Number({ minimum: 0 })),
      from: t.Optional(t.String({ format: "date-time" })),
      to: t.Optional(t.String({ format: "date-time" })),
    }),
  });
