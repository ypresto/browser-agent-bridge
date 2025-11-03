/**
 * AI SDK chat route with browser automation tools
 */

import { openai } from '@ai-sdk/openai';
import { streamText, convertToModelMessages, stepCountIs } from 'ai';
import { createBrowserTools } from '@browser-automator/ai-sdk';
import { createControllerSDK } from '@browser-automator/controller';
import { createServerWebSocketAdapter } from '../../../lib/server-websocket-adapter';

import type { WebSocket } from 'ws';
import type { ControllerMessage } from '@browser-automator/controller';

interface GlobalWithExtension {
  getExtensionClient?: () => WebSocket | null;
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
        '⚠️ Chrome Extension Not Connected\n\n' +
          'The Chrome extension is installed but not connected via WebSocket.\n\n' +
          'Make sure:\n' +
          '1. The extension is enabled in chrome://extensions/\n' +
          '2. The custom server is running (not next dev)\n' +
          '3. Check server logs for WebSocket connection\n\n' +
          `Attempted action: ${message.type}${'tool' in message && message.tool ? ` (${message.tool})` : ''}`
      );
    },
    onMessage() {},
    close() {},
  };
}

export async function POST(req: Request) {
  const { messages } = await req.json();

  // Create SDK with adapter (WebSocket if connected, otherwise mock)
  const adapter = createAdapter();
  const sdk = createControllerSDK({
    adapter,
    callerOrigin: 'http://localhost:30001', // Example Next.js app origin
  });

  // Connect to extension
  await sdk.connect('demo-token');

  // Create browser automation tools
  const tools = createBrowserTools(sdk);

  // Convert UIMessage format (from useChat) to ModelMessage format if needed
  const modelMessages =
    messages[0]?.parts !== undefined
      ? convertToModelMessages(messages)
      : messages;

  const result = streamText({
    model: openai('gpt-4o'),
    system: 'You are an AI assistant that helps users by performing tasks in a web browser using browser automation tools when needed.',
    messages: modelMessages,
    tools,
    stopWhen: stepCountIs(20),
  });

  return result.toUIMessageStreamResponse();
}
