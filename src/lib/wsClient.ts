/**
 * WebSocket Client for 555stream Agent API
 *
 * Features:
 * - Token-authenticated bind
 * - Auto-reconnect with exponential backoff
 * - Message parsing and event dispatch
 * - Ping/pong keepalive
 */

import WebSocket from 'ws';
import type {
  WsClientOptions,
  WsClientMessage,
  WsServerMessage,
  WsEventHandler,
  WsErrorHandler,
  WsStateHandler,
} from '../types/index.js';

export class WsClient {
  private url: string;
  private token: string;
  private ws: WebSocket | null = null;
  private reconnectInterval: number;
  private maxReconnectAttempts: number;
  private pingInterval: number;
  private reconnectAttempts = 0;
  private pingTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private boundSessionId: string | null = null;
  private clientId: string;

  private messageHandlers: Set<WsEventHandler> = new Set();
  private errorHandlers: Set<WsErrorHandler> = new Set();
  private stateHandlers: Set<WsStateHandler> = new Set();

  private state: 'disconnected' | 'connecting' | 'connected' | 'error' = 'disconnected';
  private lastPongTime: number = Date.now();

  constructor(options: WsClientOptions) {
    this.url = options.url;
    this.token = options.token;
    this.reconnectInterval = options.reconnectInterval ?? 5000;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 10;
    this.pingInterval = options.pingInterval ?? 25000;
    this.clientId = `elizaos-${Date.now()}`;
  }

  /**
   * Connect to the WebSocket server
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      this.setState('connecting');

      try {
        this.ws = new WebSocket(this.url);

        this.ws.on('open', () => {
          console.log('[555stream WS] Connected');
          this.reconnectAttempts = 0;
          this.startPing();
          this.setState('connected');
          resolve();
        });

        this.ws.on('message', (data: WebSocket.Data) => {
          try {
            const message = JSON.parse(data.toString()) as WsServerMessage;
            this.handleMessage(message);
          } catch (error) {
            console.error('[555stream WS] Failed to parse message:', error);
          }
        });

        this.ws.on('close', (code, reason) => {
          console.log(`[555stream WS] Disconnected: ${code} ${reason}`);
          this.cleanup();
          this.setState('disconnected');
          this.scheduleReconnect();
        });

        this.ws.on('error', (error) => {
          console.error('[555stream WS] Error:', error);
          this.setState('error');
          this.notifyError(error);
          reject(error);
        });

        this.ws.on('pong', () => {
          // Server responded to ping - update last pong time
          this.lastPongTime = Date.now();
        });

      } catch (error) {
        this.setState('error');
        reject(error);
      }
    });
  }

  /**
   * Bind to a session with authentication
   */
  async bind(sessionId: string): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    return new Promise((resolve, reject) => {
      const bindMessage: WsClientMessage = {
        type: 'bind',
        sessionId,
        token: this.token,
        clientId: this.clientId,
      };

      // Set timeout for bind response
      const timeout = setTimeout(() => {
        this.messageHandlers.delete(bindHandler);
        reject(new Error('Bind timeout'));
      }, 10000);

      // Set up one-time handler for bind response
      // This handler clears the timeout and removes itself to prevent memory leaks
      const bindHandler: WsEventHandler = (message) => {
        if (message.type === 'bound' && message.sessionId === sessionId) {
          clearTimeout(timeout);
          this.messageHandlers.delete(bindHandler);
          this.boundSessionId = sessionId;
          resolve();
        } else if (message.type === 'error') {
          clearTimeout(timeout);
          this.messageHandlers.delete(bindHandler);
          reject(new Error(message.error));
        }
      };

      this.messageHandlers.add(bindHandler);
      this.send(bindMessage);
    });
  }

  /**
   * Send a message to the server
   */
  send(message: WsClientMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    this.ws.send(JSON.stringify(message));
  }

  /**
   * Send a state patch
   */
  async patchState(patch: Record<string, unknown>): Promise<string> {
    if (!this.boundSessionId) {
      throw new Error('Not bound to session');
    }

    const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    this.send({
      type: 'patch_state',
      sessionId: this.boundSessionId,
      requestId,
      patch,
    });

    return requestId;
  }

  /**
   * Register message handler
   */
  onMessage(handler: WsEventHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  /**
   * Register error handler
   */
  onError(handler: WsErrorHandler): () => void {
    this.errorHandlers.add(handler);
    return () => this.errorHandlers.delete(handler);
  }

  /**
   * Register state change handler
   */
  onStateChange(handler: WsStateHandler): () => void {
    this.stateHandlers.add(handler);
    return () => this.stateHandlers.delete(handler);
  }

  /**
   * Get current connection state
   */
  getState(): typeof this.state {
    return this.state;
  }

  /**
   * Get bound session ID
   */
  getBoundSessionId(): string | null {
    return this.boundSessionId;
  }

  /**
   * Check if connected and bound
   */
  isReady(): boolean {
    return this.state === 'connected' && this.boundSessionId !== null;
  }

  /**
   * Disconnect from the server
   */
  disconnect(): void {
    this.cleanup();
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    this.boundSessionId = null;
    // Clear all handlers to prevent memory leaks
    this.messageHandlers.clear();
    this.errorHandlers.clear();
    this.stateHandlers.clear();
    this.setState('disconnected');
  }

  private handleMessage(message: WsServerMessage): void {
    // Notify all handlers
    for (const handler of this.messageHandlers) {
      try {
        handler(message);
      } catch (error) {
        console.error('[555stream WS] Handler error:', error);
      }
    }
  }

  private notifyError(error: Error): void {
    for (const handler of this.errorHandlers) {
      try {
        handler(error);
      } catch (e) {
        console.error('[555stream WS] Error handler error:', e);
      }
    }
  }

  private setState(state: typeof this.state): void {
    if (this.state !== state) {
      this.state = state;
      for (const handler of this.stateHandlers) {
        try {
          handler(state);
        } catch (error) {
          console.error('[555stream WS] State handler error:', error);
        }
      }
    }
  }

  private startPing(): void {
    this.stopPing();
    // Reset pong time when starting ping
    this.lastPongTime = Date.now();

    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        // Check if we've received a pong within 2x ping interval
        const pongTimeout = this.pingInterval * 2;
        if (Date.now() - this.lastPongTime > pongTimeout) {
          console.warn('[555stream WS] No pong received, connection may be dead. Reconnecting...');
          this.ws.close(4000, 'Pong timeout');
          return;
        }
        this.ws.ping();
      }
    }, this.pingInterval);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[555stream WS] Max reconnect attempts reached');
      this.setState('error');
      return;
    }

    const delay = Math.min(
      this.reconnectInterval * Math.pow(2, this.reconnectAttempts),
      60000
    );

    console.log(`[555stream WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectAttempts++;
      try {
        await this.connect();
        // Re-bind to session if we were bound before
        if (this.boundSessionId) {
          await this.bind(this.boundSessionId);
        }
        // Reset counter on successful reconnect
        this.reconnectAttempts = 0;
        console.log('[555stream WS] Reconnected successfully');
      } catch (error) {
        console.error('[555stream WS] Reconnect failed:', error);
      }
    }, delay);
  }

  private cleanup(): void {
    this.stopPing();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
