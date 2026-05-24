import { Elysia, t } from "elysia";
import { subscribeLogs, subscribeAllLogs, getRecentLogs } from "../store/log-pubsub.js";
import { randomUUID } from "crypto";
import type { LogEntry } from "../monitoring/log-streamer.js";

interface WsClient {
  ws: { send: (data: string) => void };
  unsubscribes: Array<() => void>;
}

const clients = new Map<string, WsClient>();
const MAX_WS_CLIENTS = 100;

export const logsWsPlugin = new Elysia()
  .ws("/ws/logs", {
    body: t.Object({
      action: t.Union([t.Literal("subscribe"), t.Literal("unsubscribe"), t.Literal("subscribe_all")]),
      containerId: t.Optional(t.String()),
    }),
    open(ws) {
      if (clients.size >= MAX_WS_CLIENTS) {
        ws.close(1013, "Too many WebSocket connections");
        return;
      }
      const id = randomUUID();
      clients.set(id, { ws: { send: (d) => ws.send(d) }, unsubscribes: [] });
      (ws as unknown as { _clientId: string })._clientId = id;

      // Send ping every 30s
      const pingInterval = setInterval(() => {
        try {
          ws.send(JSON.stringify({ type: "ping" }));
        } catch {
          clearInterval(pingInterval);
        }
      }, 30_000);

      ws.subscribe("ws-logs");
    },
    async message(ws, body) {
      const clientId = (ws as unknown as { _clientId: string })._clientId;
      if (!clientId) return;

      const client = clients.get(clientId);
      if (!client) return;

      if (body.action === "subscribe" && body.containerId) {
        const unsub = await subscribeLogs(body.containerId, (entry: LogEntry) => {
          try {
            ws.send(JSON.stringify({ type: "log", data: entry }));
          } catch {
            // client disconnected
          }
        });
        client.unsubscribes.push(unsub);

        const recent = await getRecentLogs(body.containerId, 100);
        ws.send(JSON.stringify({ type: "recent", data: recent }));
      } else if (body.action === "subscribe_all") {
        const unsub = await subscribeAllLogs((entry: LogEntry) => {
          try {
            ws.send(JSON.stringify({ type: "log", data: entry }));
          } catch {
            // client disconnected
          }
        });
        client.unsubscribes.push(unsub);
      } else if (body.action === "unsubscribe") {
        for (const unsub of client.unsubscribes) unsub();
        client.unsubscribes = [];
      }
    },
    close(ws) {
      const clientId = (ws as unknown as { _clientId: string })._clientId;
      if (clientId) {
        const client = clients.get(clientId);
        if (client) {
          for (const unsub of client.unsubscribes) unsub();
        }
        clients.delete(clientId);
      }
    },
  });
