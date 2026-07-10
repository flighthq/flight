import { createTextureAtlas } from '@flighthq/textureatlas';
import type { BitmapFontData } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { createBitmapFont, getBitmapFontGlyph } from './bitmapFont';
import { createGlyphSourceFromBitmapFont } from './glyphSource';

describe('createGlyphSourceFromBitmapFont', () => {
  it('exposes the font as a GlyphSource whose lookups match the font', () => {
    const font = createBitmapFont(sampleFontData());
    const source = createGlyphSourceFromBitmapFont(font);

    expect(source.getGlyphEntry(65)).toBe(getBitmapFontGlyph(font, 65));
    expect(source.getGlyphEntry(0x1f600)).toBeNull();
    expect(source.getGlyphKerning(65, 86)).toBe(-2);
    expect(source.getGlyphKerning(86, 65)).toBe(0);
    expect(source.getGlyphMetrics()).toEqual({ ascent: 8, descent: 2, lineGap: 1 });
  });
});

function sampleFontData(): BitmapFontData {
  return {
    atlas: createTextureAtlas(),
    glyphs: [
      { advance: 9, bearingX: 1, bearingY: 8, codepoint: 65, height: 8, width: 7, x: 0, y: 0 },
      { advance: 8, bearingX: 1, bearingY: 8, codepoint: 86, height: 8, width: 6, x: 16, y: 0 },
    ],
    kerning: [{ amount: -2, left: 65, right: 86 }],
    metrics: { ascent: 8, descent: 2, lineGap: 1 },
  };
}
