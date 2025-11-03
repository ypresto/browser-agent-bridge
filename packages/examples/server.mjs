/**
 * Custom Next.js server with WebSocket support
 */

import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { WebSocketServer } from 'ws';

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '30001', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

await app.prepare();

const server = createServer(async (req, res) => {
  try {
    const parsedUrl = parse(req.url, true);
    await handle(req, res, parsedUrl);
  } catch (err) {
    console.error('Error occurred handling', req.url, err);
    res.statusCode = 500;
    res.end('internal server error');
  }
});

// WebSocket server for web page communication
// NEW ARCHITECTURE: Web pages connect here, not extensions
// Flow: API Route -> WebSocket -> Web Page -> postMessage -> Extension
const wss = new WebSocketServer({ server, path: '/ws' });
const clients = new Map();
const pendingRequests = new Map(); // Track pending requests from API routes

// Global registry for API routes to access WebSocket clients
global.wsClients = clients;
global.getExtensionClient = () => {
  // Return first connected web page client (acts as bridge to extension)
  return clients.size > 0 ? Array.from(clients.values())[0] : null;
};
global.wsPendingRequests = pendingRequests;

wss.on('connection', (ws) => {
  const clientId = Math.random().toString(36).substring(2);
  clients.set(clientId, ws);
  console.log(`[WebSocket] Web page ${clientId} connected (${clients.size} total)`);

  ws.on('message', (data) => {
    try {
      const response = JSON.parse(data.toString());

      // Handle keepalive ping
      if (response.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
        return;
      }

      console.log('[WebSocket] Received from web page:', response);

      // Check if this is a response to a pending request
      // Web page forwards extension responses with requestId and payload
      if (response.requestId && pendingRequests.has(response.requestId)) {
        const resolver = pendingRequests.get(response.requestId);
        pendingRequests.delete(response.requestId);
        resolver(response.payload);
      }
    } catch (error) {
      console.error('[WebSocket] Message error:', error);
    }
  });

  ws.on('close', () => {
    clients.delete(clientId);
    console.log(`[WebSocket] Web page ${clientId} disconnected (${clients.size} remaining)`);
  });

  ws.on('error', (error) => {
    console.error(`[WebSocket] Client ${clientId} error:`, error);
  });
});

server.listen(port, () => {
  console.log(`> Ready on http://${hostname}:${port}`);
  console.log(`> WebSocket server ready on ws://${hostname}:${port}/ws`);
});
