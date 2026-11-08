import { describe, expect, it } from 'vitest';

import * as native from './pathCompat.native.ts';
import * as pathCompat from './pathCompat.ts';

describe('appendLassoClose', () => {
  it('is hidden behind the generated implementation', () => {
    expect(pathCompat.appendLassoClose).not.toBe(native.appendLassoClose);
  });
});

describe('appendLassoLineTo', () => {
  it('is hidden behind the generated implementation', () => {
    expect(pathCompat.appendLassoLineTo).not.toBe(native.appendLassoLineTo);
  });
});

describe('appendLassoMoveTo', () => {
  it('is hidden behind the generated implementation', () => {
    expect(pathCompat.appendLassoMoveTo).not.toBe(native.appendLassoMoveTo);
  });
});

describe('clearLassoPath', () => {
  it('remains the native fallback', () => {
    expect(pathCompat.clearLassoPath).toBe(native.clearLassoPath);
  });
});

describe('createLassoPath', () => {
  it('is hidden behind the generated implementation', () => {
    expect(pathCompat.createLassoPath).not.toBe(native.createLassoPath);
  });
});
