/**
 * Vercel AI SDK tools for browser automation
 */

import { tool } from 'ai';
import { z } from 'zod';
import type { ControllerSDK, TabInfo } from '@browser-automator/controller';

/**
 * Create browser automation tools for AI SDK
 * Manages tab state across tool calls within agent session
 */
export function createBrowserTools(sdk: ControllerSDK) {
  // Track current tab for this agent session
  let sessionTabId: number | null = sdk.getCurrentTabId();

  return {
    /**
     * Navigate to a URL
     */
    browser_navigate: tool({
      description: 'Navigate to a URL',
      inputSchema: z.object({
        url: z.string().describe('The URL to navigate to'),
      }),
      execute: async ({ url }) => {
        const result = await sdk.navigate({ url });

        // Store tabId for subsequent operations in this session
        if ('tabId' in result && typeof result.tabId === 'number') {
          sessionTabId = result.tabId;
          sdk.setCurrentTabId(result.tabId);
        }

        return {
          code: result.code,
          pageState: result.pageState,
          tabId: sessionTabId,
        };
      },
    }),

    /**
     * Get accessibility snapshot of current page
     */
    browser_snapshot: tool({
      description: 'Capture accessibility snapshot of the current page, this is better than screenshot',
      inputSchema: z.object({}),
      execute: async () => {
        const snapshot = await sdk.snapshot();

        // Debug logging for troubleshooting
        console.log('[Browser Automation] Snapshot captured');
        console.log('[Browser Automation] Snapshot size:', snapshot.length, 'characters');
        console.log('[Browser Automation] Snapshot preview (first 500 chars):', snapshot.substring(0, 500));

        return {
          snapshot,
          debug: {
            snapshotSize: snapshot.length,
            preview: snapshot.substring(0, 500),
          },
        };
      },
    }),

    /**
     * Click an element
     */
    browser_click: tool({
      description: 'Perform click on a web page',
      inputSchema: z.object({
        element: z.string().describe('Human-readable element description used to obtain permission to interact with the element'),
        ref: z.string().describe('Exact target element reference from the page snapshot'),
        doubleClick: z.boolean().optional().describe('Whether to perform a double click instead of a single click'),
        button: z
          .enum(['left', 'right', 'middle'])
          .optional()
          .describe('Button to click, defaults to left'),
      }),
      execute: async ({ element, ref, doubleClick, button }) => {
        try {
          // Debug logging for troubleshooting
          console.log('[Browser Automation] Click requested');
          console.log('[Browser Automation] Target element:', element);
          console.log('[Browser Automation] Element ref:', ref);
          console.log('[Browser Automation] Double click:', doubleClick || false);
          console.log('[Browser Automation] Button:', button || 'left');

          const params: any = { element, ref };
          if (doubleClick !== undefined) params.doubleClick = doubleClick;
          if (button !== undefined) params.button = button;
          await sdk.click(params);

          console.log('[Browser Automation] Click executed successfully');
          return {
            success: true,
            debug: {
              element,
              ref,
              doubleClick: doubleClick || false,
              button: button || 'left',
            },
          };
        } catch (error) {
          console.error('[Browser Automation] Click failed:', error);
          throw new Error(`Failed to click element: ${error instanceof Error ? error.message : String(error)}`);
        }
      },
    }),

    /**
     * Type text into an input
     */
    browser_type: tool({
      description: 'Type text into editable element',
      inputSchema: z.object({
        element: z.string().describe('Human-readable element description used to obtain permission to interact with the element'),
        ref: z.string().describe('Exact target element reference from the page snapshot'),
        text: z.string().describe('Text to type into the element'),
        submit: z.boolean().optional().describe('Whether to submit entered text (press Enter after)'),
        slowly: z.boolean().optional().describe('Whether to type one character at a time. Useful for triggering key handlers in the page. By default entire text is filled in at once.'),
      }),
      execute: async ({ element, ref, text, submit, slowly }) => {
        try {
          const params: any = { element, ref, text };
          if (submit !== undefined) params.submit = submit;
          if (slowly !== undefined) params.slowly = slowly;
          await sdk.type(params);
          return { success: true };
        } catch (error) {
          throw new Error(`Failed to type text: ${error instanceof Error ? error.message : String(error)}`);
        }
      },
    }),

    /**
     * REMOVED: browser_evaluate tool
     *
     * SECURITY RISK: Arbitrary JavaScript execution is XSS vulnerability
     *
     * If a malicious controller origin is allowed, evaluate() would enable:
     * - Credential theft (steal passwords, session tokens, cookies)
     * - DOM manipulation (inject malicious content)
     * - User impersonation (submit forms, make purchases)
     * - Data exfiltration (read sensitive page data)
     *
     * Even with permission system, evaluate is too dangerous to expose.
     * Use specific tools (click, type, snapshot) instead.
     */

    /**
     * Create a new tab
     */
    browser_tabs_create: tool({
      description: 'Create a new browser tab',
      inputSchema: z.object({
        url: z.string().describe('URL to open in the new tab'),
      }),
      execute: async ({ url }) => {
        const tab = await sdk.tabs.create(url);
        return {
          tabId: tab.id,
          url: tab.url,
          title: tab.title,
        };
      },
    }),

    /**
     * List all tabs
     */
    browser_tabs_list: tool({
      description: 'List all browser tabs',
      inputSchema: z.object({}),
      execute: async () => {
        const tabs = await sdk.tabs.list();
        return {
          tabs: tabs.map((tab: TabInfo) => ({
            id: tab.id,
            url: tab.url,
            title: tab.title,
          })),
        };
      },
    }),

    /**
     * Select a tab
     */
    browser_tabs_select: tool({
      description: 'Select a browser tab by index',
      inputSchema: z.object({
        index: z.number().describe('Tab index to select (0-based)'),
      }),
      execute: async ({ index }) => {
        await sdk.tabs.select(index);
        return { success: true };
      },
    }),

    /**
     * Close a tab
     */
    browser_tabs_close: tool({
      description: 'Close a browser tab',
      inputSchema: z.object({
        index: z.number().optional().describe('Tab index to close (0-based), or current tab if omitted'),
      }),
      execute: async ({ index }) => {
        await sdk.tabs.close(index);
        return { success: true };
      },
    }),

    /**
     * Wait for condition
     */
    browser_wait_for: tool({
      description: 'Wait for text to appear or disappear or a specified time to pass',
      inputSchema: z.object({
        time: z.number().optional().describe('The time to wait in seconds'),
        text: z.string().optional().describe('The text to wait for'),
        textGone: z.string().optional().describe('The text to wait for to disappear'),
      }),
      execute: async ({ time, text, textGone }) => {
        const params: any = {};
        if (time !== undefined) params.time = time;
        if (text !== undefined) params.text = text;
        if (textGone !== undefined) params.textGone = textGone;
        await sdk.waitFor(params);
        return { success: true };
      },
    }),

    /**
     * Get console messages
     */
    browser_console_messages: tool({
      description: 'Returns all console messages',
      inputSchema: z.object({
        onlyErrors: z.boolean().optional().describe('Only return error messages'),
      }),
      execute: async ({ onlyErrors }) => {
        const params: any = {};
        if (onlyErrors !== undefined) params.onlyErrors = onlyErrors;
        const result = await sdk.consoleMessages(params);
        return {
          messages: result.result,
        };
      },
    }),
  };
}
