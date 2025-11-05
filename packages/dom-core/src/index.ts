/**
 * @browser-agent-bridge/dom-core
 * Playwright-MCP compatible DOM automation tools
 */

export { DomCore } from './dom-core.js';
export { buildAccessibilityTree, formatAsYAML } from './accessibility.js';
export type {
  DomCoreTools,
  AccessibilitySnapshot,
  AccessibilityElement,
  ElementTarget,
  ToolResponse,
  ConsoleMessage,
  NetworkRequest,
  NavigateParams,
  ClickParams,
  TypeParams,
  FillFormParams,
  SelectOptionParams,
  DragParams,
  PressKeyParams,
  EvaluateParams,
  WaitParams,
  ConsoleMessagesParams,
  ScreenshotParams,
} from './types.js';
