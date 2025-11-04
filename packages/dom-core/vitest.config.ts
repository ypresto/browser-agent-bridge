import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Run tests in real browser using Playwright
    // This is required for Playwright's accessibility tree code
    browser: {
      enabled: true,
      name: 'chromium',
      provider: 'playwright',
      headless: true,
    },
    globals: true,
  },
});
