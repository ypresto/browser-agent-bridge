# @browser-agent-bridge/examples

Example Next.js application demonstrating browser automation with Vercel AI SDK.

## Features

- Chat interface powered by Vercel AI SDK
- Browser automation tools integrated via @browser-agent-bridge/ai-sdk
- WebSocket-based controller communication
- Agent can use tools like: navigate, snapshot, click, type, tabs, wait, console

## Setup

```bash
pnpm install
pnpm run build
```

### 2. Configure API Key

Create `.env.local` and add your OpenAI API key:

```env
OPENAI_API_KEY=your_openai_api_key_here
```

### 3. Install Chrome Extension

1. Open `chrome://extensions/`
2. Click "Load unpacked" button
   - In Japanese: 「パッケージ化されていない拡張機能を読み込む」
3. Select `packages/extensions-chrome` directory

### 4. Run Development Server

```bash
pnpm run dev
```

Open [http://localhost:30001](http://localhost:30001) in your browser.

## Usage

### Try These Commands

- "Open Google and search for weather"
- "Submit form at `https://xxx.xxx/xxx` with ...(parameters)"
