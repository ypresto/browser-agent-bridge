/**
 * Chrome Extension Service Worker
 * Manages tabs and sessions via postMessage (no WebSocket connections)
 *
 * New Architecture:
 * Node Server ←WebSocket→ Web Page ←postMessage→ Browser Extension
 */

import {
  SessionManager,
  PermissionManager,
  type PermissionRequest,
} from '@browser-automator/extensions-core';

const sessionManager = new SessionManager();
const permissionManager = new PermissionManager();

// Store caller origin per session (from browser-validated event.origin)
const sessionCallerOrigins = new Map<string, string>();

// Tier 1 Security: Nonce tracking for replay protection
const usedNonces = new Set<string>();

// Tier 1 Security: Session token management
interface SessionTokenInfo {
  origin: string;
  createdAt: number;
  expiresAt: number;
}
const sessionTokens = new Map<string, SessionTokenInfo>();

// Tier 1 Security: Request-response correlation
interface PendingRequest {
  origin: string;
  timestamp: number;
  tabId: number;
}
const pendingRequests = new Map<string, PendingRequest>();

// Permission management
interface PendingPermissionUI {
  id: string;
  request: PermissionRequest;
  sessionId: string; // Store the real sessionId
  resolve: (allowed: boolean) => void;
  reject: (error: Error) => void;
}

const pendingPermissions = new Map<string, PendingPermissionUI>();

// Helper function to get caller origin for a session
function getCallerOrigin(sessionId: string): string | undefined {
  return sessionCallerOrigins.get(sessionId);
}

// Keep service worker alive using alarms
chrome.alarms.create('keepAlive', { periodInMinutes: 0.5 }); // Every 30 seconds

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAlive') {
    console.log('[Service Worker] Keep-alive alarm triggered');
  }
});

// Request permission from user using PermissionManager
async function requestPermission(request: PermissionRequest, sessionId: string): Promise<boolean> {
  // Level 1: Check session-level permissions (granted origins for this session)
  console.log(`[Permission] Checking session ${sessionId} for origin ${request.targetOrigin}`);
  const session = sessionManager.getSession(sessionId);
  console.log(`[Permission] Session granted origins:`, session?.grantedOrigins);

  if (sessionManager.isOriginGrantedForSession(sessionId, request.targetOrigin)) {
    console.log(`[Permission] Auto-allowed (session): ${request.action} on ${request.targetOrigin}`);
    return true;
  }

  // Level 2: Check cross-session policies (persistent "remember" permissions)
  if (permissionManager.isAllowed(request)) {
    console.log(`[Permission] Auto-allowed (policy): ${request.action} (${request.callerOrigin} → ${request.targetOrigin})`);
    return true;
  }

  // Create pending permission for UI
  const permissionId = Math.random().toString(36).substring(2);

  return new Promise((resolve, reject) => {
    const pending: PendingPermissionUI = {
      id: permissionId,
      request,
      sessionId, // Store the real sessionId
      resolve,
      reject,
    };

    pendingPermissions.set(permissionId, pending);

    console.log('[Permission] Opening popup for permission request:', permissionId);

    // Open popup to show permission request
    chrome.action.openPopup().then(() => {
      console.log('[Permission] Popup opened successfully');
    }).catch((error) => {
      console.error('[Permission] Failed to open popup:', error);
      pendingPermissions.delete(permissionId);
      reject(new Error('Failed to open permission popup'));
    });

    // Timeout after 30 seconds
    setTimeout(() => {
      if (pendingPermissions.has(permissionId)) {
        pendingPermissions.delete(permissionId);
        reject(new Error('Permission request timed out'));
      }
    }, 30000);
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'createSession') {
    // Require callerOrigin to be provided
    const callerOrigin = message.callerOrigin;
    if (!callerOrigin) {
      console.error('[Service Worker] Session creation rejected: Missing callerOrigin');
      sendResponse({
        error: 'Session creation rejected: callerOrigin is required.',
        success: false,
      });
      return true;
    }

    // CRITICAL-3: Enforce secure origin check
    if (!PermissionManager.isSecureOrigin(callerOrigin)) {
      console.error('[Service Worker] Session creation rejected: Insecure origin', callerOrigin);
      sendResponse({
        error: `Session creation rejected: Insecure origin "${callerOrigin}". Only HTTPS or localhost allowed.`,
        success: false,
      });
      return true;
    }

    const session = sessionManager.createSession(callerOrigin);
    sessionCallerOrigins.set(session.sessionId, callerOrigin);

    // Tier 1 Security: Generate session token
    const sessionToken = crypto.randomUUID();
    sessionTokens.set(sessionToken, {
      origin: callerOrigin,
      createdAt: Date.now(),
      expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
    });

    console.log('[Service Worker] Session created with token:', sessionToken.substring(0, 8) + '...');

    sendResponse({
      ...session,
      sessionToken, // Return token to caller
    });
  } else if (message.type === 'executeCommand') {
    // NEW ARCHITECTURE: Handle commands from content script (which received them via postMessage from web page)
    // The content script has already validated the browser origin
    (async () => {
      try {
        const { command, origin, nonce, sessionToken, requestId } = message;

        // Tier 1 Security: Validate nonce (replay protection)
        if (!nonce || usedNonces.has(nonce)) {
          console.error('[Service Worker] Replay attack detected or missing nonce');
          sendResponse({
            error: 'Invalid or reused nonce',
            success: false,
          });
          return;
        }
        usedNonces.add(nonce);

        // Cleanup old nonces periodically (keep last 10000 nonces)
        if (usedNonces.size > 10000) {
          const noncesArray = Array.from(usedNonces);
          const toRemove = noncesArray.slice(0, usedNonces.size - 10000);
          toRemove.forEach(n => usedNonces.delete(n));
        }

        // Debug: Log command details
        console.log('[Service Worker] executeCommand - command type:', command.type, 'full command:', command);

        // Special case: 'connect' command creates a new session (no token required)
        if (command.type === 'connect') {
          console.log('[Service Worker] Creating new session for origin:', origin);

          // Validate origin is secure
          if (!PermissionManager.isSecureOrigin(origin)) {
            console.error('[Service Worker] Connect rejected: Insecure origin', origin);
            sendResponse({
              error: `Insecure origin "${origin}". Only HTTPS or localhost allowed.`,
              success: false,
            });
            return;
          }

          // Create session
          const session = sessionManager.createSession(origin);
          sessionCallerOrigins.set(session.sessionId, origin);

          // Generate session token
          const newSessionToken = crypto.randomUUID();
          sessionTokens.set(newSessionToken, {
            origin,
            createdAt: Date.now(),
            expiresAt: Date.now() + 24 * 60 * 60 * 1000,
          });

          console.log('[Service Worker] Session created:', session.sessionId, 'with token:', newSessionToken.substring(0, 8) + '...');

          sendResponse({
            ...session,
            sessionToken: newSessionToken,
            success: true,
          });
          return;
        }

        // For all other commands: Validate session token (Tier 1 Security)
        if (!sessionToken) {
          console.error('[Service Worker] Missing session token');
          sendResponse({
            error: 'Session token required',
            success: false,
          });
          return;
        }

        const tokenInfo = sessionTokens.get(sessionToken);
        if (!tokenInfo || tokenInfo.expiresAt < Date.now()) {
          console.error('[Service Worker] Invalid or expired session token');
          sendResponse({
            error: 'Invalid or expired session token',
            success: false,
          });
          return;
        }
        if (tokenInfo.origin !== origin) {
          console.error('[Service Worker] Session token origin mismatch');
          sendResponse({
            error: 'Session token origin mismatch',
            success: false,
          });
          return;
        }

        // Tier 1 Security: Track request-response correlation
        if (requestId && command.tabId) {
          pendingRequests.set(requestId, {
            origin,
            timestamp: Date.now(),
            tabId: command.tabId,
          });

          // Cleanup old requests (keep last 1 hour)
          const oneHourAgo = Date.now() - 3600000;
          for (const [rid, req] of pendingRequests.entries()) {
            if (req.timestamp < oneHourAgo) {
              pendingRequests.delete(rid);
            }
          }
        }

        // Process the command
        let payload;
        const { type } = command;

        if (type === 'createTab') {
          const { sessionId, url } = command;
          if (!sessionId) {
            payload = { error: 'Session ID required', success: false };
          } else {
            const callerOrigin = origin;
            const targetOrigin = new URL(url).origin;
            const permissionRequest: PermissionRequest = {
              action: 'createTab',
              callerOrigin,
              targetOrigin,
              url,
            };

            try {
              const allowed = await requestPermission(permissionRequest, sessionId);
              if (!allowed) {
                payload = {
                  error: `Permission denied to open tab: ${url}`,
                  success: false,
                };
              } else {
                const tab = await chrome.tabs.create({ url });
                if (tab.id) {
                  sessionManager.addTabToSession(sessionId, tab.id);
                }
                payload = {
                  id: tab.id,
                  url: tab.url || url,
                  title: tab.title || 'New Tab',
                  sessionId,
                };
              }
            } catch (error) {
              payload = {
                error: `Permission error: ${error instanceof Error ? error.message : String(error)}`,
                success: false,
              };
            }
          }
        } else if (type === 'listTabs') {
          const { sessionId } = command;
          if (!sessionId) {
            payload = { error: 'Session ID required' };
          } else {
            const session = sessionManager.getSession(sessionId);
            if (!session) {
              payload = { error: 'Invalid session' };
            } else {
              const sessionTabIds = session.tabIds;
              const allTabs = await chrome.tabs.query({});
              const sessionTabs = allTabs.filter(tab => tab.id && sessionTabIds.includes(tab.id));

              payload = sessionTabs.map((tab) => ({
                id: tab.id,
                url: tab.url || '',
                title: tab.title || 'Untitled',
                sessionId: session.sessionId,
              }));
            }
          }
        } else if (type === 'execute') {
          const { tool, args, sessionId } = command;
          let { tabId } = command;

          // Validate session exists
          if (sessionId) {
            const session = sessionManager.getSession(sessionId);
            if (!session) {
              payload = { error: 'Invalid session', success: false };
              sendResponse({ requestId, payload });
              return;
            }
          }

          // For navigate tool without explicit tabId, create new tab
          if (tool === 'navigate' && (!tabId || tabId === 1)) {
            const callerOrigin = origin;
            const targetOrigin = new URL(args.url).origin;
            const permissionRequest: PermissionRequest = {
              action: 'navigate',
              callerOrigin,
              targetOrigin,
              url: args.url,
            };

            try {
              const allowed = await requestPermission(permissionRequest, sessionId || 'default-session');
              if (!allowed) {
                payload = {
                  error: `Permission denied to navigate to: ${args.url}`,
                  success: false,
                };
              } else {
                const tab = await chrome.tabs.create({ url: args.url });
                if (tab.id && sessionId) {
                  sessionManager.addTabToSession(sessionId, tab.id);
                }
                payload = {
                  code: `navigate('${args.url}')`,
                  pageState: `Navigated to ${args.url} in new tab`,
                  tabId: tab.id,
                };
              }
            } catch (error) {
              payload = {
                error: `Permission error: ${error instanceof Error ? error.message : String(error)}`,
                success: false,
              };
            }
          } else {
            // If no tab ID or invalid, use active tab for other tools
            if (!tabId || tabId === 1) {
              const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
              tabId = tabs[0]?.id || null;
            }

            // Validate tab belongs to session (security check)
            if (tabId && sessionId) {
              if (!sessionManager.isTabInSession(sessionId, tabId)) {
                payload = {
                  error: `Access denied: Tab ${tabId} does not belong to this session`,
                  success: false,
                };
                sendResponse({ requestId, payload });
                return;
              }
            }

            if (!tabId) {
              payload = { error: 'No active tab found' };
            } else if (tool === 'navigate') {
              // Navigate existing tab to URL
              const callerOrigin = origin;
              const targetOrigin = new URL(args.url).origin;
              const permissionRequest: PermissionRequest = {
                action: 'navigate',
                callerOrigin,
                targetOrigin,
                url: args.url,
              };

              try {
                const allowed = await requestPermission(permissionRequest, sessionId || 'default-session');
                if (!allowed) {
                  payload = {
                    error: `Permission denied to navigate to: ${args.url}`,
                    success: false,
                  };
                } else {
                  await chrome.tabs.update(tabId, { url: args.url });
                  payload = {
                    code: `navigate('${args.url}')`,
                    pageState: `Navigated to ${args.url}`,
                  };
                }
              } catch (error) {
                payload = {
                  error: `Permission error: ${error instanceof Error ? error.message : String(error)}`,
                  success: false,
                };
              }
            } else {
              // Check permission for sensitive actions
              const sensitiveActions = ['click', 'type', 'evaluate'];
              const requiresPermission = sensitiveActions.includes(tool);

              if (requiresPermission) {
                try {
                  const tab = await chrome.tabs.get(tabId);
                  const targetOrigin = tab.url ? new URL(tab.url).origin : 'unknown';
                  const callerOrigin = origin;

                  const permissionRequest: PermissionRequest = {
                    action: tool,
                    callerOrigin,
                    targetOrigin,
                    element: args.element,
                    ref: args.ref,
                    text: args.text,
                  };

                  const allowed = await requestPermission(permissionRequest, sessionId || 'default-session');

                  if (!allowed) {
                    payload = {
                      error: `Permission denied for action: ${tool}`,
                      success: false,
                    };
                    sendResponse({ requestId, payload });
                    return;
                  }
                } catch (error) {
                  payload = {
                    error: `Permission error: ${error instanceof Error ? error.message : String(error)}`,
                    success: false,
                  };
                  sendResponse({ requestId, payload });
                  return;
                }
              }

              // Forward to content script for DOM operations
              try {
                const tab = await chrome.tabs.get(tabId);
                const targetOrigin = tab.url ? new URL(tab.url).origin : undefined;

                const response = await chrome.tabs.sendMessage(tabId, {
                  type: 'execute-tool',
                  tool,
                  args,
                  expectedOrigin: targetOrigin,
                  callerOrigin: origin,
                  sessionId: sessionId,
                });
                payload = response;
              } catch (error) {
                payload = {
                  error: `Failed to execute tool "${tool}": ${error instanceof Error ? error.message : String(error)}`,
                  success: false,
                };
              }
            }
          }
        } else {
          payload = { error: 'Unknown command type' };
        }

        sendResponse({ requestId, payload });
      } catch (error) {
        console.error('[Service Worker] Command execution error:', error);
        sendResponse({
          error: error instanceof Error ? error.message : String(error),
          success: false,
        });
      }
    })();

    // Return true for async response
    return true;
  } else if (message.type === 'ping') {
    console.log('[Service Worker] Ping received, service worker is active');
    sendResponse({ status: 'active', timestamp: Date.now() });
  } else if (message.type === 'getPendingPermission') {
    // Popup is requesting the pending permission
    const permissions = Array.from(pendingPermissions.values());
    const pending = permissions[0] || null;
    if (pending) {
      // Return serializable version (without resolve/reject functions)
      sendResponse({
        id: pending.id,
        action: pending.request.action,
        element: pending.request.element,
        ref: pending.request.ref,
        text: pending.request.text,
        url: pending.request.url || pending.request.targetOrigin,
        callerOrigin: pending.request.callerOrigin,
        targetOrigin: pending.request.targetOrigin,
        sessionId: pending.sessionId, // Use the real sessionId from the request
        timestamp: Date.now(),
      });
    } else {
      sendResponse(null);
    }
  } else if (message.type === 'permissionDecision') {
    // User made a decision in popup
    const { permissionId, allow, remember, sessionId } = message;
    const pending = pendingPermissions.get(permissionId);

    if (pending) {
      if (allow) {
        // Level 1: Always grant for session (temporary, auto-allowed for rest of session)
        if (sessionId) {
          console.log(`[Permission] Granting origin ${pending.request.targetOrigin} for session ${sessionId}`);
          sessionManager.grantOriginForSession(sessionId, pending.request.targetOrigin);
          const session = sessionManager.getSession(sessionId);
          console.log(`[Permission] Session ${sessionId} now has granted origins:`, session?.grantedOrigins);
        }

        // Level 2: If "remember" checked, save persistent policy (cross-session)
        if (remember) {
          permissionManager.grantPermission(pending.request, true);
        }
      }

      // Resolve the promise
      pending.resolve(allow);
      pendingPermissions.delete(permissionId);

      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: 'Permission not found' });
    }
  }

  return true;
});

console.log('Browser Automator Service Worker loaded');
