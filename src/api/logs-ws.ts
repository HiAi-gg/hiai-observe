import { randomUUID } from "node:crypto";
import { Elysia, t } from "elysia";
import { lookupProject } from "../lib/auth.js";
import { logger } from "../lib/logger.js";
import type { LogEntry } from "../monitoring/log-streamer.js";
import { getRecentLogs, subscribeAllLogs, subscribeLogs } from "../store/log-pubsub.js";

interface WsClient {
  ws: { send: (data: string) => void };
  projectId: string;
  unsubscribes: Array<() => void>;
}

const clients = new Map<string, WsClient>();
const wsToClientId = new WeakMap<object, string>();
const pingIntervals = new Map<string, ReturnType<typeof setInterval>>();
const MAX_WS_CLIENTS = 100;

/**
 * Authenticate a WebSocket connection by API key.
 * Returns projectId on success, null on failure.
 */
async function authenticateWs(apiKey: string | undefined): Promise<string | null> {
  if (!apiKey) return null;
  const project = await lookupProject(apiKey);
  return project?.projectId ?? null;
}

/** Start a keepalive ping interval for a client. */
function startPing(id: string, sendFn: (data: string) => void): void {
  const interval = setInterval(() => {
    try {
      sendFn(JSON.stringify({ type: "ping" }));
    } catch {
      clearInterval(interval);
      pingIntervals.delete(id);
    }
  }, 30_000);
  pingIntervals.set(id, interval);
}

/** Stop and remove the ping interval for a client. */
function stopPing(id: string): void {
  const interval = pingIntervals.get(id);
  if (interval) {
    clearInterval(interval);
    pingIntervals.delete(id);
  }
}

export const logsWsPlugin = new Elysia().ws("/ws/logs", {
  body: t.Object({
    action: t.Union([
      t.Literal("subscribe"),
      t.Literal("unsubscribe"),
      t.Literal("subscribe_all"),
      t.Literal("auth"),
    ]),
    containerId: t.Optional(t.String()),
    key: t.Optional(t.String()),
  }),
  async open(ws) {
    if (clients.size >= MAX_WS_CLIENTS) {
      ws.close(1013, "Too many WebSocket connections");
      return;
    }

    // SECURITY: API key MUST be sent via the { action: "auth", key: "..." }
    // message after connect. We do NOT accept ?key=... in the query string
    // because it would be persisted in server logs, browser history, and
    // forwarded by intermediary proxies / load balancers.
    const id = randomUUID();
    const sendFn = (data: string) => ws.send(data);

    // Always defer auth to the first message
    clients.set(id, { ws: { send: sendFn }, projectId: "", unsubscribes: [] });
    wsToClientId.set(ws, id);
    startPing(id, sendFn);
    ws.send(
      JSON.stringify({
        type: "auth_required",
        message: 'Send { "action": "auth", "key": "<apikey>" } as the first message.',
      }),
    );
  },

  async message(ws, body) {
    const clientId = wsToClientId.get(ws);
    if (!clientId) return;
    const client = clients.get(clientId);
    if (!client) return;

    // Handle first-message auth (required — query string auth is no longer accepted)
    if (!client.projectId) {
      if (body.action === "auth" && body.key) {
        const projectId = await authenticateWs(body.key);
        if (!projectId) {
          ws.send(JSON.stringify({ type: "error", error: "Invalid API key" }));
          ws.close(4001, "Unauthorized");
          return;
        }
        client.projectId = projectId;
        ws.send(JSON.stringify({ type: "authenticated", projectId }));

        // Clear the deferred ping and start normal one
        stopPing(clientId);
        startPing(clientId, (d) => ws.send(d));
        return;
      }

      // Not authenticated and not an auth message
      ws.send(
        JSON.stringify({
          type: "error",
          error:
            'Authentication required. Send { "action": "auth", "key": "<apikey>" } as first message.',
        }),
      );
      ws.close(4001, "Unauthorized");
      return;
    }

    if (body.action === "subscribe" && body.containerId) {
      try {
        const unsub = await subscribeLogs(body.containerId, (entry: LogEntry) => {
          try {
            ws.send(JSON.stringify({ type: "log", data: entry }));
          } catch {
            /* client disconnected */
          }
        });
        client.unsubscribes.push(unsub);

        const recent = await getRecentLogs(body.containerId, 100);
        ws.send(JSON.stringify({ type: "recent", data: recent }));
      } catch (subErr) {
        ws.send(
          JSON.stringify({
            type: "error",
            error: `Failed to subscribe to container ${body.containerId}`,
          }),
        );
        logger.error("Failed to subscribe to container logs", {
          containerId: body.containerId,
          error: String(subErr),
        });
      }
    } else if (body.action === "subscribe_all") {
      try {
        const unsub = await subscribeAllLogs((entry: LogEntry) => {
          try {
            ws.send(JSON.stringify({ type: "log", data: entry }));
          } catch {
            /* client disconnected */
          }
        });
        client.unsubscribes.push(unsub);
      } catch (subErr) {
        ws.send(JSON.stringify({ type: "error", error: "Failed to subscribe to logs" }));
        logger.error("Failed to subscribe_all from message handler", { error: String(subErr) });
      }
    } else if (body.action === "unsubscribe") {
      for (const unsub of client.unsubscribes) unsub();
      client.unsubscribes = [];
    }
  },

  close(ws) {
    const clientId = wsToClientId.get(ws);
    if (!clientId) return;
    const client = clients.get(clientId);
    if (client) {
      for (const unsub of client.unsubscribes) unsub();
    }
    stopPing(clientId);
    clients.delete(clientId);
  },
});
