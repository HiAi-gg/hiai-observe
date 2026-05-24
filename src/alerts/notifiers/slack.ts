/**
 * Slack Alert Notifier
 *
 * Sends alert notifications via Slack incoming webhook with rich Block Kit formatting.
 */

interface SlackAlert {
  title: string;
  status: "critical" | "warning" | "recovered";
  details: string;
  currentValue: number;
  threshold: number;
  ruleName: string;
  timestamp: Date;
  dashboardUrl?: string;
}

function getStatusEmoji(status: SlackAlert["status"]): string {
  switch (status) {
    case "critical":
      return ":red_circle:";
    case "warning":
      return ":large_yellow_circle:";
    case "recovered":
      return ":large_green_circle:";
  }
}

function getStatusColor(status: SlackAlert["status"]): string {
  switch (status) {
    case "critical":
      return "#ff0000";
    case "warning":
      return "#ffaa00";
    case "recovered":
      return "#00ff00";
  }
}

/**
 * Send an alert notification to a Slack incoming webhook.
 */
export async function sendSlackAlert(
  webhookUrl: string,
  alert: SlackAlert,
  _config?: Record<string, string>
): Promise<{ ok: boolean; error?: string }> {
  const emoji = getStatusEmoji(alert.status);
  const color = getStatusColor(alert.status);

  const blocks: unknown[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `${emoji} ${alert.title}`,
        emoji: true,
      },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Status:*\n${alert.status.toUpperCase()}` },
        { type: "mrkdwn", text: `*Rule:*\n${alert.ruleName}` },
        { type: "mrkdwn", text: `*Current Value:*\n\`${alert.currentValue}\`` },
        { type: "mrkdwn", text: `*Threshold:*\n\`${alert.threshold}\`` },
      ],
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Details:*\n${alert.details}`,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `HiAi Observe | ${alert.timestamp.toISOString()}`,
        },
      ],
    },
  ];

  if (alert.dashboardUrl) {
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "View in Dashboard", emoji: true },
          url: alert.dashboardUrl,
          style: "primary",
        },
      ],
    });
  }

  const body = {
    username: "HiAi Observe",
    icon_emoji: ":robot_face:",
    attachments: [
      {
        color,
        blocks,
      },
    ],
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorBody = await response.text();
      return {
        ok: false,
        error: `Slack webhook error ${response.status}: ${errorBody}`,
      };
    }

    return { ok: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: `Slack request failed: ${errorMessage}` };
  }
}
