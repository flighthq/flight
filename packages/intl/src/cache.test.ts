import { describe, expect, it, vi } from 'vitest';

import { getCacheKey, getCached } from './cache';

describe('getCached', () => {
  it('builds once per key and reuses the stored value', () => {
    const build = vi.fn(() => ({}));
    const first = getCached('cache-test|reuse', build);
    const second = getCached('cache-test|reuse', build);
    expect(build).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
  });

  it('rebuilds for a different key', () => {
    const build = vi.fn(() => ({}));
    const a = getCached('cache-test|a', build);
    const b = getCached('cache-test|b', build);
    expect(build).toHaveBeenCalledTimes(2);
    expect(b).not.toBe(a);
  });
});

describe('getCacheKey', () => {
  it('serializes a string locale and options into a stable key', () => {
    expect(getCacheKey('number', 'en-US', { style: 'percent' })).toBe('number|en-US|{"style":"percent"}');
  });

  it('joins a locale fallback list', () => {
    expect(getCacheKey('number', ['fr-CA', 'fr'], undefined)).toBe('number|fr-CA,fr|');
  });

  it('separates keys by kind and by options', () => {
    expect(getCacheKey('number', 'en-US', undefined)).not.toBe(getCacheKey('date', 'en-US', undefined));
    expect(getCacheKey('number', 'en-US', { style: 'percent' })).not.toBe(
      getCacheKey('number', 'en-US', { style: 'currency' }),
    );
  });
});
