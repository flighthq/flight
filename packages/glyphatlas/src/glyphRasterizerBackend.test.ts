import type { GlyphRasterizerBackend } from '@flighthq/types';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createStubGlyphRasterizerBackend,
  createWebGlyphRasterizerBackend,
  getGlyphRasterizerBackend,
  setGlyphRasterizerBackend,
} from './glyphRasterizerBackend';

describe('createStubGlyphRasterizerBackend', () => {
  it('emits a non-blank opaque-white box for any codepoint without a font or canvas', () => {
    const backend = createStubGlyphRasterizerBackend();
    const bitmap = backend.rasterize(65, { fontFamily: 'missing-font', fontSize: 20 })!;

    expect(bitmap).not.toBeNull();
    expect(bitmap.width).toBeGreaterThan(0);
    expect(bitmap.height).toBeGreaterThan(0);
    expect(bitmap.pixels.length).toBe(bitmap.width * bitmap.height * 4);
    // Every byte is 255 → solid opaque white, so the atlas blit is provably non-blank.
    expect(bitmap.pixels.every((v) => v === 255)).toBe(true);
  });

  it('sizes the box and advance from the requested fontSize', () => {
    const backend = createStubGlyphRasterizerBackend();
    const small = backend.rasterize(65, { fontFamily: 'x', fontSize: 10 })!;
    const large = backend.rasterize(65, { fontFamily: 'x', fontSize: 40 })!;

    expect(large.width).toBeGreaterThan(small.width);
    expect(large.height).toBeGreaterThan(small.height);
    expect(large.advance).toBeGreaterThan(large.width);
  });

  it('is deterministic — the same codepoint and size give the same box regardless of font', () => {
    const backend = createStubGlyphRasterizerBackend();
    const a = backend.rasterize(66, { fontFamily: 'a', fontSize: 24 })!;
    const b = backend.rasterize(66, { fontFamily: 'b', fontSize: 24 })!;

    expect(a.width).toBe(b.width);
    expect(a.height).toBe(b.height);
    expect(a.advance).toBe(b.advance);
  });
});

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
