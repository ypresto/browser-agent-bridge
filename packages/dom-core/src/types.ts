/**
 * Type definitions for @browser-automator/dom-core
 * Playwright-MCP compatible interfaces
 */

// Accessibility snapshot format (YAML-compatible structure)
export interface AccessibilitySnapshot {
  url: string;
  title: string;
  yaml: string; // YAML-formatted accessibility tree from Playwright
  elementMap?: Map<string, HTMLElement>; // Internal map: ref -> actual DOM element
}

export interface AccessibilityElement {
  role: string; // e.g., "button", "textbox", "generic"
  state?: string[]; // e.g., ["active", "focused"]
  ref: string; // e.g., "e1", "e2", "e3"
  description: string; // Human-readable description
  children?: AccessibilityElement[];
}

// Element targeting (dual targeting like Playwright-MCP)
export interface ElementTarget {
  element: string; // Human-readable description
  ref: string; // Exact reference from snapshot (e.g., "e1")
}

// Tool response structure
export interface ToolResponse<T = any> {
  code?: string; // Playwright-like code description
  pageState?: string; // YAML-formatted accessibility snapshot
  result?: T; // Generic result data
  consoleMessages?: ConsoleMessage[];
  isError?: boolean;
  error?: string;
}

export interface ConsoleMessage {
  type: 'log' | 'info' | 'warn' | 'error' | 'debug';
  text: string;
  timestamp: number;
}

export interface NetworkRequest {
  url: string;
  method: string;
  status: number;
  timestamp: number;
}

// Navigation parameters
export interface NavigateParams {
  url: string;
}

// Click parameters
export interface ClickParams extends ElementTarget {
  doubleClick?: boolean;
  button?: 'left' | 'right' | 'middle';
  modifiers?: string[];
}

// Type parameters
export interface TypeParams extends ElementTarget {
  text: string;
  submit?: boolean;
  slowly?: boolean;
}

// Fill form parameters
export interface FillFormParams {
  fields: Array<ElementTarget & { value: string }>;
}

// Select option parameters
export interface SelectOptionParams extends ElementTarget {
  values: string[];
}

// Drag parameters
export interface DragParams {
  startElement: string;
  startRef: string;
  endElement: string;
  endRef: string;
}

// Press key parameters
export interface PressKeyParams {
  key: string;
}

// Evaluate parameters
export interface EvaluateParams {
  function: string;
  element?: string;
  ref?: string;
}

// Wait parameters
export interface WaitParams {
  time?: number;
  text?: string;
  textGone?: string;
}

// Console messages parameters
export interface ConsoleMessagesParams {
  onlyErrors?: boolean;
}

// Screenshot parameters
export interface ScreenshotParams {
  type?: 'png' | 'jpeg';
  filename?: string;
  element?: string;
  ref?: string;
  fullPage?: boolean;
}

/**
 * The main interface that dom-core implements
 * Playwright-MCP compatible tools
 */
export interface DomCoreTools {
  // Navigation
  navigate(params: NavigateParams): Promise<ToolResponse>;
  navigateBack(): Promise<ToolResponse>;

  // Page state
  snapshot(): Promise<string>; // Returns YAML-formatted snapshot

  // Interaction
  click(params: ClickParams): Promise<void>;
  type(params: TypeParams): Promise<void>;
  fillForm(params: FillFormParams): Promise<void>;
  selectOption(params: SelectOptionParams): Promise<void>;
  hover(params: ElementTarget): Promise<void>;
  drag(params: DragParams): Promise<void>;
  pressKey(params: PressKeyParams): Promise<void>;

  // Evaluation
  evaluate<T = any>(params: EvaluateParams): Promise<ToolResponse<T>>;

  // Waiting
  waitFor(params: WaitParams): Promise<void>;

  // Observability
  consoleMessages(
    params?: ConsoleMessagesParams,
  ): Promise<ToolResponse<ConsoleMessage[]>>;
  networkRequests(): Promise<ToolResponse<NetworkRequest[]>>;

  // Screenshot
  takeScreenshot(params?: ScreenshotParams): Promise<Blob>;
}
