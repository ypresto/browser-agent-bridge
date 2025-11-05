/**
 * Popup script for permission requests
 * Isolated from page DOM, communicates with service worker
 */

interface PendingPermission {
  id: string;
  action: string;
  element?: string;
  ref?: string;
  text?: string;
  url?: string;
  callerOrigin: string;
  targetOrigin: string;
  sessionId: string;
  timestamp: number;
}

// Get pending permission from service worker
async function loadPendingPermission(): Promise<PendingPermission | null> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'getPendingPermission' }, (response) => {
      resolve(response);
    });
  });
}

// Send permission decision to service worker
function sendDecision(permissionId: string, allow: boolean, remember: boolean, sessionId: string) {
  chrome.runtime.sendMessage({
    type: 'permissionDecision',
    permissionId,
    allow,
    remember,
    sessionId,
  });

  // Close popup after decision
  window.close();
}

// Render permission request UI
function renderPermissionRequest(permission: PendingPermission) {
  const content = document.getElementById('content')!;

  content.innerHTML = `
    <div class="permission-request">
      <div class="permission-label">Action</div>
      <div class="permission-value">${escapeHtml(permission.action)}</div>

      <div class="permission-label">From (Controller)</div>
      <div class="permission-value">${escapeHtml(permission.callerOrigin)}</div>

      <div class="permission-label">To (Target Page)</div>
      <div class="permission-value">${escapeHtml(permission.targetOrigin)}</div>

      ${permission.element ? `
        <div class="permission-label">Element</div>
        <div class="permission-value">"${escapeHtml(permission.element)}"</div>
      ` : ''}

      ${permission.text ? `
        <div class="permission-label">Text to Type</div>
        <div class="permission-value">"${escapeHtml(permission.text)}"</div>
      ` : ''}

      ${permission.url ? `
        <div class="permission-label">URL</div>
        <div class="permission-value">${escapeHtml(permission.url)}</div>
      ` : ''}
    </div>

    <div class="checkbox-container">
      <label>
        <input type="checkbox" id="remember" />
        <span>Remember for ${escapeHtml(permission.targetOrigin)}</span>
      </label>
    </div>

    <div class="buttons">
      <button class="btn-deny" id="denyBtn">Deny</button>
      <button class="btn-allow" id="allowBtn">Allow</button>
    </div>
  `;

  // Add event listeners
  const allowBtn = document.getElementById('allowBtn')!;
  const denyBtn = document.getElementById('denyBtn')!;
  const rememberCheckbox = document.getElementById('remember') as HTMLInputElement;

  allowBtn.addEventListener('click', () => {
    sendDecision(permission.id, true, rememberCheckbox.checked, permission.sessionId);
  });

  denyBtn.addEventListener('click', () => {
    sendDecision(permission.id, false, rememberCheckbox.checked, permission.sessionId);
  });
}

// Utility function to escape HTML
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Initialize popup
async function init() {
  const permission = await loadPendingPermission();

  if (!permission) {
    const content = document.getElementById('content')!;
    content.innerHTML = '<div class="loading">No pending permission request</div>';
    setTimeout(() => window.close(), 2000);
    return;
  }

  renderPermissionRequest(permission);
}

init();
