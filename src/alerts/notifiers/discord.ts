/**
 * Discord Alert Notifier
 *
 * Sends alert notifications via Discord webhook with rich embed formatting,
 * color coding, and HiAi Observe branding.
 */

interface DiscordAlert {
  title: string;
  status: "critical" | "warning" | "recovered";
  details: string;
  currentValue: number;
  threshold: number;
  ruleName: string;
  timestamp: Date;
  dashboardUrl?: string;
}

function getStatusColor(status: DiscordAlert["status"]): number {
  switch (status) {
    case "critical":
      return 0xff_00_00; // red
    case "warning":
      return 0xff_aa_00; // yellow
    case "recovered":
      return 0x00_ff_00; // green
  }
}

function getStatusEmoji(status: DiscordAlert["status"]): string {
  switch (status) {
    case "critical":
      return "🔴";
    case "warning":
      return "🟡";
    case "recovered":
      return "🟢";
  }
}

/**
 * Send an alert notification to a Discord webhook.
 */
export async function sendDiscordAlert(
  webhookUrl: string,
  alert: DiscordAlert
): Promise<{ ok: boolean; error?: string }> {
  const color = getStatusColor(alert.status);
  const emoji = getStatusEmoji(alert.status);

  const fields = [
    { name: "Status", value: `${emoji} **${alert.status.toUpperCase()}**`, inline: true },
    { name: "Rule", value: alert.ruleName, inline: true },
    { name: "\u200B", value: "\u200B", inline: true }, // spacer
    { name: "Current Value", value: `\`${alert.currentValue}\``, inline: true },
    { name: "Threshold", value: `\`${alert.threshold}\``, inline: true },
    { name: "\u200B", value: "\u200B", inline: true }, // spacer
    { name: "Details", value: alert.details, inline: false },
  ];

  const embed: Record<string, unknown> = {
    title: `${emoji} ${alert.title}`,
    color,
    fields,
    timestamp: alert.timestamp.toISOString(),
    footer: {
      text: "HiAi Observe",
      icon_url: "https://img.icons8.com/fluency/48/monitor.png",
    },
  };

  if (alert.dashboardUrl) {
    embed.url = alert.dashboardUrl;
    embed.author = {
      name: "View in Dashboard",
      url: alert.dashboardUrl,
    };
  }

  const body = {
    username: "HiAi Observe",
    avatar_url: "https://img.icons8.com/fluency/48/monitor.png",
    embeds: [embed],
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
        error: `Discord webhook error ${response.status}: ${errorBody}`,
      };
    }

    return { ok: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: `Discord request failed: ${errorMessage}` };
  }
}
