/**
 * PagerDuty Alert Notifier
 *
 * Sends alert notifications via PagerDuty Events API v2.
 * Supports trigger and resolve event actions.
 */

const PAGERDUTY_EVENTS_API = "https://events.pagerduty.com/v2/enqueue";

interface PagerdutyAlert {
  title: string;
  status: "critical" | "warning" | "recovered";
  details: string;
  currentValue: number;
  threshold: number;
  ruleName: string;
  timestamp: Date;
}

function mapSeverity(status: PagerdutyAlert["status"]): string {
  switch (status) {
    case "critical":
      return "critical";
    case "warning":
      return "warning";
    case "recovered":
      return "info";
  }
}

/**
 * Send an alert notification to PagerDuty via Events API v2.
 */
export async function sendPagerdutyAlert(
  routingKey: string,
  alert: PagerdutyAlert,
  config?: { routingKey?: string }
): Promise<{ ok: boolean; error?: string }> {
  const key = config?.routingKey || routingKey || process.env.PAGERDUTY_ROUTING_KEY;
  if (!key) {
    return { ok: false, error: "PagerDuty routing key not configured" };
  }

  const eventAction = alert.status === "recovered" ? "resolve" : "trigger";

  const payload = {
    routing_key: key,
    event_action: eventAction,
    dedup_key: `hiai-observe-${alert.ruleName}`,
    payload: {
      summary: `${alert.title}: ${alert.details}`,
      severity: mapSeverity(alert.status),
      source: "hiai-observe",
      component: "alerting",
      custom_details: {
        currentValue: alert.currentValue,
        threshold: alert.threshold,
        ruleName: alert.ruleName,
        details: alert.details,
      },
    },
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const response = await fetch(PAGERDUTY_EVENTS_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorBody = await response.text();
      return {
        ok: false,
        error: `PagerDuty API error ${response.status}: ${errorBody}`,
      };
    }

    return { ok: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: `PagerDuty request failed: ${errorMessage}` };
  }
}
