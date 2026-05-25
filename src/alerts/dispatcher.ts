/**
 * Alert Dispatcher
 *
 * Routes triggered alerts to configured notification channels.
 * Loads channel config from DB first, falls back to .env.
 */

import { db } from "../store/db.js";
import { alertHistory, notificationConfig } from "../store/schema.js";
import { eq, and } from "drizzle-orm";
import { sendTelegramAlert } from "./notifiers/telegram.js";
import { sendDiscordAlert } from "./notifiers/discord.js";
import { sendEmailAlert } from "./notifiers/email.js";
import { sendSlackAlert } from "./notifiers/slack.js";
import { sendWebhookAlert } from "./notifiers/webhook.js";
import { sendPagerdutyAlert } from "./notifiers/pagerduty.js";
import { sendTeamsAlert } from "./notifiers/teams.js";
import { sendNtfyAlert } from "./notifiers/ntfy.js";
import { sendGotifyAlert } from "./notifiers/gotify.js";
import { sendPushoverAlert } from "./notifiers/pushover.js";
import { markAlertFired } from "./dedup.js";
import type { AlertRule, AlertChannel, AlertEvaluationResult } from "./rules-engine.js";

export interface DispatchResult {
  alertId: string;
  channels: Array<{ type: string; target: string; ok: boolean; error?: string }>;
}

async function getChannelConfig(projectId: string, channel: string): Promise<Record<string, string> | null> {
  const [row] = await db.select()
    .from(notificationConfig)
    .where(and(
      eq(notificationConfig.projectId, projectId),
      eq(notificationConfig.channel, channel),
      eq(notificationConfig.enabled, true),
    ))
    .limit(1);

  return row?.config ?? null;
}

const SEVERITY_EMOJI: Record<string, string> = {
  critical: "\u{1F534}", // red circle
  warning: "\u{1F7E1}",  // yellow circle
  info: "\u{1F535}",     // blue circle
  recovered: "\u{1F7E2}", // green circle
};

export async function dispatchAlert(
  rule: AlertRule,
  result: AlertEvaluationResult,
  overrideStatus?: "critical" | "warning" | "recovered",
): Promise<DispatchResult> {
  const timestamp = new Date();
  const channelResults: DispatchResult["channels"] = [];

  // Use rule's computed severity (auto-escalated by rules engine),
  // fall back to override, then rule default
  const status: "critical" | "warning" | "recovered" =
    overrideStatus ?? (rule.severity as "critical" | "warning") ?? "warning";

  // Use per-alert channels if configured, otherwise fall back to project-level
  let channelsToUse = rule.channels;
  if (channelsToUse.length === 0) {
    const projectConfigs = await db.select()
      .from(notificationConfig)
      .where(and(
        eq(notificationConfig.projectId, rule.projectId),
        eq(notificationConfig.enabled, true),
      ));
    channelsToUse = projectConfigs
      .map((c) => ({ type: c.channel as AlertChannel["type"], target: extractTarget(c.channel, c.config) }))
      .filter((c) => c.target.length > 0);
  }

  for (const channel of channelsToUse) {
    const dbConfig = await getChannelConfig(rule.projectId, channel.type);

    const emoji = SEVERITY_EMOJI[status] ?? SEVERITY_EMOJI.warning;

    const delivery = await deliverToChannel(channel, {
      title: `${emoji} ${rule.name}`,
      status,
      details: result.message,
      currentValue: result.currentValue,
      threshold: result.threshold,
      ruleName: rule.name,
      timestamp,
    }, dbConfig);

    channelResults.push({
      type: channel.type,
      target: channel.target,
      ...delivery,
    });
  }

  const anySucceeded = channelResults.some(r => r.ok);

  if (anySucceeded) {
    await markAlertFired(rule.id, rule.cooldownSeconds);
  }

  await db.insert(alertHistory).values({
    alertId: rule.id,
    triggeredAt: timestamp,
    context: {
      condition: rule.condition,
      result: {
        currentValue: result.currentValue,
        threshold: result.threshold,
        message: result.message,
      },
      channelResults,
    },
  });

  console.log(
    `[Alert Dispatcher] ${rule.name}: dispatched to ${channelResults.length} channels`
  );

  return {
    alertId: rule.id,
    channels: channelResults,
  };
}

interface DeliveryPayload {
  title: string;
  status: "critical" | "warning" | "recovered";
  details: string;
  currentValue: number;
  threshold: number;
  ruleName: string;
  timestamp: Date;
}

async function deliverToChannel(
  channel: AlertChannel,
  payload: DeliveryPayload,
  dbConfig: Record<string, string> | null
): Promise<{ ok: boolean; error?: string }> {
  try {
    switch (channel.type) {
      case "telegram":
        return sendTelegramAlert(channel.target, {
          chatId: channel.target,
          ...payload,
        }, { botToken: dbConfig?.botToken });

      case "discord":
        return sendDiscordAlert(channel.target, payload, dbConfig ?? undefined);

      case "email":
        return sendEmailAlert({ to: channel.target, ...payload }, dbConfig ?? undefined);

      case "slack":
        return sendSlackAlert(channel.target, payload, dbConfig ?? undefined);

      case "webhook":
        return sendWebhookAlert(channel.target, payload, dbConfig ?? undefined);

      case "pagerduty":
        return sendPagerdutyAlert(channel.target, payload, dbConfig ?? undefined);

      case "teams":
        return sendTeamsAlert(channel.target, payload, dbConfig ?? undefined);

      case "ntfy":
        return sendNtfyAlert(channel.target, payload, dbConfig ?? undefined);

      case "gotify":
        return sendGotifyAlert(channel.target, payload, dbConfig ?? undefined);

      case "pushover":
        return sendPushoverAlert(channel.target, payload, dbConfig ?? undefined);

      default:
        return {
          ok: false,
          error: `Unknown channel type: ${(channel as AlertChannel).type}`,
        };
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: `Delivery failed: ${errorMessage}` };
  }
}

function extractTarget(channel: string, config: Record<string, string> | null): string {
  if (!config) return "";
  switch (channel) {
    case "telegram": return config.chatId ?? "";
    case "discord": return config.webhookUrl ?? "";
    case "email": return config.to ?? "";
    case "slack": return config.webhookUrl ?? "";
    case "webhook": return config.url ?? "";
    case "pagerduty": return config.routingKey ?? "";
    case "teams": return config.webhookUrl ?? "";
    case "ntfy": return config.topic ?? "";
    case "gotify": return config.server ?? "";
    case "pushover": return config.userKey ?? "";
    default: return "";
  }
}

export async function testAlert(
  rule: AlertRule
): Promise<DispatchResult> {
  const result: AlertEvaluationResult = {
    triggered: true,
    currentValue: 0,
    threshold: 0,
    message: "This is a test alert from HiAi Observe",
  };

  return dispatchAlert(rule, result);
}
