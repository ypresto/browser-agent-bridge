/**
 * Chrome Extension Content Script
 * Executes DOM tools directly with dom-core
 */

import { DomCore } from '@browser-automator/dom-core';

const BROWSER_AUTOMATOR_UUID = 'ba-4a8f9c2d-e1b6-4d3a-9f7e-2c8b1a5d6e3f';

// Create dom-core instance
const domCore = new DomCore();

console.log('[Content Script] Browser Automator Content Script loaded with DomCore');

// NEW ARCHITECTURE: Handle messages from web page (postMessage from Node Server ← WebSocket → Web Page)
// Tier 1 Security: Nonce tracking for replay protection (content script level)
const usedNonces = new Set<string>();

window.addEventListener('message', (event) => {
  if (event.data?.uuid === BROWSER_AUTOMATOR_UUID) {
    if (event.data?.type === 'browser-automator-init') {
      // Forward init message to service worker
      chrome.runtime.sendMessage(event.data, (response) => {
        // Send response back to controller
        window.postMessage({
          type: 'browser-automator-response',
          payload: response,
        }, '*');
      });
    } else if (event.data?.type === 'browser-automator-wake-up') {
      // Wake up service worker by sending a ping
      chrome.runtime.sendMessage({ type: 'ping' }, (response) => {
        window.postMessage({
          type: 'browser-automator-wake-up-response',
          success: !chrome.runtime.lastError,
          error: chrome.runtime.lastError?.message,
        }, '*');
      });
    } else if (event.data?.type === 'browser-automator-command') {
      // NEW ARCHITECTURE: Handle commands from web page
      // Extract browser-validated origin (CRITICAL: This is trusted by the browser)
      const trustedOrigin = event.origin;

      console.log('[Content Script] Received command from:', trustedOrigin);

      // Tier 1 Security: Validate nonce (replay protection at content script level)
      const { nonce, sessionToken, requestId, command } = event.data;

      if (!nonce) {
        console.error('[Content Script] Missing nonce');
        window.postMessage({
          type: 'browser-automator-response',
          requestId,
          error: 'Missing nonce',
          success: false,
        }, event.origin);
        return;
      }

      if (usedNonces.has(nonce)) {
        console.error('[Content Script] Replay attack detected: nonce already used');
        window.postMessage({
          type: 'browser-automator-response',
          requestId,
          error: 'Replay attack detected',
          success: false,
        }, event.origin);
        return;
      }

      // Add nonce to used set
      usedNonces.add(nonce);

      // Cleanup old nonces (keep last 10000)
      if (usedNonces.size > 10000) {
        const noncesArray = Array.from(usedNonces);
        const toRemove = noncesArray.slice(0, usedNonces.size - 10000);
        toRemove.forEach(n => usedNonces.delete(n));
      }

      // Tier 1 Security: Basic command validation
      if (!command || typeof command !== 'object') {
        console.error('[Content Script] Invalid command structure');
        window.postMessage({
          type: 'browser-automator-response',
          requestId,
          error: 'Invalid command structure',
          success: false,
        }, event.origin);
        return;
      }

      // Forward command to service worker with trusted origin
      const messageToSend = {
        type: 'executeCommand',
        command,
        origin: trustedOrigin,  // Browser-validated origin
        nonce,
        sessionToken,
        requestId,
      };

      console.log('[Content Script] Forwarding to service worker:', {
        commandType: command?.type,
        hasSessionToken: !!sessionToken,
        hasNonce: !!nonce,
      });

      chrome.runtime.sendMessage(messageToSend, (response) => {
        // Send response back to web page
        window.postMessage({
          type: 'browser-automator-response',
          requestId: requestId,
          ...response,
        }, event.origin);
      });
    }
  }
});

// Handle messages from service worker (for tool execution)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'execute-tool') {
    console.log('[Content Script] Executing tool:', message.tool, 'with args:', message.args);

    // Execute tool directly with dom-core
    (async () => {
      try {
        // CRITICAL-1: Origin Validation
        // Validate that the current page origin matches the expected origin
        // This prevents race condition attacks where a page navigates between
        // permission grant and execution
        if (message.expectedOrigin) {
          const actualOrigin = window.location.origin;
          if (message.expectedOrigin !== actualOrigin) {
            console.error('[Content Script] Origin mismatch detected!', {
              expected: message.expectedOrigin,
              actual: actualOrigin,
              tool: message.tool,
            });
            sendResponse({
              error: `Origin mismatch: expected ${message.expectedOrigin}, got ${actualOrigin}. Action denied for security.`,
              success: false,
            });
            return;
          }
          console.log('[Content Script] Origin validation passed:', actualOrigin);
        } else {
          console.warn('[Content Script] No expectedOrigin provided - security check skipped');
        }

        let result: any;

        switch (message.tool) {
          case 'snapshot':
            console.log('[Content Script] Calling domCore.snapshot()');
            result = { snapshot: await domCore.snapshot() };
            console.log('[Content Script] Snapshot result:', result.snapshot.substring(0, 100) + '...');
            break;

          case 'click':
            console.log('[Content Script] Calling domCore.click()');
            await domCore.click(message.args);
            result = { success: true };
            console.log('[Content Script] Click completed');
            break;

          case 'type':
            console.log('[Content Script] Calling domCore.type()');
            await domCore.type(message.args);
            result = { success: true };
            console.log('[Content Script] Type completed');
            break;

          case 'evaluate':
            console.log('[Content Script] Calling domCore.evaluate()');
            const evalResult = await domCore.evaluate(message.args);
            result = { result: evalResult.result, error: evalResult.error };
            console.log('[Content Script] Evaluate result:', result);
            break;

          case 'waitFor':
            console.log('[Content Script] Calling domCore.waitFor()');
            await domCore.waitFor(message.args);
            result = { success: true };
            console.log('[Content Script] WaitFor completed');
            break;

          case 'consoleMessages':
            console.log('[Content Script] Calling domCore.consoleMessages()');
            const messages = await domCore.consoleMessages(message.args);
            result = { messages: messages.result };
            console.log('[Content Script] ConsoleMessages result:', result);
            break;

          default:
            result = {
              error: `Unknown tool: ${message.tool}`,
              success: false,
            };
        }

        console.log('[Content Script] Sending response:', result);
        sendResponse(result);
      } catch (error) {
        console.error('[Content Script] Tool execution error:', error);
        sendResponse({
          error: error instanceof Error ? error.message : String(error),
          success: false,
        });
      }
    })();

    // Return true to indicate async response
    return true;
  }
});

console.log('Browser Automator Content Script loaded');
