import type { GlyphMetrics, GlyphRasterizerBackend } from '@flighthq/types/contract';
import { afterEach, describe, expect, it } from 'vitest';

import { createGlyphAtlas, deriveGlyphMetricsFromFontSize } from './glyphAtlas';
import { getGlyphAtlasKerning, getGlyphAtlasMetrics } from './glyphAtlasMetrics';
import { setGlyphRasterizerBackend } from './glyphRasterizerBackend';

describe('getGlyphAtlasKerning', () => {
  it('is zero in the first build (no pair kerning source)', () => {
    const atlas = createGlyphAtlas({ fontFamily: 'mock', fontSize: 16, height: 64, width: 64 });
    expect(getGlyphAtlasKerning(atlas, 65, 66)).toBe(0);
  });
});

describe('getGlyphAtlasMetrics', () => {
  it('returns the font-size-derived line metrics', () => {
    const atlas = createGlyphAtlas({ fontFamily: 'mock', fontSize: 20, height: 64, width: 64 });
    expect(getGlyphAtlasMetrics(atlas)).toEqual({ ascent: 16, descent: 4, lineGap: 0 });
  });
});

describe('getGlyphAtlasMetrics from a measuring backend', () => {
  afterEach(() => setGlyphRasterizerBackend(null));

  function backendWith(measured: GlyphMetrics | null): GlyphRasterizerBackend {
    return {
      measureMetrics: () => measured,
      rasterize: () => null,
    };
  }

  // The heuristic's 0.8/0.2 split is a Latin-typical guess; a backend that can measure the font should
  // win, which is the whole point of the seam.
  it('reports the backend measurement when one is available', () => {
    setGlyphRasterizerBackend(backendWith({ ascent: 13.5, descent: 3.25, lineGap: 0 }));

    const atlas = createGlyphAtlas({ fontFamily: 'mock', fontSize: 20, height: 64, width: 64 });

    expect(getGlyphAtlasMetrics(atlas)).toEqual({ ascent: 13.5, descent: 3.25, lineGap: 0 });
  });

  it('falls back to the font-size heuristic when the backend declines to measure', () => {
    setGlyphRasterizerBackend(backendWith(null));

    const atlas = createGlyphAtlas({ fontFamily: 'mock', fontSize: 20, height: 64, width: 64 });

    expect(getGlyphAtlasMetrics(atlas)).toEqual(deriveGlyphMetricsFromFontSize(20));
  });

  // Optional on the seam, so a backend written before it exists stays valid.
  it('falls back when the backend does not implement measurement at all', () => {
    setGlyphRasterizerBackend({ rasterize: () => null });

    const atlas = createGlyphAtlas({ fontFamily: 'mock', fontSize: 20, height: 64, width: 64 });

    expect(getGlyphAtlasMetrics(atlas)).toEqual(deriveGlyphMetricsFromFontSize(20));
  });
});
