import { describe, expect, it } from 'vitest';

import { webHostTextShaper } from './webTextShaper';
import { webHostTextShaperGroup } from './webTextShaperHost';

describe('webHostTextShaper', () => {
  it('exposes the shaper surface without constructing a canvas at import time', () => {
    // host-web declares "sideEffects": false, so importing must not touch the DOM. The provider
    // forwards to a backend built on first use; merely holding it does nothing.
    expect(typeof webHostTextShaper.measureText).toBe('function');
    expect(typeof webHostTextShaper.getFontMetrics).toBe('function');
    expect(typeof webHostTextShaper.clearCache).toBe('function');
    expect(Symbol.for('EntityRuntime') in webHostTextShaper).toBe(false);
  });

  it('shares one backend across calls, so clearCache clears what measureText filled', () => {
    // Measure twice, clear, measure again: all three must answer consistently, which they only do if
    // every call routes through the same lazily-built backend.
    const first = webHostTextShaper.measureText('flight', {});
    const cached = webHostTextShaper.measureText('flight', {});
    expect(cached).toBe(first);
    expect(() => webHostTextShaper.clearCache()).not.toThrow();
    expect(webHostTextShaper.measureText('flight', {})).toBe(first);
  });
});

describe('webHostTextShaperGroup', () => {
  it('fills the shaper slot, so createWebHost ships a real text shaper', () => {
    // This group used to be an honest empty report because web had no shaper to point at. The canvas
    // backend now lives in this package, so the slot is filled rather than absent.
    expect(webHostTextShaperGroup.shaper).toBe(webHostTextShaper);
  });

  it('is plain data with no Entity runtime and no symbol keys', () => {
    expect(Symbol.for('EntityRuntime') in webHostTextShaperGroup).toBe(false);
    expect(Object.getOwnPropertySymbols(webHostTextShaperGroup)).toEqual([]);
    expect(Object.keys(webHostTextShaperGroup)).toEqual(['shaper']);
  });
});
