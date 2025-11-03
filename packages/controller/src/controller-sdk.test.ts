import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createControllerSDK } from './controller-sdk.js';
import type { MessagingAdapter, ControllerMessage } from './types.js';

describe('createControllerSDK', () => {
  let mockAdapter: MessagingAdapter;
  let sendSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sendSpy = vi.fn();
    mockAdapter = {
      send: sendSpy,
      onMessage: vi.fn(),
      close: vi.fn(),
    };
  });

  it('should create SDK instance', () => {
    const sdk = createControllerSDK({ adapter: mockAdapter, callerOrigin: 'http://localhost:30001' });
    expect(sdk).toBeDefined();
    expect(sdk.isConnected()).toBe(false);
  });

  it('should connect with token', async () => {
    sendSpy.mockResolvedValue({ sessionId: 'test-session', createdAt: Date.now() });
    const sdk = createControllerSDK({ adapter: mockAdapter, callerOrigin: 'http://localhost:30001' });

    const result = await sdk.connect('test-token');

    expect(sendSpy).toHaveBeenCalledWith({ type: 'connect', token: 'test-token', callerOrigin: 'http://localhost:30001' });
    expect(result.sessionId).toBe('test-session');
    expect(sdk.isConnected()).toBe(true);
  });

  it('should disconnect', async () => {
    sendSpy.mockImplementation(async (msg: any) => {
      if (msg.type === 'connect') {
        return { sessionId: 'test', createdAt: Date.now() };
      }
      return {};
    });
    const sdk = createControllerSDK({ adapter: mockAdapter, callerOrigin: 'http://localhost:30001' });

    await sdk.connect('test-token');
    await sdk.disconnect();

    expect(sendSpy).toHaveBeenCalledWith({ type: 'disconnect', sessionId: 'test' });
    expect(sdk.isConnected()).toBe(false);
  });

  it('should create tab and set as current', async () => {
    sendSpy.mockImplementation(async (msg: ControllerMessage) => {
      if (msg.type === 'connect') {
        return { sessionId: 'test', createdAt: Date.now() };
      }
      if (msg.type === 'createTab') {
        return { id: 123, url: msg.url, title: 'Test', sessionId: 'test' };
      }
    });

    const sdk = createControllerSDK({ adapter: mockAdapter, callerOrigin: 'http://localhost:30001' });
    await sdk.connect('test-token');

    const tab = await sdk.tabs.create('https://example.com');

    expect(tab.id).toBe(123);
    expect(sdk.getCurrentTabId()).toBe(123);
  });

  it('should execute navigate tool on current tab', async () => {
    sendSpy.mockImplementation(async (msg: ControllerMessage) => {
      if (msg.type === 'connect') {
        return { sessionId: 'test', createdAt: Date.now() };
      }
      if (msg.type === 'execute') {
        return { code: 'navigate', pageState: 'YAML' };
      }
    });

    const sdk = createControllerSDK({ adapter: mockAdapter, defaultTabId: 123 });
    await sdk.connect('test-token');

    const result = await sdk.navigate({ url: 'https://example.com' });

    expect(sendSpy).toHaveBeenCalledWith({
      type: 'execute',
      tabId: 123,
      tool: 'navigate',
      args: { url: 'https://example.com' },
      sessionId: 'test',
    });
    expect(result.code).toBe('navigate');
  });

  it('should throw error when executing tool without connection', async () => {
    const sdk = createControllerSDK({ adapter: mockAdapter, defaultTabId: 123 });

    await expect(sdk.navigate({ url: 'https://example.com' })).rejects.toThrow(
      'Not connected to extension',
    );
  });

  it('should create new tab when navigating without tab selected', async () => {
    sendSpy.mockImplementation(async (msg: ControllerMessage) => {
      if (msg.type === 'connect') {
        return { sessionId: 'test', createdAt: Date.now() };
      }
      if (msg.type === 'execute' && msg.tool === 'navigate') {
        return { code: 'navigate', pageState: 'Navigated to https://example.com in new tab' };
      }
    });
    const sdk = createControllerSDK({ adapter: mockAdapter, callerOrigin: 'http://localhost:30001' });
    await sdk.connect('test-token');

    const result = await sdk.navigate({ url: 'https://example.com' });

    expect(sendSpy).toHaveBeenCalledWith({
      type: 'execute',
      tabId: 1, // Sentinel value for "no tab specified"
      tool: 'navigate',
      args: { url: 'https://example.com' },
      sessionId: 'test',
    });
    expect(result.pageState).toContain('Navigated');
  });

  it('should list tabs', async () => {
    sendSpy.mockImplementation(async (msg: ControllerMessage) => {
      if (msg.type === 'connect') {
        return { sessionId: 'test', createdAt: Date.now() };
      }
      if (msg.type === 'listTabs') {
        return [
          { id: 1, url: 'https://example.com', title: 'Example', sessionId: 'test' },
          { id: 2, url: 'https://test.com', title: 'Test', sessionId: 'test' },
        ];
      }
    });

    const sdk = createControllerSDK({ adapter: mockAdapter, callerOrigin: 'http://localhost:30001' });
    await sdk.connect('test-token');

    const tabs = await sdk.tabs.list();

    expect(tabs).toHaveLength(2);
    expect(tabs[0]?.id).toBe(1);
  });

  it('should execute snapshot tool', async () => {
    sendSpy.mockImplementation(async (msg: ControllerMessage) => {
      if (msg.type === 'connect') {
        return { sessionId: 'test', createdAt: Date.now() };
      }
      if (msg.type === 'execute' && msg.tool === 'snapshot') {
        return '- Page URL: https://example.com\n- Page Title: Test';
      }
    });

    const sdk = createControllerSDK({ adapter: mockAdapter, defaultTabId: 123 });
    await sdk.connect('test-token');

    const snapshot = await sdk.snapshot();

    expect(snapshot).toContain('Page URL');
  });
});
