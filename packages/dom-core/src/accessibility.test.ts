import { describe, it, expect, beforeEach } from 'vitest';
import { buildAccessibilityTree } from './accessibility.js';
import type { AccessibilitySnapshot } from './types.js';

describe('buildAccessibilityTree', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('should build accessibility tree from simple DOM', async () => {
    document.body.innerHTML = `
      <button>Click me</button>
      <input type="text" placeholder="Enter text" />
    `;

  const snapshot = await buildAccessibilityTree();
  expect(snapshot).toBeDefined();
  expect(snapshot.yaml).toContain('- Page URL:');
  expect(snapshot.yaml).toContain('- Page Title:');
  expect(snapshot.yaml).toContain('- Page Snapshot:');
  });

  it('should assign unique refs to elements', async () => {
    document.body.innerHTML = `
      <button>Button 1</button>
      <button>Button 2</button>
      <button>Button 3</button>
    `;

  const snapshot = await buildAccessibilityTree();
  // Check for at least three refs in YAML output
  const refMatches = snapshot.yaml.match(/\[ref=e\d+\]/g) || [];
  expect(refMatches.length).toBeGreaterThanOrEqual(3);
  // Check all refs are unique
  expect(new Set(refMatches).size).toBe(refMatches.length);
  });

  it('should extract role and description', async () => {
    document.body.innerHTML = `
      <button>Submit Form</button>
      <input type="text" aria-label="Username" />
      <a href="/home">Home</a>
    `;

  const snapshot = await buildAccessibilityTree();
  expect(snapshot.yaml).toContain('button');
  expect(snapshot.yaml).toMatch(/button.*Submit/);
  expect(snapshot.yaml).toContain('textbox');
  expect(snapshot.yaml).toContain('Username');
  expect(snapshot.yaml).toContain('link');
  expect(snapshot.yaml).toContain('Home');
  });

    it('should filter out invisible elements', async () => {
      document.body.innerHTML = `
        <button id="visible-btn">Visible Button</button>
        <button id="hidden-btn" style="display:none">CSS Hidden</button>
        <button id="aria-hidden-btn" aria-hidden="true">ARIA Hidden Button</button>
        <button id="vis-hidden-btn" style="visibility:hidden">Visibility Hidden</button>
      `;

  const snapshot = await buildAccessibilityTree();
  expect(snapshot.yaml).toContain('Visible Button');
  expect(snapshot.yaml).not.toContain('CSS Hidden');
  // Note: ARIA Hidden Button is included because it's visually visible
  // In AI mode (visibility: 'ariaOrVisible'), Playwright includes elements that are
  // either accessible to screen readers OR visually visible
  expect(snapshot.yaml).toContain('ARIA Hidden Button');
  expect(snapshot.yaml).not.toContain('Visibility Hidden');
    });
});
