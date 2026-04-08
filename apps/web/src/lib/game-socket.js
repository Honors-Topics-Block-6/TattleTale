/**
 * Lightweight WebSocket client for TattleTale game protocol.
 * Handles connect, reconnect, request-response via seq/ref, and server pushes.
 */

export class GameSocket {
  #ws = null;
  #url = '';
  #seq = 0;
  #state = 'disconnected';
  #pending = new Map();
  #listeners = new Map();
  #stateListeners = new Set();
  #credentials = null;
  #reconnectTimer = null;
  #reconnectDelay = 1000;
  #maxReconnectDelay = 30000;
  #shouldReconnect = false;

  get state() {
    return this.#state;
  }

  connect(url) {
    this.#url = url;
    this.#shouldReconnect = true;
    this.#reconnectDelay = 1000;
    this.#doConnect();
  }

  close() {
    this.#shouldReconnect = false;
    if (this.#reconnectTimer) {
      clearTimeout(this.#reconnectTimer);
      this.#reconnectTimer = null;
    }
    if (this.#ws) {
      this.#ws.close(1000, 'Client closed');
      this.#ws = null;
    }
    this.#rejectAllPending('Connection closed');
    this.#setState('disconnected');
  }

  send(type, payload) {
    return new Promise((resolve, reject) => {
      if (!this.#ws || this.#state !== 'connected') {
        reject(new Error('Not connected'));
        return;
      }
      const s = ++this.#seq;
      const timeout = setTimeout(() => {
        this.#pending.delete(s);
        reject(new Error('Ack timeout'));
      }, 10000);
      this.#pending.set(s, { resolve, reject, timeout });
      this.#ws.send(JSON.stringify({ type, seq: s, payload }));
    });
  }

  on(type, handler) {
    if (!this.#listeners.has(type)) this.#listeners.set(type, new Set());
    this.#listeners.get(type).add(handler);
  }

  off(type, handler) {
    this.#listeners.get(type)?.delete(handler);
  }

  onStateChange(handler) {
    this.#stateListeners.add(handler);
    return () => this.#stateListeners.delete(handler);
  }

  setCredentials(playerId, reconnectToken) {
    this.#credentials = { playerId, reconnectToken };
  }

  clearCredentials() {
    this.#credentials = null;
  }

  // ─── Private ─────────────────────────────────────────

  #doConnect() {
    this.#setState(this.#state === 'disconnected' ? 'connecting' : 'reconnecting');
    const ws = new WebSocket(this.#url);

    ws.onopen = () => {
      this.#ws = ws;
      this.#reconnectDelay = 1000;
      this.#setState('connected');

      // Auto-rejoin if we have credentials
      if (this.#credentials) {
        this.send('rejoinLobby', {
          playerId: this.#credentials.playerId,
          reconnectToken: this.#credentials.reconnectToken,
        })
          .then((resp) => {
            // Update token from rotation
            if (resp?.payload?.data?.reconnectToken) {
              this.#credentials.reconnectToken = resp.payload.data.reconnectToken;
            }
          })
          .catch(() => {
            // Rejoin failed - emit for app layer to handle
            this.#emit('rejoinFailed', {});
          });
      }
    };

    ws.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      // Handle ack/error responses to pending requests
      if (msg.ref != null && this.#pending.has(msg.ref)) {
        const { resolve, reject, timeout } = this.#pending.get(msg.ref);
        clearTimeout(timeout);
        this.#pending.delete(msg.ref);
        if (msg.type === 'error') {
          reject(Object.assign(new Error(msg.payload?.message ?? 'Error'), { code: msg.payload?.code }));
        } else {
          resolve(msg);
        }
        return;
      }

      // Handle server pushes
      this.#emit(msg.type, msg.payload);
    };

    ws.onclose = (event) => {
      this.#ws = null;
      this.#rejectAllPending('Connection lost');

      if (this.#shouldReconnect && event.code !== 4001) {
        // 4001 = kicked, don't reconnect
        this.#scheduleReconnect();
      } else {
        this.#setState('disconnected');
        if (event.code === 4001) {
          this.#emit('kicked', { reason: event.reason });
        }
      }
    };

    ws.onerror = () => {
      // onclose will fire after this
    };
  }

  #scheduleReconnect() {
    const jitter = Math.random() * 0.3 * this.#reconnectDelay;
    const delay = this.#reconnectDelay + jitter;
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = null;
      this.#doConnect();
    }, delay);
    this.#reconnectDelay = Math.min(this.#reconnectDelay * 2, this.#maxReconnectDelay);
  }

  #rejectAllPending(reason) {
    for (const [, { reject, timeout }] of this.#pending) {
      clearTimeout(timeout);
      reject(new Error(reason));
    }
    this.#pending.clear();
  }

  #emit(type, payload) {
    const handlers = this.#listeners.get(type);
    if (handlers) {
      for (const h of handlers) {
        try {
          h(payload);
        } catch {
          /* listener error */
        }
      }
    }
  }

  #setState(s) {
    if (this.#state === s) return;
    this.#state = s;
    for (const h of this.#stateListeners) {
      try {
        h(s);
      } catch {
        /* listener error */
      }
    }
  }
}
