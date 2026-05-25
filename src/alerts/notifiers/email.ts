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
  alert: EmailAlert,
  config?: Record<string, string>
): Promise<{ ok: boolean; error?: string }> {
  const host = config?.host || process.env.SMTP_HOST;
  const port = Number(config?.port || process.env.SMTP_PORT || 587);
  const user = config?.user || process.env.SMTP_USER;
  const pass = config?.pass || process.env.SMTP_PASS;
  const from = config?.from || process.env.SMTP_FROM || user;

  if (!host || !user || !pass) {
    console.warn("[email-notifier] SMTP not configured — skipping email alert");
    return {
      ok: false,
      error: "SMTP not configured",
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

  // Real SMTP conversation over Bun native TCP
  try {
    // Response queue for async SMTP reads
    const responseQueue: string[] = [];
    const waiters: Array<{ resolve: (v: string) => void; reject: (e: Error) => void }> = [];

    function pushResponse(data: string) {
      const waiter = waiters.shift();
      if (waiter) {
        waiter.resolve(data);
      } else {
        responseQueue.push(data);
      }
    }

    function smtpRead(): Promise<string> {
      const queued = responseQueue.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          const idx = waiters.findIndex((w) => w.resolve === resolve);
          if (idx !== -1) waiters.splice(idx, 1);
          reject(new Error("SMTP read timeout"));
        }, 10_000);
        waiters.push({
          resolve: (v: string) => { clearTimeout(timeout); resolve(v); },
          reject: (e: Error) => { clearTimeout(timeout); reject(e); },
        });
      });
    }

    const socket = await Bun.connect({
      hostname: host,
      port,
      socket: {
        data(_socket, data) {
          pushResponse(data.toString());
        },
        open() {},
        close() {},
        error(_socket, err) {
          const waiter = waiters.shift();
          if (waiter) waiter.reject(err instanceof Error ? err : new Error(String(err)));
        },
      },
    });

    if (!socket) {
      return { ok: false, error: "Failed to connect to SMTP server" };
    }

    async function smtpSend(line: string): Promise<string> {
      socket.write(line + "\r\n");
      return await smtpRead();
    }

    // Read the initial 220 greeting
    const greeting = await smtpRead();
    if (!greeting.startsWith("220")) {
      socket.end();
      return { ok: false, error: `SMTP greeting failed: ${greeting.trim()}` };
    }

    // EHLO
    const ehloResp = await smtpSend(`EHLO ${host}`);
    if (!ehloResp.includes("250")) {
      const heloResp = await smtpSend(`HELO ${host}`);
      if (!heloResp.includes("250")) {
        socket.end();
        return { ok: false, error: `SMTP HELO failed: ${heloResp.trim()}` };
      }
    }

    // AUTH LOGIN
    const authResp = await smtpSend("AUTH LOGIN");
    if (!authResp.startsWith("334")) {
      socket.end();
      return { ok: false, error: `SMTP AUTH LOGIN rejected: ${authResp.trim()}` };
    }

    // Send username (base64)
    const userResp = await smtpSend(Buffer.from(user!).toString("base64"));
    if (!userResp.startsWith("334")) {
      socket.end();
      return { ok: false, error: `SMTP username rejected: ${userResp.trim()}` };
    }

    // Send password (base64)
    const passResp = await smtpSend(Buffer.from(pass!).toString("base64"));
    if (!passResp.startsWith("235")) {
      socket.end();
      return { ok: false, error: `SMTP auth failed: ${passResp.trim()}` };
    }

    // MAIL FROM
    const fromResp = await smtpSend(`MAIL FROM:<${from}>`);
    if (!fromResp.includes("250")) {
      socket.end();
      return { ok: false, error: `SMTP MAIL FROM rejected: ${fromResp.trim()}` };
    }

    // RCPT TO
    const rcptResp = await smtpSend(`RCPT TO:<${alert.to}>`);
    if (!rcptResp.includes("250")) {
      socket.end();
      return { ok: false, error: `SMTP RCPT TO rejected: ${rcptResp.trim()}` };
    }

    // DATA
    const dataResp = await smtpSend("DATA");
    if (!dataResp.startsWith("354")) {
      socket.end();
      return { ok: false, error: `SMTP DATA rejected: ${dataResp.trim()}` };
    }

    // Send message body (end with lone dot)
    socket.write(message + "\r\n.\r\n");
    const bodyResp = await smtpRead();
    if (!bodyResp.includes("250")) {
      socket.end();
      return { ok: false, error: `SMTP message rejected: ${bodyResp.trim()}` };
    }

    // QUIT
    await smtpSend("QUIT");
    socket.end();
    return { ok: true };
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: `Email send failed: ${errorMessage}` };
  }
}
