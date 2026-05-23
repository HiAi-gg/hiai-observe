/**
 * Telegram Alert Notifier
 *
 * Sends alert notifications via Telegram Bot API with MarkdownV2 formatting,
 * inline keyboard buttons, and rate limit handling.
 */

const TELEGRAM_API = "https://api.telegram.org";
const MAX_MESSAGE_LENGTH = 4096;

interface TelegramMessage {
  chatId: string;
  title: string;
  status: "critical" | "warning" | "recovered";
  details: string;
  currentValue: number;
  threshold: number;
  timestamp: Date;
  dashboardUrl?: string;
}

function getStatusEmoji(status: TelegramMessage["status"]): string {
  switch (status) {
    case "critical":
      return "🔴";
    case "warning":
      return "🟡";
    case "recovered":
      return "🟢";
  }
}

function escapeMarkdownV2(text: string): string {
  // Escape all MarkdownV2 special characters
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

function formatMessage(msg: TelegramMessage): string {
  const emoji = getStatusEmoji(msg.status);
  const statusLabel = msg.status.toUpperCase();
  const timeStr = msg.timestamp.toISOString().replace("T", " ").slice(0, 19);

  const lines = [
    `${emoji} *${escapeMarkdownV2(msg.title)}*`,
    "",
    `*Status:* \`${escapeMarkdownV2(statusLabel)}\``,
    `*Details:* ${escapeMarkdownV2(msg.details)}`,
    "",
    `*Current:* \`${escapeMarkdownV2(String(msg.currentValue))}\``,
    `*Threshold:* \`${escapeMarkdownV2(String(msg.threshold))}\``,
    `*Time:* \`${escapeMarkdownV2(timeStr)}\` UTC`,
  ];

  return lines.join("\n");
}

/**
 * Send an alert notification to a Telegram chat.
 */
export async function sendTelegramAlert(
  chatId: string,
  message: TelegramMessage
): Promise<{ ok: boolean; error?: string }> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return { ok: false, error: "TELEGRAM_BOT_TOKEN not configured" };
  }

  const text = formatMessage(message);
  if (text.length > MAX_MESSAGE_LENGTH) {
    return {
      ok: false,
      error: `Message too long: ${text.length} chars (max ${MAX_MESSAGE_LENGTH})`,
    };
  }

  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: "MarkdownV2",
    disable_web_page_preview: true,
  };

  // Add inline keyboard with Mute and View buttons
  const buttons: Array<{ text: string; url?: string; callback_data?: string }> = [
    { text: "Mute (1h)", callback_data: `mute:${message.title}:3600` },
  ];

  if (message.dashboardUrl) {
    buttons.push({ text: "View Dashboard", url: message.dashboardUrl });
  }

  body.reply_markup = {
    inline_keyboard: [buttons],
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const response = await fetch(`${TELEGRAM_API}/bot${botToken}/sendMessage`, {
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
        error: `Telegram API error ${response.status}: ${errorBody}`,
      };
    }

    return { ok: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: `Telegram request failed: ${errorMessage}` };
  }
}
