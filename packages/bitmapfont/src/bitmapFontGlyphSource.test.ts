import { createTextureAtlas, createTextureAtlasFromImageResource } from '@flighthq/textureatlas/contract';
import type { BitmapFontData, ImageResource } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { createBitmapFont, getBitmapFontGlyph } from './bitmapFont';
import { createGlyphSourceFromBitmapFont, initializeGlyphSourceFromBitmapFont } from './bitmapFontGlyphSource';

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

  // The static half of the seam: a pre-baked font's pages are authored, so no lookup can relocate a
  // glyph and a consumer that bakes these rects never has to re-bake. Holding the version constant
  // across lookups is what lets `refreshBitmapTextGlyphLayout` cost a static font nothing.
  it('holds the layout version constant, because a pre-baked font never relocates a glyph', () => {
    const font = createBitmapFont(sampleFontData());
    const source = createGlyphSourceFromBitmapFont(font);

    const before = source.getGlyphLayoutVersion();
    source.getGlyphEntry(65);
    source.getGlyphEntry(0x1f600);
    expect(source.getGlyphLayoutVersion()).toBe(before);
  });

  it('pairs page 0 with the font atlas image and has no other page', () => {
    const image = {} as ImageResource;
    const font = createBitmapFont({ ...sampleFontData(), pages: [createTextureAtlasFromImageResource(image)] });
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
      pages: [createTextureAtlasFromImageResource(image0), createTextureAtlasFromImageResource(image1)],
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
describe('initializeGlyphSourceFromBitmapFont', () => {
  it('is the construction initializer of createGlyphSourceFromBitmapFont', () => {
    expect(typeof initializeGlyphSourceFromBitmapFont).toBe('function');
  });
});
