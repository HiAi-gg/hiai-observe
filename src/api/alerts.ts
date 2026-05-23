import { Elysia, t } from "elysia";
import { db } from "../store/db.js";
import { alerts, alertHistory } from "../store/schema.js";
import { eq, desc, and, ilike, count } from "drizzle-orm";
import { testAlert } from "../alerts/dispatcher.js";
import type { AlertCondition, AlertChannel, AlertRule } from "../alerts/rules-engine.js";

export const alertsRoutes = new Elysia({ prefix: "/api/alerts" })

  .get("/", async ({ query }) => {
    const { projectId, search, limit = "50", offset = "0" } = query;
    const conditions = [];
    if (projectId) conditions.push(eq(alerts.projectId, projectId));
    if (search) {
      const escaped = search.replace(/[%_]/g, "\\$&");
      conditions.push(ilike(alerts.name, `%${escaped}%`));
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [items, totalResult] = await Promise.all([
      db.select().from(alerts).where(where).orderBy(desc(alerts.createdAt)).limit(Number(limit)).offset(Number(offset)),
      db.select({ total: count() }).from(alerts).where(where),
    ]);

    return { items, total: totalResult[0]?.total ?? 0, limit: Number(limit), offset: Number(offset) };
  }, {
    query: t.Object({
      projectId: t.Optional(t.String()),
      search: t.Optional(t.String()),
      limit: t.Optional(t.String()),
      offset: t.Optional(t.String()),
    }),
  })

  .get("/:id", async ({ params, set }) => {
    const [alert] = await db.select().from(alerts).where(eq(alerts.id, params.id)).limit(1);
    if (!alert) { set.status = 404; return { error: "Alert not found" }; }

    const history = await db
      .select().from(alertHistory)
      .where(eq(alertHistory.alertId, params.id))
      .orderBy(desc(alertHistory.triggeredAt))
      .limit(20);

    return { ...alert, history };
  }, { params: t.Object({ id: t.String() }) })

  .post("/", async ({ body }) => {
    const [created] = await db.insert(alerts).values({
      name: body.name,
      projectId: body.projectId,
      condition: body.condition as AlertCondition,
      channels: body.channels as Array<{ type: string; target: string }>,
      cooldownSeconds: body.cooldownSeconds ?? 300,
    }).returning();
    return created;
  }, {
    body: t.Object({
      name: t.String({ minLength: 1 }),
      projectId: t.String(),
      condition: t.Object({
        type: t.Union([t.Literal("error_rate"), t.Literal("uptime_down"), t.Literal("resource_threshold"), t.Literal("trace_error"), t.Literal("token_usage")]),
        threshold: t.Number(),
        duration: t.Optional(t.Number()),
        operator: t.Union([t.Literal("gt"), t.Literal("lt"), t.Literal("eq"), t.Literal("gte"), t.Literal("lte")]),
        consecutiveFailures: t.Optional(t.Number()),
        resource: t.Optional(t.Union([t.Literal("cpu"), t.Literal("memory"), t.Literal("disk")])),
        model: t.Optional(t.String()),
      }),
      channels: t.Array(t.Object({
        type: t.Union([t.Literal("telegram"), t.Literal("discord"), t.Literal("email")]),
        target: t.String(),
      })),
      cooldownSeconds: t.Optional(t.Number({ minimum: 60 })),
    }),
  })

  .put("/:id", async ({ params, body, set }) => {
    const [existing] = await db.select({ id: alerts.id }).from(alerts).where(eq(alerts.id, params.id)).limit(1);
    if (!existing) { set.status = 404; return { error: "Alert not found" }; }

    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.condition !== undefined) updateData.condition = body.condition as AlertCondition;
    if (body.channels !== undefined) updateData.channels = body.channels as Array<{ type: string; config: Record<string, string> }>;
    if (body.isActive !== undefined) updateData.isActive = body.isActive;
    if (body.cooldownSeconds !== undefined) updateData.cooldownSeconds = body.cooldownSeconds;

    const [updated] = await db.update(alerts).set(updateData).where(eq(alerts.id, params.id)).returning();
    return updated;
  }, {
    params: t.Object({ id: t.String() }),
    body: t.Object({
      name: t.Optional(t.String()),
      condition: t.Optional(t.Object({})),
      channels: t.Optional(t.Array(t.Object({}))),
      isActive: t.Optional(t.Boolean()),
      cooldownSeconds: t.Optional(t.Number()),
    }),
  })

  .delete("/:id", async ({ params, set }) => {
    const [existing] = await db.select({ id: alerts.id }).from(alerts).where(eq(alerts.id, params.id)).limit(1);
    if (!existing) { set.status = 404; return { error: "Alert not found" }; }

    await db.delete(alertHistory).where(eq(alertHistory.alertId, params.id));
    await db.delete(alerts).where(eq(alerts.id, params.id));
    return { deleted: true };
  }, { params: t.Object({ id: t.String() }) })

  .post("/:id/test", async ({ params, set }) => {
    const [alert] = await db.select().from(alerts).where(eq(alerts.id, params.id)).limit(1);
    if (!alert) { set.status = 404; return { error: "Alert not found" }; }

    const rule: AlertRule = {
      id: alert.id,
      name: alert.name,
      projectId: alert.projectId,
      condition: alert.condition as AlertCondition,
      channels: (alert.channels ?? []) as unknown as AlertChannel[],
      isActive: alert.isActive,
      cooldownSeconds: alert.cooldownSeconds,
      createdAt: alert.createdAt,
    };

    return testAlert(rule);
  }, { params: t.Object({ id: t.String() }) })

  .get("/history", async ({ query }) => {
    const { alertId, limit = "50", offset = "0" } = query;
    const conditions = [];
    if (alertId) conditions.push(eq(alertHistory.alertId, alertId));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [items, totalResult] = await Promise.all([
      db.select().from(alertHistory).where(where).orderBy(desc(alertHistory.triggeredAt)).limit(Number(limit)).offset(Number(offset)),
      db.select({ total: count() }).from(alertHistory).where(where),
    ]);

    return { items, total: totalResult[0]?.total ?? 0, limit: Number(limit), offset: Number(offset) };
  }, {
    query: t.Object({
      alertId: t.Optional(t.String()),
      limit: t.Optional(t.String()),
      offset: t.Optional(t.String()),
    }),
  })

  // ── Test all active alerts ─────────────────────────────────────────────
  .post("/test-all", async ({ set }) => {
    try {
      const activeAlerts = await db.select().from(alerts).where(eq(alerts.isActive, true));

      if (activeAlerts.length === 0) {
        return { message: "No active alerts to test", results: [] };
      }

      const results = [];
      for (const alert of activeAlerts) {
        const rule: AlertRule = {
          id: alert.id,
          name: alert.name,
          projectId: alert.projectId,
          condition: alert.condition as AlertCondition,
          channels: (alert.channels ?? []) as unknown as AlertChannel[],
          isActive: alert.isActive,
          cooldownSeconds: alert.cooldownSeconds,
          createdAt: alert.createdAt,
        };

        const result = await testAlert(rule);
        results.push({ id: alert.id, name: alert.name, ...result });
      }

      return {
        message: `Tested ${results.length} alert(s)`,
        results,
      };
    } catch (err) {
      set.status = 500;
      return { error: "Failed to test alerts", detail: process.env.NODE_ENV === "development" ? String(err) : "Internal error" };
    }
  })

  // ── List available notification channels ───────────────────────────────
  .get("/channels", () => {
    return {
      channels: [
        {
          type: "telegram",
          name: "Telegram",
          description: "Send alerts via Telegram Bot API",
          configFields: [
            { key: "botToken", label: "Bot Token", envVar: "TELEGRAM_BOT_TOKEN", required: true },
            { key: "chatId", label: "Chat ID", envVar: "TELEGRAM_CHAT_ID", required: true },
          ],
          configured: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
        },
        {
          type: "discord",
          name: "Discord",
          description: "Send alerts via Discord webhook",
          configFields: [
            { key: "webhookUrl", label: "Webhook URL", envVar: "DISCORD_WEBHOOK_URL", required: true },
          ],
          configured: !!process.env.DISCORD_WEBHOOK_URL,
        },
        {
          type: "email",
          name: "Email (SMTP)",
          description: "Send alerts via SMTP email",
          configFields: [
            { key: "host", label: "SMTP Host", envVar: "SMTP_HOST", required: true },
            { key: "port", label: "SMTP Port", envVar: "SMTP_PORT", required: true },
            { key: "user", label: "SMTP User", envVar: "SMTP_USER", required: false },
            { key: "pass", label: "SMTP Password", envVar: "SMTP_PASS", required: false },
            { key: "from", label: "From Address", envVar: "SMTP_FROM", required: true },
          ],
          configured: !!(process.env.SMTP_HOST && process.env.SMTP_FROM),
        },
      ],
    };
  });
