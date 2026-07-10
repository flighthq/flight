import { describe, expect, it } from 'vitest';

import { launchBrowser } from './captureBrowser';

describe('launchBrowser', () => {
  // Launching headless Chromium requires the Playwright browser binaries and is exercised end to end by
  // the capture:* scripts; a headless unit run cannot drive a real browser. Assert the lazy-Playwright
  // entry point is wired without launching.
  it('is a callable browser launcher', () => {
    expect(typeof launchBrowser).toBe('function');
  });
});
