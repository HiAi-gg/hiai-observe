/**
 * Generic Webhook Alert Notifier
 *
 * POSTs JSON payload to a configurable URL with HMAC-SHA256 signature.
 */

import { createHmac } from "node:crypto";
import { config as appConfig } from "../../lib/config.js";

interface WebhookAlert {
  title: string;
  status: "critical" | "warning" | "recovered";
  details: string;
  currentValue: number;
  threshold: number;
  ruleName: string;
  timestamp: Date;
}

interface WebhookPayload {
  alert: {
    id: string;
    name: string;
    severity: string;
    message: string;
  };
  project: {
    id: string;
    name: string;
  };
  timestamp: string;
}

/**
 * Send an alert notification via generic webhook.
 */
export async function sendWebhookAlert(
  url: string,
  alert: WebhookAlert & {
    alertId?: string;
    projectId?: string;
    projectName?: string;
  },
  config?: { url?: string; secret?: string },
): Promise<{ ok: boolean; error?: string }> {
  const targetUrl = config?.url || url;
  if (!targetUrl) {
    return { ok: false, error: "Webhook URL not configured" };
  }

  const payload: WebhookPayload = {
    alert: {
      id: alert.alertId ?? "unknown",
      name: alert.ruleName,
      severity: alert.status,
      message: alert.details,
    },
    project: {
      id: alert.projectId ?? "unknown",
      name: alert.projectName ?? "Unknown Project",
    },
    timestamp: alert.timestamp.toISOString(),
  };

  const body = JSON.stringify(payload);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // HMAC-SHA256 signature if secret is configured
  const secret = config?.secret || appConfig.WEBHOOK_SECRET;
  if (secret) {
    const signature = createHmac("sha256", secret).update(body).digest("hex");
    headers["X-Hiai-Signature"] = signature;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const response = await fetch(targetUrl, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorBody = await response.text();
      return {
        ok: false,
        error: `Webhook error ${response.status}: ${errorBody}`,
      };
    }

    return { ok: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: `Webhook request failed: ${errorMessage}` };
  }
}
