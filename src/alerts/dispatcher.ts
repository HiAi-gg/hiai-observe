/**
 * Alert Dispatcher
 *
 * Routes triggered alerts to configured notification channels
 * and records delivery in alert_history.
 */

import { db } from "../store/db.js";
import { alertHistory } from "../store/schema.js";
import { sendTelegramAlert } from "./notifiers/telegram.js";
import { sendDiscordAlert } from "./notifiers/discord.js";
import { sendEmailAlert } from "./notifiers/email.js";
import { markAlertFired } from "./dedup.js";
import type { AlertRule, AlertChannel, AlertEvaluationResult } from "./rules-engine.js";

export interface DispatchResult {
  alertId: string;
  channels: Array<{ type: string; target: string; ok: boolean; error?: string }>;
}

/**
 * Dispatch a triggered alert to all configured channels.
 */
export async function dispatchAlert(
  rule: AlertRule,
  result: AlertEvaluationResult
): Promise<DispatchResult> {
  const timestamp = new Date();
  const channelResults: DispatchResult["channels"] = [];

  const status: "critical" | "warning" | "recovered" =
    result.currentValue > result.threshold * 2 ? "critical" : "warning";

  for (const channel of rule.channels) {
    const delivery = await deliverToChannel(channel, {
      title: rule.name,
      status,
      details: result.message,
      currentValue: result.currentValue,
      threshold: result.threshold,
      ruleName: rule.name,
      timestamp,
    });

    channelResults.push({
      type: channel.type,
      target: channel.target,
      ...delivery,
    });
  }

  // Mark alert as fired for cooldown tracking
  await markAlertFired(rule.id, rule.cooldownSeconds);

  // Record in alert_history
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
  payload: DeliveryPayload
): Promise<{ ok: boolean; error?: string }> {
  try {
    switch (channel.type) {
      case "telegram":
        return sendTelegramAlert(channel.target, {
          chatId: channel.target,
          ...payload,
        });

      case "discord":
        return sendDiscordAlert(channel.target, payload);

      case "email":
        return sendEmailAlert({ to: channel.target, ...payload });

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

/**
 * Send a test alert to verify channel configuration.
 */
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
