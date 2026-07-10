import type { GlyphRasterizerBackend } from '@flighthq/types';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createGlyphAtlas,
  deriveGlyphMetricsFromFontSize,
  disposeGlyphAtlas,
  getGlyphAtlasSurface,
} from './glyphAtlas';
import { getGlyphAtlasEntry } from './glyphAtlasEntry';
import { setGlyphRasterizerBackend } from './glyphRasterizerBackend';

describe('createGlyphAtlas', () => {
  it('allocates an atlas surface at the requested size with an empty cache', () => {
    const atlas = createGlyphAtlas({ fontFamily: 'mock', fontSize: 16, height: 64, width: 128 });
    const surface = getGlyphAtlasSurface(atlas);

    expect(surface.width).toBe(128);
    expect(surface.height).toBe(64);
    expect(atlas.runtime.entries.size).toBe(0);
    expect(atlas.runtime.padding).toBe(1);
  });
});

describe('deriveGlyphMetricsFromFontSize', () => {
  it('splits the em into ascent, descent, and zero line gap', () => {
    expect(deriveGlyphMetricsFromFontSize(10)).toEqual({ ascent: 8, descent: 2, lineGap: 0 });
  });
});

describe('disposeGlyphAtlas', () => {
  afterEach(() => setGlyphRasterizerBackend(null));

  it('clears the cache so a subsequent lookup re-rasterizes', () => {
    const { backend, calls } = createMockRasterizerBackend();
    setGlyphRasterizerBackend(backend);
    const atlas = createGlyphAtlas({ fontFamily: 'mock', fontSize: 16, height: 128, width: 128 });

    getGlyphAtlasEntry(atlas, 65);
    disposeGlyphAtlas(atlas);
    expect(atlas.runtime.entries.size).toBe(0);

    getGlyphAtlasEntry(atlas, 65);
    expect(calls).toEqual([65, 65]);
  });
});

describe('getGlyphAtlasSurface', () => {
  it('returns the atlas backing surface', () => {
    const atlas = createGlyphAtlas({ fontFamily: 'mock', fontSize: 16, height: 32, width: 32 });
    expect(getGlyphAtlasSurface(atlas)).toBe(atlas.runtime.surface);
  });
});

function createMockRasterizerBackend(): { backend: GlyphRasterizerBackend; calls: number[] } {
  const calls: number[] = [];
  const backend: GlyphRasterizerBackend = {
    rasterize(codepoint) {
      calls.push(codepoint);
      return { advance: 8, bearingX: 1, bearingY: 8, height: 8, pixels: new Uint8ClampedArray(8 * 8 * 4), width: 8 };
    },
  };
  return { backend, calls };
}
