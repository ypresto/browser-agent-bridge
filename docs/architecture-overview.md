# Architecture Overview

- AI-SDK tools -(websocket or anything)-> Controller web page -> Content Script -> Service Worker -> Injected Script -> dom-core
- No DevTools
- No CLI installation
- No server side browser rendering.

## DOM Core (@browser-automator/dom-core)

- Provides [playwright-mcp core automation tools](https://github.com/microsoft/playwright-mcp#tools) compatible interface
- Defines plain TS interface for it
- Implements playwright-mcp equivalent accessibility tree using [axe-core](https://github.com/dequelabs/axe-core)

## Browser Extensions Core (@browser-automator/extensions-core)

- Provides playwright-mcp compatible tab management (`browser_tabs`) interface
- Proxies any operations inside tab to actual extension
- Session management
  - Session initiation/reconnect from controller web page
  - Only tabs opened by current session is accessible
- Permission management
  - asks user before allowing to access
- Defines TS interface for extension communication
  - Actual extension will implement this interface and pass it to core to instantiate

## Browser Automator Chrome Extension

- User accesses agent web page (a Controller)
- Chrome Extension starts content scripts and it communicates with service worker
- Controller will send postMessage() on window with fixed UUIDv4 key (for collision prevention), and received by Content Script
- Then service worker of extension will open new tab
- Injected script (`web_accessible_resources`) will do actual operations using `@browser-automator/core`

## Browser Automator Controller (@browser-automator/controller)

- It provides frontend SDK for interacting with extensions
- Provides same interface of dom-core + `browser_tabs`.
- Provides messaging (abstracted) adapter suitabole for websocket,
  so it can be consumed by ai-sdk.
- Defines adapter interface type

## Browser Automator MCP (@browser-automator/ai-sdk)

- Provides Vercel AI SDK tool implementation to agent
- Communicates with controller and it's actual communication impl is provided by user.
  - For example, cloudflare agents can support websocket communication with client.

## Security Model

- Permission request before starting operation with injected script layer
- Session isolation of automated tabs
- Only expose playwright-mcp compatible interface,
  so only able to interact with contents of permission allowed tabs.
