type MessageCallback = (data: unknown) => void;

interface WsState {
  ws: WebSocket | null;
  connected: boolean;
  subscribers: Map<string, Set<MessageCallback>>;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  reconnectDelay: number;
  pingTimer: ReturnType<typeof setInterval> | null;
  pendingPaths: Set<string>;
}

const MAX_RECONNECT_DELAY = 30_000;
const PING_INTERVAL = 30_000;

function createWsManager() {
  const state: WsState = {
    ws: null,
    connected: false,
    subscribers: new Map(),
    reconnectTimer: null,
    reconnectDelay: 1000,
    pingTimer: null,
    pendingPaths: new Set(),
  };

  function getUrl(path: string): string {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const base = path.startsWith("/") ? `${proto}//${window.location.host}` : "";
    return `${base}${path}`;
  }

  function connect(path: string, containerId?: string) {
    state.pendingPaths.add(path);
    if (containerId) {
      state.pendingPaths.add(`${path}:${containerId}`);
    }

    if (state.ws?.readyState === WebSocket.OPEN) {
      sendSubscribe(path);
      return;
    }

    if (state.ws) {
      state.ws.close();
      state.ws = null;
    }

    const url = getUrl(path);
    const ws = new WebSocket(url);
    state.ws = ws;

    ws.onopen = () => {
      state.connected = true;
      state.reconnectDelay = 1000;

      for (const p of state.pendingPaths) {
        const [pathPart, containerId] = p.split(":");
        sendSubscribe(pathPart ?? p, containerId);
      }

      state.pingTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping" }));
        }
      }, PING_INTERVAL);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as { type?: string; channel?: string; data?: unknown };
        if (msg.type === "pong") return;

        const channel = msg.channel ?? "default";
        const subs = state.subscribers.get(channel);
        if (subs) {
          for (const cb of subs) {
            cb(msg.data ?? msg);
          }
        }

        const allSubs = state.subscribers.get("*");
        if (allSubs) {
          for (const cb of allSubs) {
            cb(msg.data ?? msg);
          }
        }
      } catch {
        // non-JSON messages ignored
      }
    };

    ws.onclose = () => {
      state.connected = false;
      if (state.pingTimer) {
        clearInterval(state.pingTimer);
        state.pingTimer = null;
      }
      scheduleReconnect();
    };

    ws.onerror = () => {
      ws.close();
    };
  }

  function sendSubscribe(_path: string, containerId?: string) {
    if (state.ws?.readyState === WebSocket.OPEN) {
      if (containerId) {
        state.ws.send(JSON.stringify({ action: "subscribe", containerId }));
      } else {
        state.ws.send(JSON.stringify({ action: "subscribe_all" }));
      }
    }
  }

  function scheduleReconnect() {
    if (state.reconnectTimer) return;
    state.reconnectTimer = setTimeout(() => {
      state.reconnectTimer = null;
      if (state.pendingPaths.size > 0) {
        const firstPath = state.pendingPaths.values().next().value!;
        connect(firstPath);
      }
      state.reconnectDelay = Math.min(state.reconnectDelay * 2, MAX_RECONNECT_DELAY);
    }, state.reconnectDelay);
  }

  function subscribe(channel: string, callback: MessageCallback) {
    if (!state.subscribers.has(channel)) {
      state.subscribers.set(channel, new Set());
    }
    state.subscribers.get(channel)!.add(callback);

    return () => unsubscribe(channel, callback);
  }

  function unsubscribe(channel: string, callback: MessageCallback) {
    state.subscribers.get(channel)?.delete(callback);
    if (state.subscribers.get(channel)?.size === 0) {
      state.subscribers.delete(channel);
    }
  }

  function disconnect(path?: string) {
    if (path) {
      state.pendingPaths.delete(path);
      if (state.ws?.readyState === WebSocket.OPEN) {
        state.ws.send(JSON.stringify({ action: "unsubscribe", path }));
      }
    } else {
      state.pendingPaths.clear();
      state.subscribers.clear();
      if (state.pingTimer) {
        clearInterval(state.pingTimer);
        state.pingTimer = null;
      }
      if (state.reconnectTimer) {
        clearTimeout(state.reconnectTimer);
        state.reconnectTimer = null;
      }
      state.ws?.close();
      state.ws = null;
      state.connected = false;
    }
  }

  return {
    connect,
    subscribe,
    unsubscribe,
    disconnect,
    get connected() { return state.connected; },
  };
}

export const wsManager = createWsManager();
