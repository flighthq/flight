import type { GlyphRasterizerBackend } from '@flighthq/types';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createWebGlyphRasterizerBackend,
  getGlyphRasterizerBackend,
  setGlyphRasterizerBackend,
} from './glyphRasterizerBackend';

describe('createWebGlyphRasterizerBackend', () => {
  it('constructs a backend without a DOM side effect', () => {
    expect(typeof createWebGlyphRasterizerBackend().rasterize).toBe('function');
  });

  it('sentinels to null when no 2D canvas context is available', () => {
    // jsdom's HTMLCanvasElement.getContext('2d') returns null without the canvas package installed,
    // and OffscreenCanvas is undefined, so the web backend has no surface to rasterize onto.
    const backend = createWebGlyphRasterizerBackend();
    expect(backend.rasterize(65, { fontFamily: 'sans-serif', fontSize: 16 })).toBeNull();
  });
});

describe('getGlyphRasterizerBackend', () => {
  afterEach(() => setGlyphRasterizerBackend(null));

  it('lazily defaults to a web backend', () => {
    setGlyphRasterizerBackend(null);
    expect(typeof getGlyphRasterizerBackend().rasterize).toBe('function');
  });

  it('returns the installed backend', () => {
    const backend: GlyphRasterizerBackend = { rasterize: () => null };
    setGlyphRasterizerBackend(backend);
    expect(getGlyphRasterizerBackend()).toBe(backend);
  });
});

describe('setGlyphRasterizerBackend', () => {
  afterEach(() => setGlyphRasterizerBackend(null));

  it('restores the lazy web default when passed null', () => {
    const backend: GlyphRasterizerBackend = { rasterize: () => null };
    setGlyphRasterizerBackend(backend);
    expect(getGlyphRasterizerBackend()).toBe(backend);

    setGlyphRasterizerBackend(null);
    expect(getGlyphRasterizerBackend()).not.toBe(backend);
  });
});
