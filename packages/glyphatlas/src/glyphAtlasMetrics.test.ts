import { describe, expect, it } from 'vitest';

import { createGlyphAtlas } from './glyphAtlas';
import { getGlyphAtlasKerning, getGlyphAtlasMetrics } from './glyphAtlasMetrics';

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
