/**
 * Microsoft Teams Alert Notifier
 *
 * Sends alert notifications via Teams incoming webhook using Adaptive Card format.
 */

import { config as appConfig } from "../../lib/config.js";

interface TeamsAlert {
  title: string;
  status: "critical" | "warning" | "recovered";
  details: string;
  currentValue: number;
  threshold: number;
  ruleName: string;
  timestamp: Date;
}

function getStatusColor(status: TeamsAlert["status"]): string {
  switch (status) {
    case "critical":
      return "attention";
    case "warning":
      return "warning";
    case "recovered":
      return "good";
  }
}

function getStatusEmoji(status: TeamsAlert["status"]): string {
  switch (status) {
    case "critical":
      return "\u{1F534}";
    case "warning":
      return "\u{1F7E1}";
    case "recovered":
      return "\u{1F7E2}";
  }
}

/**
 * Send an alert notification to a Microsoft Teams incoming webhook.
 */
export async function sendTeamsAlert(
  webhookUrl: string,
  alert: TeamsAlert,
  config?: { webhookUrl?: string },
): Promise<{ ok: boolean; error?: string }> {
  const url = config?.webhookUrl || webhookUrl || appConfig.TEAMS_WEBHOOK_URL;
  if (!url) {
    return { ok: false, error: "Teams webhook URL not configured" };
  }

  const emoji = getStatusEmoji(alert.status);
  const color = getStatusColor(alert.status);
  const timeStr = alert.timestamp.toISOString().replace("T", " ").slice(0, 19);

  const card = {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body: [
            {
              type: "Container",
              style: color,
              items: [
                {
                  type: "TextBlock",
                  text: `${emoji} ${alert.title}`,
                  weight: "bolder",
                  size: "large",
                  wrap: true,
                },
              ],
            },
            {
              type: "FactSet",
              facts: [
                { title: "Status", value: alert.status.toUpperCase() },
                { title: "Rule", value: alert.ruleName },
                { title: "Current Value", value: String(alert.currentValue) },
                { title: "Threshold", value: String(alert.threshold) },
                { title: "Time", value: `${timeStr} UTC` },
              ],
            },
            {
              type: "TextBlock",
              text: alert.details,
              wrap: true,
            },
          ],
        },
      },
    ],
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(card),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorBody = await response.text();
      return {
        ok: false,
        error: `Teams webhook error ${response.status}: ${errorBody}`,
      };
    }

    return { ok: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: `Teams request failed: ${errorMessage}` };
  }
}
