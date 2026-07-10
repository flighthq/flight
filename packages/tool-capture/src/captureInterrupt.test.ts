import { describe, expect, it } from 'vitest';

import { installAbortHandler, isBrowserClosedError } from './captureInterrupt';

describe('installAbortHandler', () => {
  it('returns a getter that is false before any interrupt', () => {
    const isAborted = installAbortHandler();
    expect(typeof isAborted).toBe('function');
    expect(isAborted()).toBe(false);
  });

  it('is idempotent — repeated calls return a working getter', () => {
    expect(installAbortHandler()()).toBe(false);
    expect(installAbortHandler()()).toBe(false);
  });
});

describe('isBrowserClosedError', () => {
  it('recognizes Playwright teardown rejections', () => {
    expect(isBrowserClosedError(new Error('Target page, context or browser has been closed'))).toBe(true);
    expect(isBrowserClosedError(new Error('Browser has been closed'))).toBe(true);
    expect(isBrowserClosedError(new Error('Target crashed'))).toBe(true);
  });

  it('does not flag a genuine render error or a non-error value', () => {
    expect(isBrowserClosedError(new Error('blank render — coverage below threshold'))).toBe(false);
    expect(isBrowserClosedError('some string')).toBe(false);
  });
});
