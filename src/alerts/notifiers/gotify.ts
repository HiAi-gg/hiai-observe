/**
 * Gotify Alert Notifier
 *
 * Sends alert notifications via Gotify push notification server.
 */

interface GotifyAlert {
  title: string;
  status: "critical" | "warning" | "recovered";
  details: string;
  currentValue: number;
  threshold: number;
  ruleName: string;
  timestamp: Date;
}

function getPriority(status: GotifyAlert["status"]): number {
  switch (status) {
    case "critical":
      return 10;
    case "warning":
      return 5;
    case "recovered":
      return 1;
  }
}

/**
 * Send an alert notification to a Gotify server.
 */
export async function sendGotifyAlert(
  server: string,
  alert: GotifyAlert,
  config?: { server?: string; token?: string }
): Promise<{ ok: boolean; error?: string }> {
  const targetServer = config?.server || server || process.env.GOTIFY_SERVER;
  const token = config?.token || process.env.GOTIFY_TOKEN;
  if (!targetServer) {
    return { ok: false, error: "Gotify server URL not configured" };
  }
  if (!token) {
    return { ok: false, error: "Gotify token not configured" };
  }

  const priority = getPriority(alert.status);
  const url = `${targetServer.replace(/\/$/, "")}/message?priority=${priority}`;

  const timeStr = alert.timestamp.toISOString().replace("T", " ").slice(0, 19);

  const message = [
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
        "Content-Type": "application/json",
        "X-Gotify-Key": token,
      },
      body: JSON.stringify({
        title: alert.title,
        message,
        priority,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorBody = await response.text();
      return {
        ok: false,
        error: `Gotify error ${response.status}: ${errorBody}`,
      };
    }

    return { ok: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: `Gotify request failed: ${errorMessage}` };
  }
}
