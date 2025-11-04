/**
 * Accessibility tree extraction using Playwright's implementation
 * Provides W3C ARIA 1.2 compliant accessibility snapshots
 */

import { generateAriaTree, renderAriaTree } from './playwright/ariaSnapshot.js';
import type { AccessibilitySnapshot, AccessibilityElement } from './types.js';

/**
 * Build accessibility tree from current document using Playwright's implementation
 */
export async function buildAccessibilityTree(): Promise<AccessibilitySnapshot> {
  const url = window.location.href;
  const title = document.title;

  // Generate Playwright ARIA tree with AI mode options
  const ariaSnapshot = generateAriaTree(document.body, {
    mode: 'ai', // AI-optimized mode with interactable refs
  });

  // Build element map from Playwright's elements map
  const elementMap = new Map<string, HTMLElement>();
  for (const [ref, element] of ariaSnapshot.elements.entries()) {
    if (element instanceof HTMLElement) {
      elementMap.set(ref, element);
    }
  }

  // Convert Playwright's tree to our flat element list format
  const elements = flattenAriaTree(ariaSnapshot.root);

  return {
    url,
    title,
    elements,
    elementMap,
  };
}

/**
 * Flatten Playwright's hierarchical ARIA tree into flat element list
 */
function flattenAriaTree(node: any, elements: AccessibilityElement[] = []): AccessibilityElement[] {
  // Skip fragment nodes (internal Playwright nodes)
  if (node.role === 'fragment') {
    if (node.children) {
      for (const child of node.children) {
        if (typeof child !== 'string') {
          flattenAriaTree(child, elements);
        }
      }
    }
    return elements;
  }

  // Build our AccessibilityElement from Playwright's AriaNode
  const element: AccessibilityElement = {
    role: node.role,
    ref: node.ref || '',
    description: node.name || '',
  };

  // Add state if present
  const state: string[] = [];
  if (node.checked === 'checked') state.push('checked');
  if (node.pressed === 'pressed') state.push('pressed');
  if (node.expanded === 'expanded') state.push('expanded');
  if (node.selected === 'selected') state.push('selected');
  if (node.disabled) state.push('disabled');
  if (node.level !== undefined) state.push(`level-${node.level}`);

  if (state.length > 0) {
    element.state = state;
  }

  // Only add elements with refs (interactable elements in AI mode)
  if (node.ref) {
    elements.push(element);
  }

  // Recursively process children
  if (node.children) {
    for (const child of node.children) {
      if (typeof child !== 'string') {
        flattenAriaTree(child, elements);
      }
    }
  }

  return elements;
}

/**
 * Format accessibility snapshot as YAML string using Playwright's renderer
 */
export function formatAsYAML(snapshot: AccessibilitySnapshot): string {
  // Regenerate Playwright tree for rendering
  const ariaSnapshot = generateAriaTree(document.body, {
    mode: 'ai',
  });

  // Use Playwright's native YAML renderer
  const yamlTree = renderAriaTree(ariaSnapshot, { mode: 'ai' });

  // Add our metadata
  const lines: string[] = [];
  lines.push(`- Page URL: ${snapshot.url}`);
  lines.push(`- Page Title: ${snapshot.title}`);
  lines.push('- Page Snapshot:');

  // Indent the Playwright tree output
  const treeLines = yamlTree.split('\n');
  for (const line of treeLines) {
    if (line.trim()) {
      lines.push(`  ${line}`);
    }
  }

  return lines.join('\n');
}
