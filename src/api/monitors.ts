import { Elysia, t } from "elysia";
import {
  createMonitor,
  deleteMonitor,
  getChecks,
  getMonitor,
  getMonitorGroups,
  getMonitors,
  getUptimePercentage,
  getUptimePercentages,
  updateMonitor,
} from "../store/uptime.js";

export const monitorsPlugin = new Elysia({ prefix: "/api/monitors" })
  .get(
    "/",
    async ({ query }) => {
      const monitors = await getMonitors(query.project_id, query.group);

      const ids = monitors.map((m) => m.id);
      const hours = query.hours ?? 24;
      const uptimeMap = await getUptimePercentages(ids, hours);

      const withUptime = monitors.map((m) => ({
        ...m,
        uptime24h: uptimeMap.get(m.id) ?? 100,
      }));

      return { monitors: withUptime };
    },
    {
      query: t.Object({
        project_id: t.Optional(t.String()),
        // tenantId is accepted as an alias for project_id. tenantScopePlugin
        // resolves it to the bound project UUID before the handler runs.
        tenantId: t.Optional(t.String()),
        group: t.Optional(t.String()),
        hours: t.Optional(t.Number({ minimum: 1, maximum: 8760 })),
      }),
    },
  )

  .get(
    "/groups",
    async ({ query }) => {
      const groups = await getMonitorGroups(query.project_id);
      return { groups };
    },
    {
      query: t.Object({
        project_id: t.Optional(t.String()),
        // tenantId is accepted as an alias for project_id. tenantScopePlugin
        // resolves it to the bound project UUID before the handler runs.
        tenantId: t.Optional(t.String()),
      }),
    },
  )

  .get("/:id", async ({ params: { id }, set }) => {
    const monitor = await getMonitor(id);
    if (!monitor) {
      set.status = 404;
      return { error: "Monitor not found" };
    }

    const uptime24h = await getUptimePercentage(id, 24);
    return { monitor: { ...monitor, uptime24h } };
  })

  .post(
    "/",
    async ({ body, set }) => {
      try {
        const monitor = await createMonitor({
          name: body.name,
          url: body.url,
          intervalSeconds: body.interval_seconds ?? 60,
          projectId: body.project_id,
          type: body.type,
          monitorGroup: body.group,
          method: body.method,
          headers: body.headers as Record<string, string> | undefined,
          body: body.body,
          authType: body.auth_type,
          authValue: body.auth_value,
          ignoreSsl: body.ignore_ssl,
          maxRedirects: body.max_redirects,
          keyword: body.keyword,
          keywordNot: body.keyword_not,
          dnsRecordType: body.dns_record_type,
          dnsExpectedValue: body.dns_expected_value,
          dnsResolver: body.dns_resolver,
        });
        return { monitor };
      } catch (err: unknown) {
        set.status = 400;
        return { error: err instanceof Error ? err.message : "Unknown error" };
      }
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1 }),
        url: t.String({ format: "uri" }),
        type: t.Optional(t.String()),
        group: t.Optional(t.String()),
        interval_seconds: t.Optional(t.Number({ minimum: 10 })),
        project_id: t.String(),
        method: t.Optional(t.String()),
        headers: t.Optional(t.Record(t.String(), t.String())),
        body: t.Optional(t.String()),
        auth_type: t.Optional(t.String()),
        auth_value: t.Optional(t.String()),
        ignore_ssl: t.Optional(t.Boolean()),
        max_redirects: t.Optional(t.Number({ minimum: 0, maximum: 20 })),
        keyword: t.Optional(t.String()),
        keyword_not: t.Optional(t.String()),
        dns_record_type: t.Optional(t.String()),
        dns_expected_value: t.Optional(t.String()),
        dns_resolver: t.Optional(t.String()),
      }),
    },
  )

  .put(
    "/:id",
    async ({ params: { id }, body }) => {
      const monitor = await updateMonitor(id, {
        name: body.name,
        url: body.url,
        intervalSeconds: body.interval_seconds,
        active: body.active,
        method: body.method,
        headers: body.headers as Record<string, string> | undefined,
        body: body.body,
        authType: body.auth_type,
        authValue: body.auth_value,
        ignoreSsl: body.ignore_ssl,
        maxRedirects: body.max_redirects,
        keyword: body.keyword,
        keywordNot: body.keyword_not,
        dnsRecordType: body.dns_record_type,
        dnsExpectedValue: body.dns_expected_value,
        dnsResolver: body.dns_resolver,
      });
      return { monitor };
    },
    {
      body: t.Object({
        name: t.Optional(t.String({ minLength: 1 })),
        url: t.Optional(t.String({ format: "uri" })),
        interval_seconds: t.Optional(t.Number({ minimum: 10 })),
        active: t.Optional(t.Boolean()),
        method: t.Optional(t.String()),
        headers: t.Optional(t.Record(t.String(), t.String())),
        body: t.Optional(t.String()),
        auth_type: t.Optional(t.String()),
        auth_value: t.Optional(t.String()),
        ignore_ssl: t.Optional(t.Boolean()),
        max_redirects: t.Optional(t.Number({ minimum: 0, maximum: 20 })),
        keyword: t.Optional(t.String()),
        keyword_not: t.Optional(t.String()),
        dns_record_type: t.Optional(t.String()),
        dns_expected_value: t.Optional(t.String()),
        dns_resolver: t.Optional(t.String()),
      }),
    },
  )

  .delete("/:id", async ({ params: { id } }) => {
    await deleteMonitor(id);
    return { deleted: true };
  })

  .get(
    "/:id/checks",
    async ({ params: { id }, query }) => {
      const result = await getChecks(id, {
        limit: query.limit,
        offset: query.offset,
        from: query.from ? new Date(query.from) : undefined,
        to: query.to ? new Date(query.to) : undefined,
      });
      return result;
    },
    {
      query: t.Object({
        limit: t.Optional(t.Number({ minimum: 1, maximum: 200 })),
        offset: t.Optional(t.Number({ minimum: 0 })),
        from: t.Optional(t.String({ format: "date-time" })),
        to: t.Optional(t.String({ format: "date-time" })),
      }),
    },
  );
