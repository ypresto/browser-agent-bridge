# ADR 0001: Accessibility Tree Implementation

**Date**: 2025-11-04
**Status**: Accepted
**Decision Makers**: Development Team
**Context**: Browser automation requires accessibility tree for element identification and interaction

---

## Context and Problem Statement

Browser Automator needs to provide accessibility tree snapshots for AI agents to understand page structure and identify interactive elements. The tree must:

- Accurately represent page accessibility semantics (ARIA roles, names, states)
- Filter invisible/hidden elements properly
- Be fast enough for real-time automation
- Work in Chrome extension content script context
- Provide element references for click/type operations

**Key Question**: What approach should we use to implement the accessibility tree?

---

## Decision Drivers

1. **Accuracy**: W3C ARIA specification compliance
2. **Performance**: Real-time automation (< 1 second for typical pages)
3. **Bundle Size**: Chrome extension size constraints
4. **Maintainability**: Avoid hand-crafting complex specifications
5. **Compatibility**: Works in content script (no browser automation APIs)
6. **Element References**: Bidirectional element ↔ ref mapping for interactions

---

## Considered Options

### Option 1: Hand-Crafted Implementation (Initial)

**What we did initially:**
- Custom DOM traversal with basic visibility checks
- Used axe-core for additional validation
- Simple role detection based on tag names

**Pros:**
- ✅ Full control
- ✅ Simple initial implementation

**Cons:**
- ❌ Large bundle size (~500KB with axe-core)
- ❌ Incomplete ARIA spec coverage
- ❌ Basic visibility filtering (missed many edge cases)
- ❌ Hand-crafted accessible name computation
- ❌ High maintenance burden

**Verdict**: ❌ Rejected - Not spec-compliant, too large, incomplete

---

### Option 2: axe-core

**Research findings:**
- axe-core builds VirtualNode tree (flattened DOM), not accessibility tree
- No tree extraction API (confirmed by maintainers)
- Good for visibility utilities, not tree building
- Missing automatic ARIA computation

**Pros:**
- ✅ Excellent visibility filtering
- ✅ Shadow DOM support
- ✅ Good performance

**Cons:**
- ❌ Not an accessibility tree (VirtualNode ≠ a11y tree)
- ❌ No tree extraction API
- ❌ Incomplete ARIA coverage
- ❌ Large bundle size (~100KB)

**Verdict**: ❌ Rejected - Wrong tool for the job

---

### Option 3: dom-accessibility-api

**Research findings:**
- Implements W3C Accessible Name & Description Computation
- 33M weekly downloads, actively maintained
- Spec-compliant name computation

**Pros:**
- ✅ W3C spec-compliant names
- ✅ Small size
- ✅ Well-tested

**Cons:**
- ❌ Only computes names (no tree structure)
- ❌ Doesn't solve our main problem

**Verdict**: ❌ Partial solution only - Could use as utility, but doesn't build trees

---

### Option 4: Chrome DevTools Protocol (CDP)

**Approach:** Use `Accessibility.getFullAXTree()` via `chrome.debugger` API

**Pros:**
- ✅ Real browser accessibility tree
- ✅ Platform-accurate
- ✅ Complete ARIA coverage

**Cons:**
- ❌ Requires chrome.debugger permission (disconnects user's DevTools)
- ❌ Bad UX (users can't debug while extension is active)
- ❌ Complex tree reconstruction from flat node array
- ❌ Chrome-only (no Firefox support)

**Verdict**: ❌ Rejected - Unacceptable UX impact

---

### Option 5: Copy Playwright's Accessibility Tree Code ⭐ **ACCEPTED**

**Approach:** Copy TypeScript source files from Playwright's injected script

**What we get:**
- **ariaSnapshot.ts** (757 lines) - Main tree generation
- **roleUtils.ts** (1,197 lines) - ARIA roles & W3C name algorithm
- **domUtils.ts** (186 lines) - DOM traversal & visibility
- **yaml.ts** (95 lines) - Output formatting
- **stringUtils.ts** (156 lines) - Utilities

**Pros:**
- ✅ **90% smaller bundle**: ~40-50KB vs ~500KB (tree-shaken)
- ✅ **W3C ARIA 1.2 compliant**: Full specification
- ✅ **Production-tested**: Millions of Playwright test runs
- ✅ **Zero external dependencies**: Pure browser APIs
- ✅ **Element references**: Built-in ref mapping
- ✅ **Comprehensive visibility**: All ARIA hiding rules
- ✅ **MIT/Apache 2.0 licensed**: Compatible with our use
- ✅ **TypeScript**: Full type safety
- ✅ **Tree-shakable**: Import only what we need

**Cons:**
- ⚠️ Manual maintenance: Need to track Playwright updates
- ⚠️ Initial integration effort: 5-6 hours
- ⚠️ Testing required: Ensure compatibility

**Mitigations:**
- Copy at stable version, add comprehensive tests
- Document source version for tracking
- Small enough to audit changes manually

---

## Decision

**Status**: ✅ **ACCEPTED**

**We will copy Playwright's accessibility tree implementation** for the following reasons:

1. **Spec Compliance**: Full W3C ARIA 1.2 implementation (vs partial hand-crafted)
2. **Bundle Size**: 90% reduction (40-50KB vs 500KB)
3. **Quality**: Battle-tested in production automation
4. **Maintainability**: Avoid hand-crafting complex specs
5. **Performance**: Optimized with caching
6. **Feasibility**: Research confirms integration is practical

---

## Implementation Plan

### Phase 1: Copy Files (Next Session)

```bash
# 1. Clone Playwright temporarily
git clone --depth 1 https://github.com/microsoft/playwright.git /tmp/playwright

# 2. Create directory
mkdir -p packages/dom-core/src/playwright

# 3. Copy 5 core files
cp /tmp/playwright/packages/playwright-core/src/server/injected/ariaSnapshot.ts packages/dom-core/src/playwright/
cp /tmp/playwright/packages/playwright-core/src/server/injected/roleUtils.ts packages/dom-core/src/playwright/
cp /tmp/playwright/packages/playwright-core/src/server/injected/domUtils.ts packages/dom-core/src/playwright/
cp /tmp/playwright/packages/playwright-core/src/server/injected/yaml.ts packages/dom-core/src/playwright/
cp /tmp/playwright/packages/playwright-core/src/utils/isomorphic/stringUtils.ts packages/dom-core/src/playwright/

# 4. Cleanup
rm -rf /tmp/playwright
```

### Phase 2: Adapt Code

1. Fix import paths (relative imports)
2. Add attribution headers
3. Stub CSS tokenizer (if needed)
4. Add element reference extraction

### Phase 3: Integration

Replace current `accessibility.ts`:
```typescript
import { generateAriaTree, beginAriaCaches, endAriaCaches } from './playwright/ariaSnapshot';

export async function buildAccessibilityTree(): Promise<AccessibilitySnapshot> {
  beginAriaCaches();
  try {
    const yaml = await generateAriaTree(document.body);
    const { elements, elementMap } = parseYamlAndExtractRefs(yaml);
    return {
      url: window.location.href,
      title: document.title,
      elements,
      elementMap,
    };
  } finally {
    endAriaCaches();
  }
}
```

### Phase 4: Testing & Cleanup

- Remove axe-core dependency
- Test visibility filtering
- Test accessible name computation
- Compare with old implementation
- Performance benchmarks

---

## Consequences

### Positive

- ✅ **Spec-compliant implementation** without hand-crafting
- ✅ **90% bundle size reduction** (better performance)
- ✅ **Better accuracy** (W3C algorithm vs hand-crafted)
- ✅ **Production quality** (tested by millions of users)
- ✅ **Easier maintenance** (well-documented code)

### Negative

- ⚠️ **Manual tracking** of Playwright updates needed
- ⚠️ **Integration effort** required (5-6 hours estimated)
- ⚠️ **Testing burden** to ensure compatibility

### Neutral

- Code copied at specific version (Playwright 1.49.1)
- Attribution required in source files
- May need minor modifications for our context

---

## Compliance

### License

**Playwright License**: Apache 2.0
**Our Requirements**:
- ✅ Keep copyright notices
- ✅ Attribute source in each file
- ✅ Document modifications

**Copyright Header Template**:
```typescript
/**
 * Copied from Playwright v1.49.1
 * Source: https://github.com/microsoft/playwright
 * License: Apache 2.0
 *
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0.
 * See: https://github.com/microsoft/playwright/blob/main/LICENSE
 *
 * Modified for browser-automator-mcp:
 * - Fixed import paths to relative
 * - [Document any other changes]
 */
```

---

## Validation

### Success Criteria

After integration, verify:

1. **Accuracy**: Accessible names match browser's accessibility inspector
2. **Visibility**: Hidden elements properly filtered
3. **Performance**: < 500ms for typical pages (1000 elements)
4. **Bundle Size**: < 100KB for content script
5. **Tests**: All existing tests pass + new Playwright-specific tests
6. **Element References**: Click/type operations work correctly

### Validation Method

- Compare snapshots with browser accessibility inspector
- Test on complex pages (Gmail, GitHub, etc.)
- Performance benchmarks
- Bundle size analysis
- Integration tests with existing DomCore

---

## References

### Research Documents

1. `z/2025-11-04-182641-playwright-accessibility-tree-research.md` - Playwright implementation details
2. `z/2025-11-04-160156-axe-core-accessibility-tree-research.md` - axe-core analysis
3. `z/2025-11-04-183959-accessibility-tree-libraries-research.md` - Library survey
4. `z/2025-11-04-190519-playwright-generateAriaTree-research.md` - Integration feasibility

### External Resources

- W3C ARIA 1.2 Specification: https://w3c.github.io/aria/
- W3C Accessible Name Computation: https://w3c.github.io/accname/
- Playwright Source: https://github.com/microsoft/playwright
- Playwright License: https://github.com/microsoft/playwright/blob/main/LICENSE

---

## Timeline

- **Decision Date**: 2025-11-04
- **Implementation Start**: Next session
- **Estimated Completion**: 5-6 hours
- **Review Date**: After implementation

---

## Notes

This decision was made after comprehensive research into:
- Playwright's implementation approach (Firefox Juggler, CDP)
- Available npm libraries (dom-accessibility-api, axe-core)
- AOM (Accessibility Object Model) status
- Alternative browser automation tools

The research confirmed that **no standalone reusable libraries exist** for building accessibility trees in JavaScript. Playwright's code represents the best available implementation that we can adapt for our use case.

**Last Updated**: 2025-11-04
