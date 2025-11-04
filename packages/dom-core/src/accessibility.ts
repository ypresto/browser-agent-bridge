/**
 * Accessibility tree extraction using Playwright's implementation
 * Provides W3C ARIA 1.2 compliant accessibility snapshots
 */

import { generateAriaTree, renderAriaTree } from './playwright/ariaSnapshot.js';
import type { AccessibilitySnapshot, AccessibilityElement } from './types.js';

/**
 * Build accessibility tree from current document using Playwright's implementation
 * Returns an AccessibilitySnapshot with element map for lookups
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

  // Use Playwright's native YAML renderer for the tree
  const yamlTree = renderAriaTree(ariaSnapshot, { mode: 'ai' });

  // Add our metadata
  const lines: string[] = [];
  lines.push(`- Page URL: ${url}`);
  lines.push(`- Page Title: ${title}`);
  lines.push('- Page Snapshot:');

  // Indent the Playwright tree output
  const treeLines = yamlTree.split('\n');
  for (const line of treeLines) {
    if (line.trim()) {
      lines.push(`  ${line}`);
    }
  }

  const yaml = lines.join('\n');

  return {
    url,
    title,
    yaml,
    elementMap,
  };
}

/**
 * Format accessibility snapshot as YAML string
 * @deprecated Use buildAccessibilityTree() directly as it now returns YAML
 */
export function formatAsYAML(snapshot: AccessibilitySnapshot): string {
  return snapshot.yaml;
  }
