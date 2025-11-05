import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createBrowserTools } from './tools.js';
import type { ControllerSDK } from '@browser-agent-bridge/controller';

describe('createBrowserTools', () => {
  let mockSDK: ControllerSDK;

  beforeEach(() => {
    mockSDK = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      isConnected: vi.fn(),
      getCurrentTabId: vi.fn(),
      setCurrentTabId: vi.fn(),
      tabs: {
        create: vi.fn(),
        list: vi.fn(),
        select: vi.fn(),
        close: vi.fn(),
      },
      navigate: vi.fn(),
      navigateBack: vi.fn(),
      snapshot: vi.fn(),
      click: vi.fn(),
      type: vi.fn(),
      fillForm: vi.fn(),
      selectOption: vi.fn(),
      hover: vi.fn(),
      drag: vi.fn(),
      pressKey: vi.fn(),
      evaluate: vi.fn(),
      waitFor: vi.fn(),
      consoleMessages: vi.fn(),
      networkRequests: vi.fn(),
      takeScreenshot: vi.fn(),
    } as any;
  });

  it('should create browser tools', () => {
    const tools = createBrowserTools(mockSDK);

    expect(tools).toBeDefined();
    expect(tools.browser_navigate).toBeDefined();
    expect(tools.browser_snapshot).toBeDefined();
    expect(tools.browser_click).toBeDefined();
  });

  it('browser_navigate should call SDK navigate', async () => {
    (mockSDK.navigate as any).mockResolvedValue({
      code: 'navigate',
      pageState: 'YAML',
    });

    const tools = createBrowserTools(mockSDK);
    const result = await tools.browser_navigate.execute({ url: 'https://example.com' });

    expect(mockSDK.navigate).toHaveBeenCalledWith({ url: 'https://example.com' });
    expect(result.code).toBe('navigate');
  });

  it('browser_snapshot should call SDK snapshot', async () => {
    (mockSDK.snapshot as any).mockResolvedValue('- Page URL: https://example.com');

    const tools = createBrowserTools(mockSDK);
    const result = await tools.browser_snapshot.execute({});

    expect(mockSDK.snapshot).toHaveBeenCalled();
    expect(result.snapshot).toContain('Page URL');
  });

  it('browser_click should call SDK click', async () => {
    (mockSDK.click as any).mockResolvedValue(undefined);

    const tools = createBrowserTools(mockSDK);
    const result = await tools.browser_click.execute({
      element: 'Submit button',
      ref: 'e1',
    });

    expect(mockSDK.click).toHaveBeenCalledWith({
      element: 'Submit button',
      ref: 'e1',
      doubleClick: undefined,
      button: undefined,
    });
    expect(result.success).toBe(true);
  });

  it('browser_type should call SDK type', async () => {
    (mockSDK.type as any).mockResolvedValue(undefined);

    const tools = createBrowserTools(mockSDK);
    const result = await tools.browser_type.execute({
      element: 'Username',
      ref: 'e2',
      text: 'testuser',
    });

    expect(mockSDK.type).toHaveBeenCalledWith({
      element: 'Username',
      ref: 'e2',
      text: 'testuser',
      submit: undefined,
    });
    expect(result.success).toBe(true);
  });

  it('browser_tabs_create should call SDK tabs.create', async () => {
    (mockSDK.tabs.create as any).mockResolvedValue({
      id: 123,
      url: 'https://example.com',
      title: 'Example',
      sessionId: 'test',
    });

    const tools = createBrowserTools(mockSDK);
    const result = await tools.browser_tabs_create.execute({
      url: 'https://example.com',
    });

    expect(mockSDK.tabs.create).toHaveBeenCalledWith('https://example.com');
    expect(result.tabId).toBe(123);
  });

  it('browser_tabs_list should call SDK tabs.list', async () => {
    (mockSDK.tabs.list as any).mockResolvedValue([
      { id: 1, url: 'https://example.com', title: 'Example', sessionId: 'test' },
    ]);

    const tools = createBrowserTools(mockSDK);
    const result = await tools.browser_tabs_list.execute({});

    expect(mockSDK.tabs.list).toHaveBeenCalled();
    expect(result.tabs).toHaveLength(1);
  });

  it('browser_wait_for should call SDK waitFor', async () => {
    (mockSDK.waitFor as any).mockResolvedValue(undefined);

    const tools = createBrowserTools(mockSDK);
    const result = await tools.browser_wait_for.execute({
      text: 'Loading complete',
    });

    expect(mockSDK.waitFor).toHaveBeenCalledWith({
      time: undefined,
      text: 'Loading complete',
      textGone: undefined,
    });
    expect(result.success).toBe(true);
  });

  it('browser_console_messages should call SDK consoleMessages', async () => {
    (mockSDK.consoleMessages as any).mockResolvedValue({
      result: [{ type: 'log', text: 'Test', timestamp: Date.now() }],
    });

    const tools = createBrowserTools(mockSDK);
    const result = await tools.browser_console_messages.execute({});

    expect(mockSDK.consoleMessages).toHaveBeenCalled();
    expect(result.messages).toHaveLength(1);
  });
});
