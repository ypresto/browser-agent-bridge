'use client';

import { useChat } from '@ai-sdk/react';
import { useState, useEffect, useRef } from 'react';

const BROWSER_AUTOMATOR_UUID = 'ba-4a8f9c2d-e1b6-4d3a-9f7e-2c8b1a5d6e3f';

export default function ChatPage() {
  const [input, setInput] = useState('');
  const [extensionStatus, setExtensionStatus] = useState<'checking' | 'active' | 'inactive'>('checking');
  const sessionTokenRef = useRef<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { messages, status, sendMessage } = useChat();

  // Auto-resize textarea based on content
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [input]);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    let responded = false;
    let ws: WebSocket | null = null;

    // Wake up extension on page load
    const wakeUpExtension = () => {
      // Send wake-up message to content script
      window.postMessage({
        type: 'browser-automator-wake-up',
        uuid: BROWSER_AUTOMATOR_UUID,
      }, '*');

      // Listen for response
      const handleResponse = (event: MessageEvent) => {
        if (event.data?.type === 'browser-automator-wake-up-response') {
          responded = true;
          clearTimeout(timeoutId);
          setExtensionStatus(event.data.success ? 'active' : 'inactive');
          window.removeEventListener('message', handleResponse);
        }
      };
      window.addEventListener('message', handleResponse);

      // Timeout after 2 seconds - only set inactive if no response
      timeoutId = setTimeout(() => {
        if (!responded) {
          setExtensionStatus('inactive');
        }
        window.removeEventListener('message', handleResponse);
      }, 2000);
    };

    // Small delay to ensure content script is loaded
    const initialDelay = setTimeout(wakeUpExtension, 100);

    // NEW ARCHITECTURE: Connect to WebSocket server
    // This page now acts as a bridge between WebSocket server and extension
    const connectWebSocket = () => {
      ws = new WebSocket('ws://localhost:30001/ws');

      ws.onopen = () => {
        console.log('[Web Page] Connected to WebSocket server');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[Web Page] Received from server:', data);

          // Handle ping/pong
          if (data.type === 'ping') {
            ws?.send(JSON.stringify({ type: 'pong' }));
            return;
          }

          // Forward command to extension via postMessage
          if (data.requestId && data.message) {
            const message = {
              type: 'browser-automator-command',
              uuid: BROWSER_AUTOMATOR_UUID,
              nonce: crypto.randomUUID(),
              requestId: data.requestId,
              command: data.message,
              // Only include sessionToken if we have one (not for initial connect)
              ...(sessionTokenRef.current && { sessionToken: sessionTokenRef.current }),
            };

            window.postMessage(message, window.origin);
          }
        } catch (error) {
          console.error('[Web Page] Failed to parse WebSocket message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('[Web Page] WebSocket error:', error);
      };

      ws.onclose = () => {
        console.log('[Web Page] WebSocket closed');
      };
    };

    // Listen for responses from extension
    const handleExtensionResponse = (event: MessageEvent) => {
      if (event.data?.type === 'browser-automator-response' && event.data.requestId) {
        console.log('[Web Page] Received response from extension:', event.data);

        // Store session token if this is a createSession response
        if (event.data.sessionToken && !sessionTokenRef.current) {
          console.log('[Web Page] Storing session token:', event.data.sessionToken.substring(0, 8) + '...');
          sessionTokenRef.current = event.data.sessionToken;
        }

        // Forward response back to server via WebSocket
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            requestId: event.data.requestId,
            payload: event.data.payload || event.data, // Extract nested payload if it exists
          }));
        }
      }
    };

    window.addEventListener('message', handleExtensionResponse);

    // Connect WebSocket after small delay
    const wsDelay = setTimeout(connectWebSocket, 200);

    // Cleanup on unmount
    return () => {
      clearTimeout(initialDelay);
      clearTimeout(timeoutId);
      clearTimeout(wsDelay);
      window.removeEventListener('message', handleExtensionResponse);
      if (ws) {
        ws.close();
      }
    };
  }, []);

  return (
    <div className="flex flex-col h-screen max-w-4xl mx-auto p-4">
      <header className="mb-4">
        <h1 className="text-2xl font-bold">Browser Automator Chat</h1>
        <p className="text-gray-600">
          Chat with AI to automate your browser. Try: &quot;Navigate to example.com and get the page snapshot&quot;
        </p>
        {extensionStatus === 'checking' && (
          <p className="text-xs text-gray-500 mt-1">🔄 Connecting to extension...</p>
        )}
        {extensionStatus === 'active' && (
          <p className="text-xs text-green-600 mt-1">✓ Extension connected</p>
        )}
        {extensionStatus === 'inactive' && (
          <p className="text-xs text-red-600 mt-1">✗ Extension not responding (reload extension at chrome://extensions/)</p>
        )}
      </header>

      <div className="flex-1 overflow-y-auto mb-4 border rounded-lg p-4 bg-gray-50">
        {messages.length === 0 && (
          <div className="text-gray-400 text-center mt-8">
            Start a conversation to begin browser automation...
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`mb-4 ${
              message.role === 'user' ? 'text-right' : 'text-left'
            }`}
          >
            <div
              className={`inline-block p-3 rounded-lg max-w-[80%] ${
                message.role === 'user'
                  ? 'bg-blue-500 text-white'
                  : 'bg-white border'
              }`}
            >
              <div className="font-semibold text-sm mb-1">
                {message.role === 'user' ? 'You' : 'AI'}
              </div>
              <div className="whitespace-pre-wrap">
                {message.parts.map((part, partIdx) => {
                  if (part.type === 'text') {
                    return <span key={partIdx}>{part.text}</span>;
                  }

                  // Check for tool errors (state: 'output-error')
                  if ('state' in part && part.state === 'output-error') {
                    return (
                      <div key={partIdx} className="mt-2 p-3 bg-red-50 border border-red-200 rounded text-red-800 text-sm">
                        <div className="font-semibold mb-1">❌ Tool Error</div>
                        <div className="whitespace-pre-wrap">{part.errorText}</div>
                      </div>
                    );
                  }

                  if (part.type.startsWith('tool-')) {
                    // Debug: Log the part structure
                    console.log('[Chat UI] Tool part:', part.type, part);

                    // Extract data from tool output (not result)
                    const toolOutput = 'output' in part ? part.output : null;
                    let debugInfo: { element?: string; ref?: string; url?: string; action?: string } | null = null;
                    let snapshotData: string | null = null;

                    console.log('[Chat UI] Tool output:', toolOutput);

                    if (toolOutput && typeof toolOutput === 'object') {
                      if ('debug' in toolOutput) {
                        debugInfo = toolOutput.debug as { element?: string; ref?: string; url?: string; action?: string };
                        console.log('[Chat UI] Debug info extracted:', debugInfo);
                      }
                      if ('snapshot' in toolOutput && typeof toolOutput.snapshot === 'string') {
                        snapshotData = toolOutput.snapshot;
                        console.log('[Chat UI] Snapshot data size:', snapshotData.length);
                      }
                    }

                    return (
                      <div key={partIdx} className="mt-2">
                        <div className="font-mono text-xs text-blue-600">
                          🔧 Tool: {part.type}
                        </div>
                        {(debugInfo || snapshotData) && (
                          <div className="mt-1 p-2 bg-gray-100 rounded text-xs font-mono text-gray-700">
                            {debugInfo?.element && debugInfo?.ref && (
                              <div>Target: {debugInfo.element} ({debugInfo.ref})</div>
                            )}
                            {debugInfo?.url && (
                              <div>URL: {debugInfo.url}</div>
                            )}
                            {snapshotData && (
                              <details className="mt-1">
                                <summary className="cursor-pointer hover:text-blue-600">
                                  📄 Snapshot ({snapshotData.length.toLocaleString()} chars) - Click to expand
                                </summary>
                                <pre className="mt-2 p-2 bg-white border rounded overflow-auto max-h-96 text-xs whitespace-pre-wrap">
                                  {snapshotData}
                                </pre>
                              </details>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            </div>
          </div>
        ))}

        {status === 'streaming' && (
          <div className="text-center text-gray-500">
            <div className="inline-block animate-pulse">AI is thinking...</div>
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (input.trim()) {
            sendMessage({ text: input });
            setInput('');
          }
        }}
        className="flex gap-2 items-end"
      >
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            // Enter without Shift submits, Shift+Enter adds newline
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (input.trim() && status === 'ready') {
                sendMessage({ text: input });
                setInput('');
              }
            }
          }}
          placeholder={"Type a message... (e.g., 'Navigate to google.com')\nShift+Enter for new line"}
          className="flex-1 p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none overflow-hidden min-h-[48px] max-h-[200px]"
          disabled={status !== 'ready'}
          rows={1}
        />
        <button
          type="submit"
          disabled={status !== 'ready'}
          className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed flex-shrink-0"
        >
          Send
        </button>
      </form>
    </div>
  );
}
