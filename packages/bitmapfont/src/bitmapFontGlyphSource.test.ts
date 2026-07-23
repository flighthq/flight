import { createTextureAtlas } from '@flighthq/textureatlas';
import type { BitmapFontData, ImageResource } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { createBitmapFont, getBitmapFontGlyph } from './bitmapFont';
import { createGlyphSourceFromBitmapFont } from './bitmapFontGlyphSource';

describe('createGlyphSourceFromBitmapFont', () => {
  it('exposes the font as a GlyphSource whose lookups match the font', () => {
    const font = createBitmapFont(sampleFontData());
    const source = createGlyphSourceFromBitmapFont(font);

    expect(source.getGlyphEntry(65)).toBe(getBitmapFontGlyph(font, 65));
    expect(source.getGlyphEntry(65)!.page).toBe(0);
    expect(source.getGlyphEntry(0x1f600)).toBeNull();
    expect(source.getGlyphKerning(65, 86)).toBe(-2);
    expect(source.getGlyphKerning(86, 65)).toBe(0);
    expect(source.getGlyphMetrics()).toEqual({ ascent: 8, descent: 2, lineGap: 1 });
  });

  it('pairs page 0 with the font atlas image and has no other page', () => {
    const image = {} as ImageResource;
    const font = createBitmapFont({ ...sampleFontData(), pages: [createTextureAtlas({ image })] });
    const source = createGlyphSourceFromBitmapFont(font);

    expect(source.getGlyphAtlasImage(0)).toBe(image);
    expect(source.getGlyphAtlasImage()).toBe(image);
    expect(source.getGlyphAtlasImage(1)).toBeNull();
  });

  it('resolves each page image of a multi-page font', () => {
    const image0 = {} as ImageResource;
    const image1 = {} as ImageResource;
    const font = createBitmapFont({
      ...sampleFontData(),
      pages: [createTextureAtlas({ image: image0 }), createTextureAtlas({ image: image1 })],
    });
    const source = createGlyphSourceFromBitmapFont(font);

    expect(source.getGlyphAtlasImage(0)).toBe(image0);
    expect(source.getGlyphAtlasImage(1)).toBe(image1);
    expect(source.getGlyphAtlasImage(2)).toBeNull();
  });
});

function sampleFontData(): BitmapFontData {
  return {
    glyphs: [
      { advance: 9, bearingX: 1, bearingY: 8, codepoint: 65, height: 8, width: 7, x: 0, y: 0 },
      { advance: 8, bearingX: 1, bearingY: 8, codepoint: 86, height: 8, width: 6, x: 16, y: 0 },
    ],
    kerning: [{ amount: -2, left: 65, right: 86 }],
    metrics: { ascent: 8, descent: 2, lineGap: 1 },
    pages: [createTextureAtlas()],
  };
}
