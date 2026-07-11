import { describe, expect, it } from 'vitest';

import { captureRenderTarget } from './captureRenderTarget';

describe('captureRenderTarget', () => {
  // The programmatic capture entry drives a real page through a Playwright BrowserContext, so it is
  // exercised end to end by the capture:* scripts rather than headlessly here. Assert it is wired.
  it('is a callable single-target capture entry', () => {
    expect(typeof captureRenderTarget).toBe('function');
  });
});
