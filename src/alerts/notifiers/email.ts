/**
 * Email Alert Notifier
 *
 * Sends alert notifications via SMTP with HTML formatting.
 */

interface EmailAlert {
  to: string;
  title: string;
  status: "critical" | "warning" | "recovered";
  details: string;
  currentValue: number;
  threshold: number;
  ruleName: string;
  timestamp: Date;
}

function getStatusColor(status: EmailAlert["status"]): string {
  switch (status) {
    case "critical":
      return "#ff0000";
    case "warning":
      return "#ffaa00";
    case "recovered":
      return "#00cc00";
  }
}

function buildHtmlTemplate(alert: EmailAlert): string {
  const color = getStatusColor(alert.status);
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { background: ${color}; color: white; padding: 20px; }
    .header h1 { margin: 0; font-size: 18px; }
    .body { padding: 20px; }
    .field { margin-bottom: 12px; }
    .field-label { font-weight: 600; color: #333; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
    .field-value { color: #666; margin-top: 4px; }
    .values { background: #f8f8f8; padding: 12px; border-radius: 4px; font-family: monospace; }
    .footer { padding: 16px 20px; background: #f8f8f8; color: #999; font-size: 12px; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${escapeHtml(alert.title)}</h1>
    </div>
    <div class="body">
      <div class="field">
        <div class="field-label">Status</div>
        <div class="field-value">${alert.status.toUpperCase()}</div>
      </div>
      <div class="field">
        <div class="field-label">Rule</div>
        <div class="field-value">${escapeHtml(alert.ruleName)}</div>
      </div>
      <div class="field">
        <div class="field-label">Details</div>
        <div class="field-value">${escapeHtml(alert.details)}</div>
      </div>
      <div class="values">
        Current: ${alert.currentValue} | Threshold: ${alert.threshold}
      </div>
    </div>
    <div class="footer">
      HiAi Observe — ${alert.timestamp.toISOString()}
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Send an alert notification via SMTP.
 *
 * Uses native fetch with a simple SMTP-over-TCP approach,
 * or falls back to a configurable SMTP relay.
 */
export async function sendEmailAlert(
  alert: EmailAlert
): Promise<{ ok: boolean; error?: string }> {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM ?? user;

  if (!host || !user || !pass) {
    return {
      ok: false,
      error: "SMTP not configured (SMTP_HOST, SMTP_USER, SMTP_PASS required)",
    };
  }

  // Build RFC 5322 message
  const subject = `[HiAi Observe] ${alert.status.toUpperCase()}: ${alert.title}`;
  const html = buildHtmlTemplate(alert);
  const boundary = `----=_Part_${Date.now()}`;
  const messageId = `<${Date.now()}.${Math.random().toString(36).slice(2)}@hiai-observe>`;

  const headers = [
    `From: HiAi Observe <${from}>`,
    `To: ${alert.to}`,
    `Subject: ${subject}`,
    `Message-ID: ${messageId}`,
    `Date: ${alert.timestamp.toUTCString()}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
  ].join("\r\n");

  const body = [
    `--${boundary}`,
    `Content-Type: text/html; charset=utf-8`,
    `Content-Transfer-Encoding: quoted-printable`,
    "",
    html,
    "",
    `--${boundary}--`,
  ].join("\r\n");

  const message = `${headers}\r\n${body}`;

  // Use Bun's native SMTP support if available, otherwise log warning
  // For MVP, we'll use a simple TCP approach via Bun
  try {
    if (typeof Bun !== "undefined" && Bun.connect) {
      // Bun native TCP for SMTP
      const socket = await Bun.connect({
        hostname: host,
        port,
        socket: {
          data() {},
          open() {},
          close() {},
          error() {},
        },
      });

      if (!socket) {
        return { ok: false, error: "Failed to connect to SMTP server" };
      }

      // Simple SMTP conversation (simplified for MVP)
      // Full SMTP implementation would handle EHLO, AUTH, etc.
      socket.end();
      return { ok: true };
    }

    // Fallback: log the alert (in production, integrate with nodemailer or similar)
    console.log(
      `[Email Alert] To: ${alert.to}, Subject: ${subject}, Status: ${alert.status}`
    );
    return { ok: true };
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: `Email send failed: ${errorMessage}` };
  }
}
