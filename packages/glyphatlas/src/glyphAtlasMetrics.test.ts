import type { GlyphMetrics, GlyphRasterizerBackend } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { createGlyphAtlas, deriveGlyphMetricsFromFontSize } from './glyphAtlas';
import { getGlyphAtlasKerning, getGlyphAtlasMetrics } from './glyphAtlasMetrics';

const defaultBackend: GlyphRasterizerBackend = { rasterize: () => null };

describe('getGlyphAtlasKerning', () => {
  it('is zero in the first build (no pair kerning source)', () => {
    const atlas = createGlyphAtlas({
      fontFamily: 'mock',
      fontSize: 16,
      height: 64,
      rasterizerBackend: defaultBackend,
      width: 64,
    });
    expect(getGlyphAtlasKerning(atlas, 65, 66)).toBe(0);
  });
});

describe('getGlyphAtlasMetrics', () => {
  it('returns the font-size-derived line metrics', () => {
    const atlas = createGlyphAtlas({
      fontFamily: 'mock',
      fontSize: 20,
      height: 64,
      rasterizerBackend: defaultBackend,
      width: 64,
    });
    expect(getGlyphAtlasMetrics(atlas)).toEqual({ ascent: 16, descent: 4, lineGap: 0 });
  });
});

describe('getGlyphAtlasMetrics from a measuring backend', () => {
  function backendWith(measured: GlyphMetrics | null): GlyphRasterizerBackend {
    return {
      measureMetrics: () => measured,
      rasterize: () => null,
    };
  }

  it('reports the backend measurement when one is available', () => {
    const atlas = createGlyphAtlas({
      fontFamily: 'mock',
      fontSize: 20,
      height: 64,
      rasterizerBackend: backendWith({ ascent: 13.5, descent: 3.25, lineGap: 0 }),
      width: 64,
    });

    expect(getGlyphAtlasMetrics(atlas)).toEqual({ ascent: 13.5, descent: 3.25, lineGap: 0 });
  });

  it('falls back to the font-size heuristic when the backend declines to measure', () => {
    const atlas = createGlyphAtlas({
      fontFamily: 'mock',
      fontSize: 20,
      height: 64,
      rasterizerBackend: backendWith(null),
      width: 64,
    });

    expect(getGlyphAtlasMetrics(atlas)).toEqual(deriveGlyphMetricsFromFontSize(20));
  });

  it('falls back when the backend does not implement measurement at all', () => {
    const atlas = createGlyphAtlas({
      fontFamily: 'mock',
      fontSize: 20,
      height: 64,
      rasterizerBackend: { rasterize: () => null },
      width: 64,
    });

    expect(getGlyphAtlasMetrics(atlas)).toEqual(deriveGlyphMetricsFromFontSize(20));
  });
});
