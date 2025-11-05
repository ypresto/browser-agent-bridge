/**
 * Server-side WebSocket adapter using ws package
 * Works in Node.js environment (API routes)
 */

import type { WebSocket } from 'ws';
import type { MessagingAdapter, ControllerMessage } from '@browser-agent-bridge/controller';

export interface ServerWebSocketAdapterConfig {
  getClient: () => WebSocket | null;
}

interface GlobalWithWebSocket {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  wsPendingRequests?: Map<string, (value: any) => void>;
}

export function createServerWebSocketAdapter(
  config: ServerWebSocketAdapterConfig
): MessagingAdapter {
  const { getClient } = config;

  return {
    async send<T = unknown>(message: ControllerMessage): Promise<T> {
      const client = getClient();
      if (!client || client.readyState !== 1) {
        // readyState 1 = OPEN
        throw new Error('WebSocket not connected');
      }

      // Use global pending requests map so server can resolve them
      const pendingRequests = (global as GlobalWithWebSocket).wsPendingRequests;
      if (!pendingRequests) {
        throw new Error('WebSocket server not initialized');
      }

      return new Promise((resolve, reject) => {
        const requestId = Math.random().toString(36).substring(2);

        pendingRequests.set(requestId, resolve);

        // NEW ARCHITECTURE: Send to web page (not extension)
        // Web page will forward via postMessage to extension
        const payload = { requestId, message };
        console.log('[Adapter] Sending to web page:', payload);
        client.send(JSON.stringify(payload));

        // Timeout after 30 seconds
        setTimeout(() => {
          if (pendingRequests.has(requestId)) {
            pendingRequests.delete(requestId);
            console.log('[Adapter] Request timeout for:', requestId, message.type);
            reject(new Error('Request timeout'));
          }
        }, 30000);
      });
    },

    onMessage(): void {
      // Not needed for server-side adapter
    },

    close(): void {
      // Don't close the shared WebSocket connection
    },
  };
}
