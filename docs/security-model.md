# Security Model

## Overview

Browser Automator implements a multi-layered security model to prevent unauthorized access and protect user privacy. The core principle is **origin-based isolation**: each controller origin can only interact with tabs it created, and all actions require explicit user permission.

## Key Security Principles

### 1. Session-Origin Binding

**Rule**: Each connection session is bound to the controller's origin.

```
Controller at https://app.example.com
  ↓ creates session
Session ID: session_xxx
  ↓ bound to origin
Origin: https://app.example.com
```

**Enforcement**:
- Session tracks which origin created it (from postMessage origin)
- Only tabs opened by this session are accessible
- Tabs from other sessions or manual browsing are NOT accessible

### 2. Tab Isolation per Session-Origin

**Rule**: Sessions can only access tabs they created.

```
Session A (origin: https://app1.com)
  ├─ Tab 1: https://google.com     ✅ Can access
  ├─ Tab 2: https://github.com     ✅ Can access
  └─ Tab 3: Cannot access tabs from Session B

Session B (origin: https://app2.com)
  ├─ Tab 4: https://twitter.com    ✅ Can access
  └─ Cannot access tabs from Session A
```

### 3. Permission Model by Action Type

#### URL-based Actions (navigate, createTab)

**Rule**: Require permission for the **target URL's origin**.

Example:
```
Controller: https://app.example.com
Action: navigate to https://bank.com
Permission needed: "Allow https://app.example.com to navigate to https://bank.com?"
```

**Why**: Prevents malicious controllers from navigating to sensitive sites without approval.

#### DOM Actions (click, type, evaluate)

**Rule**: Require permission for the **current page's origin**.

Example:
```
Controller: https://app.example.com
Current page: https://google.com
Action: type "password" into input
Permission needed: "Allow https://app.example.com to type on https://google.com?"
```

**Why**: Protects against unauthorized data entry or extraction.

#### Read-only Actions (snapshot, waitFor, consoleMessages)

**Rule**: Generally allowed, but still origin-checked.

**Why**: Less sensitive, but still scoped to session's tabs.

### 4. Origin Validation in Content Script

**Rule**: Content script validates request origin matches page origin.

```
Service Worker sends:
{
  type: 'execute-tool',
  tool: 'type',
  expectedOrigin: 'https://google.com',
  callerOrigin: 'https://app.example.com',
  sessionId: 'session_xxx'
}

Content Script checks:
1. window.location.origin === expectedOrigin  ✅
2. Session is valid
3. If mismatch → REJECT with error
```

**Why**: Prevents race conditions where tab navigates to different origin between permission grant and execution.

### 5. Permission Persistence

**Two Levels of Permission Storage**:

#### Level 1: Session-Level Permissions (Temporary)

**Rule**: Once approved in a session, all actions to that origin are allowed for the session.

```
Session: session_xxx (caller: http://localhost:30001)
  ├─ Granted: navigate → https://google.com
  └─ Auto-allowed for this session:
      ├─ type → https://google.com ✅
      ├─ click → https://google.com ✅
      └─ evaluate → https://google.com ✅
```

**Behavior**:
- First action to an origin requires permission
- Subsequent actions to same origin in same session: auto-allowed
- Cleared when session ends
- Default behavior (no checkbox needed)

#### Level 2: Cross-Session Policies (Persistent)

**Rule**: "Remember for domain" creates persistent policy across sessions.

```
Permission Policy:
{
  callerOrigin: 'http://localhost:30001',
  targetOrigin: 'https://google.com',
  allowedActions: ['type', 'click', 'navigate', 'evaluate']
}
```

**Behavior**:
- User checks "Remember for domain" checkbox
- Policy saved in PermissionManager
- Future sessions: auto-allowed without prompt
- Stored per caller origin (NOT global)
- Prevents privilege escalation between controllers

**Storage**:
- In-memory for now (cleared on service worker restart)
- TODO: Persist to chrome.storage for cross-restart persistence

**Security**: postMessage() origin must be from secure context (HTTPS or localhost).

### 6. Popup Origin Security

**Rule**: Permission popup is isolated in extension context.

```
Page DOM (Untrusted)
  ↓ ❌ Cannot access
Extension Popup (Trusted)
  ↓ chrome.runtime API
Service Worker (Trusted)
```

**Why**: Prevents page JavaScript from spoofing or manipulating permission dialogs.

## Attack Scenarios & Mitigations

### Scenario 1: Malicious Controller Opens Sensitive Sites

**Attack**: `https://evil.com` tries to navigate to `https://bank.com` and steal data.

**Mitigation**:
1. Navigate requires permission: "Allow evil.com to navigate to bank.com?"
2. User sees both origins in permission dialog
3. User denies → Navigation blocked

### Scenario 2: Tab Hijacking

**Attack**: Controller tries to access manually-opened tabs.

**Mitigation**:
1. Sessions only track tabs they created
2. Manually-opened tabs not in session → Access denied
3. Tabs from other sessions not accessible

### Scenario 3: Origin Spoofing

**Attack**: Send action with fake origin to bypass permission checks.

**Mitigation**:
1. Origin comes from trusted postMessage event (browser-verified)
2. Content script double-checks window.location.origin
3. Mismatch → Request rejected

### Scenario 4: Permission Dialog Spoofing

**Attack**: Page tries to show fake permission dialog.

**Mitigation**:
1. Real dialog is chrome.action.openPopup() - isolated from page
2. Page cannot access or modify extension popup
3. User can verify it's genuine extension UI (shows in extension context)

### Scenario 5: CSRF via Saved Permissions

**Attack**: Evil site uses saved permissions from good site.

**Mitigation**:
1. Permissions saved per (caller origin, target origin) pair
2. Evil.com's session cannot use permissions from app.example.com
3. Each controller has separate permission namespace

## Implementation Layers

### Layer 1: extensions-core (Permission Logic)

**Responsibilities**:
- Session-origin binding
- Permission policy storage
- Permission checking logic
- Origin validation
- Tab access control

**Location**: `packages/extensions-core/src/permission-manager.ts`

### Layer 2: extension (Browser Integration)

**Responsibilities**:
- Chrome API calls (chrome.action.openPopup, chrome.tabs, etc.)
- WebSocket communication
- Delegate permission checks to extensions-core
- Execute approved actions

**Location**: `extension/src/service-worker.ts`

### Layer 3: Popup UI

**Responsibilities**:
- Display permission details
- Collect user decision
- Communicate with service worker
- Isolated, trusted UI

**Location**: `extension/popup.html` + `extension/src/popup.ts`

## Summary

The security model ensures:
- ✅ **Origin isolation** - Each controller has separate namespace
- ✅ **Explicit permission** - User approves all sensitive actions
- ✅ **Tab isolation** - Sessions only access their own tabs
- ✅ **Origin validation** - Content script verifies request origin
- ✅ **Secure UI** - Permission dialogs isolated from page
- ✅ **Scoped policies** - "Always allow" per controller-target pair

This prevents unauthorized access, privilege escalation, and cross-origin attacks while maintaining usability through smart permission policies.
