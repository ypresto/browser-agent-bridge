/**
 * AI SDK chat route with browser automation tools
 */

import { openai } from '@ai-sdk/openai';
import { streamText, convertToModelMessages, stepCountIs } from 'ai';
import { createBrowserTools } from '@browser-automator/ai-sdk';
import { createControllerSDK } from '@browser-automator/controller';
import { createServerWebSocketAdapter } from '../../../lib/server-websocket-adapter';

import type { WebSocket } from 'ws';
import type { ControllerMessage, ControllerSDK } from '@browser-automator/controller';

interface GlobalWithExtension {
  getExtensionClient?: () => WebSocket | null;
}

// SDK session management - persist SDK across requests to maintain tab context
const sdkSessions = new Map<string, {
  sdk: ControllerSDK;
  lastActivity: number;
}>();

// Cleanup stale sessions (older than 30 minutes)
function cleanupStaleSessions() {
  const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;
  for (const [key, value] of sdkSessions.entries()) {
    if (value.lastActivity < thirtyMinutesAgo) {
      value.sdk.disconnect().catch(() => {});
      sdkSessions.delete(key);
      console.log('[SDK Sessions] Cleaned up stale session:', key);
    }
  }
}

// Create adapter - uses real WebSocket if extension connected, falls back to mock
function createAdapter() {
  // Check if extension is connected via WebSocket
  const getClient = (global as GlobalWithExtension).getExtensionClient;
  if (getClient && typeof getClient === 'function') {
    const client = getClient();
    if (client) {
      console.log('Using WebSocket adapter (extension connected)');
      return createServerWebSocketAdapter({ getClient });
    }
  }

  // Fallback to mock adapter
  console.log('Using mock adapter (extension not connected)');
  return {
    async send<T = unknown>(message: ControllerMessage): Promise<T> {
      console.log('Mock adapter send:', message);

      // Allow connect to succeed so AI can respond
      if (message.type === 'connect') {
        return { sessionId: 'mock-session', createdAt: Date.now() } as T;
      }

      // For all other operations, throw clear error
      throw new Error(
        '⚠️ Browser Automation Not Available\n\n' +
          'The browser automation system is not connected.\n\n' +
          'Make sure:\n' +
          '1. The Chrome extension is enabled in chrome://extensions/\n' +
          '2. The custom server is running (node server.mjs, not next dev)\n' +
          '3. The example page is open and connected to WebSocket\n' +
          '4. Check browser console and server logs for connection status\n\n' +
          `Attempted action: ${message.type}${'tool' in message && message.tool ? ` (${message.tool})` : ''}`
      );
    },
    onMessage() {},
    close() {},
  };
}

export async function POST(req: Request) {
  const { messages } = await req.json();

  // Extract conversation ID (use first message ID for stable key)
  // In production, use actual user ID or conversation ID from your auth system
  const conversationId = messages[0]?.id || 'default-conversation';

  // Get or create SDK for this conversation
  let sdkSession = sdkSessions.get(conversationId);

  if (!sdkSession) {
    console.log('[SDK Sessions] Creating new SDK session for:', conversationId);

    // Create SDK with adapter (WebSocket if connected, otherwise mock)
    const adapter = createAdapter();
    const sdk = createControllerSDK({
      adapter,
      callerOrigin: 'http://localhost:30001', // Example Next.js app origin
    });

    // Connect to extension
    await sdk.connect('demo-token');

    sdkSession = {
      sdk,
      lastActivity: Date.now(),
    };
    sdkSessions.set(conversationId, sdkSession);

    console.log('[SDK Sessions] SDK session created, total sessions:', sdkSessions.size);
  } else {
    console.log('[SDK Sessions] Reusing existing SDK session for:', conversationId);
  }

  // Update last activity
  sdkSession.lastActivity = Date.now();

  // Use the persistent SDK (maintains currentTabId across requests)
  const sdk = sdkSession.sdk;

  // Clean up old sessions periodically (10% chance per request)
  if (Math.random() < 0.1) {
    cleanupStaleSessions();
  }

  // Create browser automation tools
  const tools = createBrowserTools(sdk);

  // Convert UIMessage format (from useChat) to ModelMessage format if needed
  const modelMessages =
    messages[0]?.parts !== undefined
      ? convertToModelMessages(messages)
      : messages;

  const result = streamText({
    model: openai('gpt-5-mini'),
    system: 'You are web browser automation agent who can also chat with user. NEVER and NEVER ask for permission, confirmation, and login credentials with chat. If got login page, ask user to login manually. Retry when snapshot tool returns unexpected results.',
    messages: modelMessages,
    tools,
    stopWhen: stepCountIs(40),
  });

  return result.toUIMessageStreamResponse();
}
