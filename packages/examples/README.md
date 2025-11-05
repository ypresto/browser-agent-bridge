# @browser-agent-bridge/examples

Example Next.js application demonstrating browser automation with Vercel AI SDK.

## Features

- Chat interface powered by Vercel AI SDK
- Browser automation tools integrated via @browser-agent-bridge/ai-sdk
- WebSocket-based controller communication (mock adapter for demo)
- 11 automation tools: navigate, snapshot, click, type, evaluate, tabs, wait, console

## Setup

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Configure API Key

Create `.env.local` and add your OpenAI API key:

```env
OPENAI_API_KEY=your_openai_api_key_here
```

### 3. Run Development Server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

### Try These Commands

1. **Navigate**: "Navigate to example.com"
2. **Get Snapshot**: "Get the accessibility snapshot of the page"
3. **Create Tab**: "Open a new tab with google.com"
4. **Click Element**: "Click the button with ref e1"
5. **Type**: "Type 'hello' into the textbox with ref e2"

### Current Limitations

This example uses a **mock adapter** for demonstration. To use real browser automation:

1. Install the Chrome extension from `extension/` directory
2. Replace mock adapter with real WebSocket adapter
3. Connect to the extension via WebSocket

## Architecture

```
Chat UI (useChat hook)
  ↓
API Route (/api/chat)
  ↓
AI SDK streamText with tools
  ↓
@browser-agent-bridge/ai-sdk (browser tools)
├─
@browser-agent-bridge/controller (SDK)
  ↓
MessagingAdapter (Mock/WebSocket)
  ↓
Chrome Extension → dom-core
```

## Available Tools

- `browser_navigate` - Navigate to URL
- `browser_snapshot` - Get accessibility tree
- `browser_click` - Click element
- `browser_type` - Type text
- `browser_evaluate` - Execute JavaScript
- `browser_tabs_create` - Create new tab
- `browser_tabs_list` - List all tabs
- `browser_tabs_select` - Select tab
- `browser_tabs_close` - Close tab
- `browser_wait` - Wait for conditions
- `browser_console` - Get console messages

## Development

```bash
# Run in development mode
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start

# Lint code
pnpm lint
```

## Next Steps

1. Set up real WebSocket server
2. Connect to Chrome extension
3. Test with real browser automation
4. Add more example use cases
