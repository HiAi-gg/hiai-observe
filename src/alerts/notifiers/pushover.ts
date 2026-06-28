/**
 * Pushover Alert Notifier
 *
 * Sends alert notifications via Pushover push notification API.
 */

import { config as appConfig } from "../../lib/config.js";

const PUSHOVER_API = "https://api.pushover.net/1/messages.json";

interface PushoverAlert {
  title: string;
  status: "critical" | "warning" | "recovered";
  details: string;
  currentValue: number;
  threshold: number;
  ruleName: string;
  timestamp: Date;
}

function getPriority(status: PushoverAlert["status"]): number {
  switch (status) {
    case "critical":
      return 1; // high priority
    case "warning":
      return 0; // normal priority
    case "recovered":
      return -1; // low priority
  }
}

/**
 * Send an alert notification via Pushover.
 */
export async function sendPushoverAlert(
  userKey: string,
  alert: PushoverAlert,
  config?: { userKey?: string; token?: string; priority?: number },
): Promise<{ ok: boolean; error?: string }> {
  const targetUserKey = config?.userKey || userKey || appConfig.PUSHOVER_USER_KEY;
  const appToken = config?.token || appConfig.PUSHOVER_TOKEN;
  if (!targetUserKey) {
    return { ok: false, error: "Pushover user key not configured" };
  }
  if (!appToken) {
    return { ok: false, error: "Pushover app token not configured" };
  }

  const priority = config?.priority ?? getPriority(alert.status);
  const timeStr = alert.timestamp.toISOString().replace("T", " ").slice(0, 19);

  const message = [
    `Status: ${alert.status.toUpperCase()}`,
    `Rule: ${alert.ruleName}`,
    `Current: ${alert.currentValue} | Threshold: ${alert.threshold}`,
    `Details: ${alert.details}`,
    `Time: ${timeStr} UTC`,
  ].join("\n");

  const body: Record<string, string> = {
    token: appToken,
    user: targetUserKey,
    title: alert.title,
    message,
    priority: String(priority),
  };

  // High/urgent priority requires retry and expire parameters
  if (priority >= 1) {
    body.retry = "60"; // retry every 60 seconds
    body.expire = "3600"; // stop retrying after 1 hour
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const response = await fetch(PUSHOVER_API, {
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
        error: `Pushover error ${response.status}: ${errorBody}`,
      };
    }

    return { ok: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: `Pushover request failed: ${errorMessage}` };
  }
}
