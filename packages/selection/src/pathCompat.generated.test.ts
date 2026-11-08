import { describe, expect, it } from 'vitest';

import * as generated from './pathCompat.generated.ts';
import * as pathCompat from './pathCompat.ts';

describe('appendLassoClose', () => {
  it('is routed through the generated implementation', () => {
    expect(pathCompat.appendLassoClose).toBe(generated.appendLassoClose);
  });
});

describe('appendLassoLineTo', () => {
  it('is routed through the generated implementation', () => {
    expect(pathCompat.appendLassoLineTo).toBe(generated.appendLassoLineTo);
  });
});

describe('appendLassoMoveTo', () => {
  it('is routed through the generated implementation', () => {
    expect(pathCompat.appendLassoMoveTo).toBe(generated.appendLassoMoveTo);
  });
});

describe('createLassoPath', () => {
  it('is routed through the generated implementation', () => {
    expect(pathCompat.createLassoPath).toBe(generated.createLassoPath);
  });
});
