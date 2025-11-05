/**
 * esbuild configuration for Chrome Extension Manifest V3
 * Bundles service worker, content script, and injected script
 */

import * as esbuild from 'esbuild';

const sharedConfig = {
  bundle: true,
  minify: false,
  sourcemap: true,
  target: 'es2020',
  format: 'esm',
};

// Build all extension scripts
await Promise.all([
  // Service Worker (background script)
  esbuild.build({
    ...sharedConfig,
    entryPoints: ['src/service-worker.ts'],
    outfile: 'dist/service-worker.js',
    platform: 'browser',
  }),

  // Content Script (includes dom-core)
  esbuild.build({
    ...sharedConfig,
    entryPoints: ['src/content-script.ts'],
    outfile: 'dist/content-script.js',
    platform: 'browser',
  }),

  // Popup Script
  esbuild.build({
    ...sharedConfig,
    entryPoints: ['src/popup.ts'],
    outfile: 'dist/popup.js',
    platform: 'browser',
  }),
]);

console.log('✅ Extension built successfully');
