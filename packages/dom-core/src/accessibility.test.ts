import { describe, it, expect, beforeEach } from 'vitest';
import { buildAccessibilityTree, formatAsYAML } from './accessibility.js';
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

    const tree = await buildAccessibilityTree();

    expect(tree).toBeDefined();
    expect(tree.url).toBeDefined();
    expect(tree.title).toBeDefined();
    expect(tree.elements.length).toBeGreaterThan(0);
  });

  it('should assign unique refs to elements', async () => {
    document.body.innerHTML = `
      <button>Button 1</button>
      <button>Button 2</button>
      <button>Button 3</button>
    `;

    const tree = await buildAccessibilityTree();

    const refs = tree.elements.map((el) => el.ref);
    // Playwright assigns refs to interactive elements - just check we have refs
    expect(refs.length).toBeGreaterThanOrEqual(3);
    // Check all refs are unique
    expect(new Set(refs).size).toBe(refs.length);
    // Check all refs follow the pattern
    refs.forEach(ref => expect(ref).toMatch(/^e\d+$/));
  });

  it('should extract role and description', async () => {
    document.body.innerHTML = `
      <button>Submit Form</button>
      <input type="text" aria-label="Username" />
      <a href="/home">Home</a>
    `;

    const tree = await buildAccessibilityTree();

    expect(tree.elements.length).toBeGreaterThanOrEqual(3);

    // Find button element
    const button = tree.elements.find(el => el.role === 'button');
    expect(button).toBeDefined();
    expect(button?.description).toContain('Submit');

    // Find textbox element
    const textbox = tree.elements.find(el => el.role === 'textbox');
    expect(textbox).toBeDefined();
    expect(textbox?.description).toContain('Username');

    // Find link element
    const link = tree.elements.find(el => el.role === 'link');
    expect(link).toBeDefined();
    expect(link?.description).toContain('Home');
  });
});

describe('formatAsYAML', () => {
  it('should format snapshot as YAML string', () => {
    const snapshot: AccessibilitySnapshot = {
      url: 'https://example.com',
      title: 'Example Page',
      elements: [
        {
          role: 'button',
          ref: 'e1',
          description: 'Submit Form',
        },
        {
          role: 'textbox',
          state: ['focused'],
          ref: 'e2',
          description: 'Username input',
        },
      ],
    };

    const yaml = formatAsYAML(snapshot);

    // Check basic structure
    expect(yaml).toContain('- Page URL: https://example.com');
    expect(yaml).toContain('- Page Title: Example Page');
    expect(yaml).toContain('- Page Snapshot:');
    // Playwright uses hierarchical YAML format: - button "Submit Form" [ref=e7]
    expect(yaml).toContain('button');
    expect(yaml).toContain('Submit Form');
    expect(yaml).toContain('textbox');
    expect(yaml).toContain('Username');
  });
});
