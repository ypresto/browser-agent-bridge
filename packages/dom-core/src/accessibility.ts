/**
 * Accessibility tree extraction using axe-core
 * Provides Playwright-MCP compatible accessibility snapshots
 */

import axe from 'axe-core';
import type { AccessibilitySnapshot, AccessibilityElement } from './types.js';

/**
 * Build accessibility tree from current document
 */
export async function buildAccessibilityTree(): Promise<AccessibilitySnapshot> {
  const url = window.location.href;
  const title = document.title;

  // Run axe to get context about the page structure
  await axe.run(document, {
    runOnly: {
      type: 'tag',
      values: ['wcag2a', 'wcag2aa'],
    },
  });

  // Build tree from DOM with element map
  const elementMap = new Map<string, HTMLElement>();
  const elements = extractAccessibleElements(document.body, { current: 0 }, elementMap);

  return {
    url,
    title,
    elements,
    elementMap, // Store actual element references like Playwright-MCP
  };
}

/**
 * Extract accessible elements from a node and its children
 */
function extractAccessibleElements(
  root: HTMLElement,
  refCounter = { current: 0 },
  elementMap: Map<string, HTMLElement>,
): AccessibilityElement[] {
  const elements: AccessibilityElement[] = [];

  // Get all interactive and semantic elements
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT,
    {
      acceptNode(node) {
        const element = node as HTMLElement;
        if (isAccessibleElement(element)) {
          return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_SKIP;
      },
    },
  );

  let currentNode = walker.currentNode as HTMLElement;

  while (currentNode) {
    if (currentNode !== root) {
      const element = buildAccessibilityElement(currentNode, refCounter, elementMap);
      if (element) {
        elements.push(element);
      }
    }
    currentNode = walker.nextNode() as HTMLElement;
  }

  return elements;
}

/**
 * Check if element is visible to users
 */
function isElementVisible(element: HTMLElement): boolean {
  // Check hidden attribute
  if (element.hidden) return false;

  // Get computed styles (more reliable than inline styles)
  const style = window.getComputedStyle(element);

  // Check CSS visibility properties
  if (style.display === 'none') return false;
  if (style.visibility === 'hidden') return false;
  if (parseFloat(style.opacity) === 0) return false;

  // Check dimensions - element must have size to be clickable
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;

  // Check offsetParent - comprehensive visibility check
  // Note: Fixed positioned elements can have null offsetParent but still be visible
  if (element.offsetParent === null && style.position !== 'fixed' && style.position !== 'sticky') {
    return false;
  }

  return true;
}

/**
 * Check if element should be included in accessibility tree
 */
function isAccessibleElement(element: HTMLElement): boolean {
  // Skip invisible elements first (comprehensive check)
  if (!isElementVisible(element)) {
    return false;
  }

  // Include elements with ARIA roles
  if (element.hasAttribute('role')) {
    return true;
  }

  // Include interactive elements
  const interactiveTags = [
    'A',
    'BUTTON',
    'INPUT',
    'SELECT',
    'TEXTAREA',
    'DETAILS',
    'DIALOG',
  ];
  if (interactiveTags.includes(element.tagName)) {
    return true;
  }

  // Include semantic elements
  const semanticTags = [
    'NAV',
    'HEADER',
    'FOOTER',
    'MAIN',
    'ASIDE',
    'SECTION',
    'ARTICLE',
  ];
  if (semanticTags.includes(element.tagName)) {
    return true;
  }

  // Include elements with accessible labels
  if (
    element.hasAttribute('aria-label') ||
    element.hasAttribute('aria-labelledby')
  ) {
    return true;
  }

  return false;
}

/**
 * Build accessibility element from HTML element
 */
function buildAccessibilityElement(
  element: HTMLElement,
  refCounter: { current: number },
  elementMap: Map<string, HTMLElement>,
): AccessibilityElement | null {
  const role = getRole(element);
  const description = getDescription(element);
  const state = getState(element);

  refCounter.current++;
  const ref = `e${refCounter.current}`;

  // Store actual element reference in map (like Playwright-MCP)
  elementMap.set(ref, element);

  const accessibilityElement: AccessibilityElement = {
    role,
    ref,
    description,
  };

  if (state.length > 0) {
    accessibilityElement.state = state;
  }

  return accessibilityElement;
}

/**
 * Get ARIA role or implicit role from element
 */
function getRole(element: HTMLElement): string {
  // Explicit ARIA role
  const ariaRole = element.getAttribute('role');
  if (ariaRole) {
    return ariaRole;
  }

  // Implicit roles based on tag name
  const tagRoleMap: Record<string, string> = {
    A: 'link',
    BUTTON: 'button',
    INPUT: getInputRole(element as HTMLInputElement),
    SELECT: 'combobox',
    TEXTAREA: 'textbox',
    NAV: 'navigation',
    HEADER: 'banner',
    FOOTER: 'contentinfo',
    MAIN: 'main',
    ASIDE: 'complementary',
    SECTION: 'region',
    ARTICLE: 'article',
    DIALOG: 'dialog',
    DETAILS: 'group',
  };

  return tagRoleMap[element.tagName] || 'generic';
}

/**
 * Get role for input element based on type
 */
function getInputRole(input: HTMLInputElement): string {
  const typeRoleMap: Record<string, string> = {
    button: 'button',
    checkbox: 'checkbox',
    radio: 'radio',
    search: 'searchbox',
    text: 'textbox',
    email: 'textbox',
    password: 'textbox',
    number: 'spinbutton',
    range: 'slider',
  };

  return typeRoleMap[input.type] || 'textbox';
}

/**
 * Get human-readable description for element
 */
function getDescription(element: HTMLElement): string {
  // Try aria-label first
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) {
    return ariaLabel;
  }

  // Try aria-labelledby
  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) {
    const labelElement = document.getElementById(labelledBy);
    if (labelElement) {
      return labelElement.textContent?.trim() || '';
    }
  }

  // Try associated label for inputs
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    const label = document.querySelector(`label[for="${element.id}"]`);
    if (label) {
      return label.textContent?.trim() || '';
    }
  }

  // Try placeholder
  const placeholder = element.getAttribute('placeholder');
  if (placeholder) {
    return placeholder;
  }

  // Try text content (limit to first 50 chars)
  const textContent = element.textContent?.trim() || '';
  if (textContent.length > 0) {
    return textContent.substring(0, 50);
  }

  // Try title
  const title = element.getAttribute('title');
  if (title) {
    return title;
  }

  // Fallback to tag name
  return element.tagName.toLowerCase();
}

/**
 * Get accessibility state for element
 */
function getState(element: HTMLElement): string[] {
  const state: string[] = [];

  // Check if focused
  if (document.activeElement === element) {
    state.push('focused');
  }

  // Check disabled state
  if (element instanceof HTMLInputElement || element instanceof HTMLButtonElement) {
    if (element.disabled) {
      state.push('disabled');
    }
  }

  // Check checked state
  if (element instanceof HTMLInputElement) {
    if (element.type === 'checkbox' || element.type === 'radio') {
      if (element.checked) {
        state.push('checked');
      }
    }
  }

  // Check aria-expanded
  const expanded = element.getAttribute('aria-expanded');
  if (expanded === 'true') {
    state.push('expanded');
  } else if (expanded === 'false') {
    state.push('collapsed');
  }

  // Check aria-selected
  const selected = element.getAttribute('aria-selected');
  if (selected === 'true') {
    state.push('selected');
  }

  return state;
}

/**
 * Format accessibility snapshot as YAML string
 */
export function formatAsYAML(snapshot: AccessibilitySnapshot): string {
  const lines: string[] = [];

  lines.push(`- Page URL: ${snapshot.url}`);
  lines.push(`- Page Title: ${snapshot.title}`);
  lines.push('- Page Snapshot:');

  for (const element of snapshot.elements) {
    formatElementAsYAML(element, lines, 2);
  }

  return lines.join('\n');
}

/**
 * Format element and its children as YAML
 */
function formatElementAsYAML(
  element: AccessibilityElement,
  lines: string[],
  indent: number,
): void {
  const spaces = ' '.repeat(indent);
  const stateStr = element.state ? ` [${element.state.join('] [')}]` : '';
  const line = `${spaces}- ${element.role}${stateStr} [ref=${element.ref}]: "${element.description}"`;
  lines.push(line);

  if (element.children) {
    for (const child of element.children) {
      formatElementAsYAML(child, lines, indent + 2);
    }
  }
}
