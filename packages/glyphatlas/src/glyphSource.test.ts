import type { GlyphRasterizerBackend } from '@flighthq/types';
import { afterEach, describe, expect, it } from 'vitest';

import { createGlyphAtlas } from './glyphAtlas';
import { getGlyphAtlasEntry } from './glyphAtlasEntry';
import { setGlyphRasterizerBackend } from './glyphRasterizerBackend';
import { createGlyphSourceFromGlyphAtlas } from './glyphSource';

describe('createGlyphSourceFromGlyphAtlas', () => {
  afterEach(() => setGlyphRasterizerBackend(null));

  it('exposes the atlas as a GlyphSource that rasterizes on miss', () => {
    const backend: GlyphRasterizerBackend = {
      rasterize: () => ({
        advance: 8,
        bearingX: 1,
        bearingY: 8,
        height: 8,
        pixels: new Uint8ClampedArray(8 * 8 * 4),
        width: 8,
      }),
    };
    setGlyphRasterizerBackend(backend);
    const atlas = createGlyphAtlas({ fontFamily: 'mock', fontSize: 20, height: 128, width: 128 });
    const source = createGlyphSourceFromGlyphAtlas(atlas);

    const entry = source.getGlyphEntry(65);
    expect(entry).not.toBeNull();
    expect(source.getGlyphEntry(65)).toBe(getGlyphAtlasEntry(atlas, 65));
    expect(source.getGlyphKerning(65, 66)).toBe(0);
    expect(source.getGlyphMetrics()).toEqual({ ascent: 16, descent: 4, lineGap: 0 });
  });
});
