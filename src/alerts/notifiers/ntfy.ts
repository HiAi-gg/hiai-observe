/**
 * ntfy.sh Alert Notifier
 *
 * Sends alert notifications via ntfy.sh push notification service.
 */

import { config as appConfig } from "../../lib/config.js";

const NTFY_DEFAULT_SERVER = "https://ntfy.sh";

interface NtfyAlert {
  title: string;
  status: "critical" | "warning" | "recovered";
  details: string;
  currentValue: number;
  threshold: number;
  ruleName: string;
  timestamp: Date;
}

function getPriority(status: NtfyAlert["status"]): string {
  switch (status) {
    case "critical":
      return "urgent";
    case "warning":
      return "high";
    case "recovered":
      return "default";
  }
}

function getTags(status: NtfyAlert["status"]): string[] {
  switch (status) {
    case "critical":
      return ["rotating_light", "red_circle"];
    case "warning":
      return ["warning", "yellow_circle"];
    case "recovered":
      return ["white_check_mark", "green_circle"];
  }
}

/**
 * Send an alert notification to ntfy.sh.
 */
export async function sendNtfyAlert(
  topic: string,
  alert: NtfyAlert,
  config?: { topic?: string; server?: string },
): Promise<{ ok: boolean; error?: string }> {
  const targetTopic = config?.topic || topic;
  if (!targetTopic) {
    return { ok: false, error: "ntfy topic not configured" };
  }

  const server = config?.server || appConfig.NTFY_SERVER || NTFY_DEFAULT_SERVER;
  const url = `${server.replace(/\/$/, "")}/${targetTopic}`;

  const timeStr = alert.timestamp.toISOString().replace("T", " ").slice(0, 19);
  const body = [
    `${alert.title}`,
    "",
    `Status: ${alert.status.toUpperCase()}`,
    `Rule: ${alert.ruleName}`,
    `Current: ${alert.currentValue}`,
    `Threshold: ${alert.threshold}`,
    `Details: ${alert.details}`,
    `Time: ${timeStr} UTC`,
  ].join("\n");

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Title: alert.title,
        Priority: getPriority(alert.status),
        Tags: getTags(alert.status).join(","),
        "Content-Type": "text/plain",
      },
      body,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorBody = await response.text();
      return {
        ok: false,
        error: `ntfy error ${response.status}: ${errorBody}`,
      };
    }

    return { ok: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: `ntfy request failed: ${errorMessage}` };
  }
}
