/**
 * Notifications Configuration API
 *
 * CRUD for notification channel config stored in DB.
 * Falls back to .env when no DB config exists.
 */

import { Elysia, t } from "elysia";
import { db } from "../store/db.js";
import { notificationConfig } from "../store/schema.js";
import { eq, and } from "drizzle-orm";
import { sendTelegramAlert } from "../alerts/notifiers/telegram.js";
import { sendDiscordAlert } from "../alerts/notifiers/discord.js";
import { sendEmailAlert } from "../alerts/notifiers/email.js";

const VALID_CHANNELS = ["telegram", "discord", "email", "slack", "webhook", "pagerduty", "teams", "ntfy", "gotify", "pushover"] as const;

export const notificationsRoutes = new Elysia({ prefix: "/api/notifications" })

  // List all notification configs for current project
  .get("/", async ({ query }) => {
    const conditions = [];
    if (query.projectId) conditions.push(eq(notificationConfig.projectId, query.projectId));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db.select().from(notificationConfig).where(where);

    // Mask sensitive values (bot tokens, passwords)
    const masked = rows.map((r) => ({
      id: r.id,
      projectId: r.projectId,
      channel: r.channel,
      config: maskSensitive(r.config),
      enabled: r.enabled,
      configured: isConfigured(r.config, r.channel),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));

    return { notifications: masked };
  }, {
    query: t.Object({ projectId: t.Optional(t.String()) }),
  })

  // Get config for specific channel
  .get("/:channel", async ({ params, query, set }) => {
    if (!VALID_CHANNELS.includes(params.channel as typeof VALID_CHANNELS[number])) {
      set.status = 400;
      return { error: `Invalid channel. Must be: ${VALID_CHANNELS.join(", ")}` };
    }

    const conditions = [
      eq(notificationConfig.channel, params.channel),
    ];
    if (query.projectId) conditions.push(eq(notificationConfig.projectId, query.projectId));
    const where = and(...conditions);

    const [row] = await db.select().from(notificationConfig).where(where).limit(1);

    if (!row) {
      // Check env fallback
      const envConfig = getEnvConfig(params.channel);
      return {
        channel: params.channel,
        config: maskSensitive(envConfig),
        configured: isConfigured(envConfig, params.channel),
        source: "env",
      };
    }

    return {
      ...row,
      config: maskSensitive(row.config),
      configured: isConfigured(row.config, row.channel),
      source: "db",
    };
  }, {
    params: t.Object({ channel: t.String() }),
    query: t.Object({ projectId: t.Optional(t.String()) }),
  })

  // Upsert notification config
  .put("/:channel", async ({ params, body, set }) => {
    if (!VALID_CHANNELS.includes(params.channel as typeof VALID_CHANNELS[number])) {
      set.status = 400;
      return { error: `Invalid channel. Must be: ${VALID_CHANNELS.join(", ")}` };
    }

    const [existing] = await db.select()
      .from(notificationConfig)
      .where(and(
        eq(notificationConfig.projectId, body.projectId),
        eq(notificationConfig.channel, params.channel),
      ))
      .limit(1);

    if (existing) {
      const [updated] = await db.update(notificationConfig)
        .set({ config: body.config, enabled: body.enabled ?? true, updatedAt: new Date() })
        .where(eq(notificationConfig.id, existing.id))
        .returning();
      return { id: updated?.id, channel: params.channel, updated: true };
    }

    const [created] = await db.insert(notificationConfig).values({
      projectId: body.projectId,
      channel: params.channel,
      config: body.config,
      enabled: body.enabled ?? true,
    }).returning();

    set.status = 201;
    return { id: created?.id, channel: params.channel, created: true };
  }, {
    params: t.Object({ channel: t.String() }),
    body: t.Object({
      projectId: t.String(),
      config: t.Record(t.String(), t.String()),
      enabled: t.Optional(t.Boolean()),
    }),
  })

  // Delete notification config
  .delete("/:channel", async ({ params, query, set }) => {
    const conditions = [
      eq(notificationConfig.channel, params.channel),
    ];
    if (query.projectId) conditions.push(eq(notificationConfig.projectId, query.projectId));
    const where = and(...conditions);

    const deleted = await db.delete(notificationConfig).where(where).returning();
    if (deleted.length === 0) { set.status = 404; return { error: "Not found" }; }
    return { deleted: true };
  }, {
    params: t.Object({ channel: t.String() }),
    query: t.Object({ projectId: t.Optional(t.String()) }),
  })

  // Test notification channel
  .post("/:channel/test", async ({ params, query, set }) => {
    if (!VALID_CHANNELS.includes(params.channel as typeof VALID_CHANNELS[number])) {
      set.status = 400;
      return { error: `Invalid channel. Must be: ${VALID_CHANNELS.join(", ")}` };
    }

    // Load config from DB or fall back to env
    let config: Record<string, string> | null = null;
    if (query.projectId) {
      const [row] = await db.select()
        .from(notificationConfig)
        .where(and(
          eq(notificationConfig.projectId, query.projectId),
          eq(notificationConfig.channel, params.channel),
        ))
        .limit(1);
      config = row?.config ?? null;
    }

    const testPayload = {
      title: "Test Alert",
      status: "warning" as const,
      details: "This is a test notification from HiAi Observe",
      currentValue: 42,
      threshold: 10,
      ruleName: "Test Rule",
      timestamp: new Date(),
    };

    let result: { ok: boolean; error?: string };

    switch (params.channel) {
      case "telegram": {
        const chatId = config?.chatId || process.env.TELEGRAM_CHAT_ID;
        if (!chatId) { set.status = 400; return { error: "No chat ID configured" }; }
        result = await sendTelegramAlert(chatId, { chatId, ...testPayload }, { botToken: config?.botToken });
        break;
      }
      case "discord": {
        const webhookUrl = config?.webhookUrl || process.env.DISCORD_WEBHOOK_URL;
        if (!webhookUrl) { set.status = 400; return { error: "No webhook URL configured" }; }
        result = await sendDiscordAlert(webhookUrl, testPayload, config ?? undefined);
        break;
      }
      case "email": {
        const to = config?.to || process.env.SMTP_USER;
        if (!to) { set.status = 400; return { error: "No recipient configured" }; }
        result = await sendEmailAlert({ to, ...testPayload }, config ?? undefined);
        break;
      }
      case "slack": {
        const webhookUrl = config?.webhookUrl || process.env.SLACK_WEBHOOK_URL;
        if (!webhookUrl) { set.status = 400; return { error: "No webhook URL configured" }; }
        const { sendSlackAlert } = await import("../alerts/notifiers/slack.js");
        result = await sendSlackAlert(webhookUrl, testPayload, config ?? undefined);
        break;
      }
      case "webhook": {
        const webhookUrl = config?.url || process.env.WEBHOOK_URL;
        if (!webhookUrl) { set.status = 400; return { error: "No webhook URL configured" }; }
        const { sendWebhookAlert } = await import("../alerts/notifiers/webhook.js");
        result = await sendWebhookAlert(webhookUrl, testPayload, config ?? undefined);
        break;
      }
      case "pagerduty": {
        const routingKey = config?.routingKey || process.env.PAGERDUTY_ROUTING_KEY;
        if (!routingKey) { set.status = 400; return { error: "No routing key configured" }; }
        const { sendPagerdutyAlert } = await import("../alerts/notifiers/pagerduty.js");
        result = await sendPagerdutyAlert(routingKey, testPayload, config ?? undefined);
        break;
      }
      case "teams": {
        const webhookUrl = config?.webhookUrl || process.env.TEAMS_WEBHOOK_URL;
        if (!webhookUrl) { set.status = 400; return { error: "No webhook URL configured" }; }
        const { sendTeamsAlert } = await import("../alerts/notifiers/teams.js");
        result = await sendTeamsAlert(webhookUrl, testPayload, config ?? undefined);
        break;
      }
      case "ntfy": {
        const topic = config?.topic || process.env.NTFY_TOPIC;
        if (!topic) { set.status = 400; return { error: "No topic configured" }; }
        const { sendNtfyAlert } = await import("../alerts/notifiers/ntfy.js");
        result = await sendNtfyAlert(topic, testPayload, config ?? undefined);
        break;
      }
      case "gotify": {
        const server = config?.server || process.env.GOTIFY_SERVER;
        if (!server) { set.status = 400; return { error: "No server URL configured" }; }
        const { sendGotifyAlert } = await import("../alerts/notifiers/gotify.js");
        result = await sendGotifyAlert(server, testPayload, config ?? undefined);
        break;
      }
      case "pushover": {
        const userKey = config?.userKey || process.env.PUSHOVER_USER_KEY;
        if (!userKey) { set.status = 400; return { error: "No user key configured" }; }
        const { sendPushoverAlert } = await import("../alerts/notifiers/pushover.js");
        result = await sendPushoverAlert(userKey, testPayload, config ?? undefined);
        break;
      }
      default:
        result = { ok: false, error: "Unknown channel" };
    }

    return result;
  }, {
    params: t.Object({ channel: t.String() }),
    query: t.Object({ projectId: t.Optional(t.String()) }),
  });

// Helpers

function maskSensitive(config: Record<string, string> | null): Record<string, string> {
  if (!config) return {};
  const masked: Record<string, string> = {};
  const sensitiveKeys = ["botToken", "token", "pass", "password", "secret", "webhookUrl", "apiKey"];

  for (const [key, value] of Object.entries(config)) {
    if (!value) { masked[key] = ""; continue; }
    if (sensitiveKeys.some((k) => key.toLowerCase().includes(k.toLowerCase()))) {
      masked[key] = value.length > 8 ? `${value.slice(0, 4)}••••${value.slice(-4)}` : "••••";
    } else {
      masked[key] = value;
    }
  }
  return masked;
}

function isConfigured(config: Record<string, string> | null, channel: string): boolean {
  if (!config) return false;
  switch (channel) {
    case "telegram": return !!(config.botToken && config.chatId);
    case "discord": return !!config.webhookUrl;
    case "email": return !!(config.host && config.from);
    case "slack": return !!config.webhookUrl;
    case "webhook": return !!config.url;
    case "pagerduty": return !!config.routingKey;
    case "teams": return !!config.webhookUrl;
    case "ntfy": return !!config.topic;
    case "gotify": return !!(config.server && config.token);
    case "pushover": return !!(config.userKey && config.token);
    default: return false;
  }
}

function getEnvConfig(channel: string): Record<string, string> {
  switch (channel) {
    case "telegram":
      return {
        botToken: process.env.TELEGRAM_BOT_TOKEN || "",
        chatId: process.env.TELEGRAM_CHAT_ID || "",
      };
    case "discord":
      return { webhookUrl: process.env.DISCORD_WEBHOOK_URL || "" };
    case "email":
      return {
        host: process.env.SMTP_HOST || "",
        port: process.env.SMTP_PORT || "587",
        user: process.env.SMTP_USER || "",
        pass: process.env.SMTP_PASS || "",
        from: process.env.SMTP_FROM || "",
      };
    case "slack":
      return { webhookUrl: process.env.SLACK_WEBHOOK_URL || "" };
    case "webhook":
      return {
        url: process.env.WEBHOOK_URL || "",
        secret: process.env.WEBHOOK_SECRET || "",
      };
    case "pagerduty":
      return { routingKey: process.env.PAGERDUTY_ROUTING_KEY || "" };
    case "teams":
      return { webhookUrl: process.env.TEAMS_WEBHOOK_URL || "" };
    case "ntfy":
      return {
        topic: process.env.NTFY_TOPIC || "",
        server: process.env.NTFY_SERVER || "",
      };
    case "gotify":
      return {
        server: process.env.GOTIFY_SERVER || "",
        token: process.env.GOTIFY_TOKEN || "",
      };
    case "pushover":
      return {
        userKey: process.env.PUSHOVER_USER_KEY || "",
        token: process.env.PUSHOVER_TOKEN || "",
      };
    default:
      return {};
  }
}
