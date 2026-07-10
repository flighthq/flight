import { createTextureAtlas } from '@flighthq/textureatlas';
import type { BitmapFontData } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import {
  createBitmapFont,
  getBitmapFontGlyph,
  getBitmapFontKerning,
  getBitmapFontMetrics,
  getBitmapFontPage,
  getBitmapFontPages,
} from './bitmapFont';

describe('createBitmapFont', () => {
  it('builds glyph and kerning lookups from plain data', () => {
    const font = createBitmapFont(sampleFontData());

    expect(font.glyphs.size).toBe(3);
    expect(font.kerning.size).toBe(1);
    expect(getBitmapFontGlyph(font, 65)).toEqual({
      advance: 9,
      bearingX: 1,
      bearingY: 8,
      height: 8,
      page: 0,
      width: 7,
      x: 0,
      y: 0,
    });
  });

  it('defaults encoding to raster and carries an explicit encoding', () => {
    expect(createBitmapFont(sampleFontData()).encoding).toBe('raster');
    expect(createBitmapFont({ ...sampleFontData(), encoding: 'msdf' }).encoding).toBe('msdf');
  });

  it('assigns each glyph its declared page and defaults an omitted page to 0', () => {
    const font = createBitmapFont({
      ...sampleFontData(),
      glyphs: [
        { advance: 9, bearingX: 1, bearingY: 8, codepoint: 65, height: 8, page: 1, width: 7, x: 0, y: 0 },
        { advance: 10, bearingX: 1, bearingY: 8, codepoint: 66, height: 8, width: 7, x: 8, y: 0 },
      ],
      pages: [createTextureAtlas(), createTextureAtlas()],
    });

    expect(getBitmapFontGlyph(font, 65)!.page).toBe(1);
    expect(getBitmapFontGlyph(font, 66)!.page).toBe(0);
  });

  it('clamps an out-of-range glyph page to 0 rather than dropping the glyph', () => {
    const font = createBitmapFont({
      ...sampleFontData(),
      glyphs: [{ advance: 9, bearingX: 1, bearingY: 8, codepoint: 65, height: 8, page: 5, width: 7, x: 0, y: 0 }],
    });

    expect(getBitmapFontGlyph(font, 65)!.page).toBe(0);
  });
});

describe('getBitmapFontGlyph', () => {
  it('returns the entry for a present codepoint and null for an absent one', () => {
    const font = createBitmapFont(sampleFontData());

    expect(getBitmapFontGlyph(font, 66)?.advance).toBe(10);
    expect(getBitmapFontGlyph(font, 0x1f600)).toBeNull();
  });

  it('returns a stable entry across repeated lookups (immutable)', () => {
    const font = createBitmapFont(sampleFontData());

    expect(getBitmapFontGlyph(font, 65)).toBe(getBitmapFontGlyph(font, 65));
  });
});

describe('getBitmapFontKerning', () => {
  it('returns the pair amount and 0 for an absent pair', () => {
    const font = createBitmapFont(sampleFontData());

    expect(getBitmapFontKerning(font, 65, 86)).toBe(-2);
    expect(getBitmapFontKerning(font, 86, 65)).toBe(0);
  });
});

describe('getBitmapFontMetrics', () => {
  it('returns the font line metrics', () => {
    const font = createBitmapFont(sampleFontData());

    expect(getBitmapFontMetrics(font)).toEqual({ ascent: 8, descent: 2, lineGap: 1 });
  });
});

describe('getBitmapFontPage', () => {
  it('returns the page atlas by index and null when out of range', () => {
    const page0 = createTextureAtlas();
    const page1 = createTextureAtlas();
    const font = createBitmapFont({ ...sampleFontData(), pages: [page0, page1] });

    expect(getBitmapFontPage(font)).toBe(page0);
    expect(getBitmapFontPage(font, 0)).toBe(page0);
    expect(getBitmapFontPage(font, 1)).toBe(page1);
    expect(getBitmapFontPage(font, 2)).toBeNull();
  });
});

describe('getBitmapFontPages', () => {
  it('returns the page-indexed atlas list', () => {
    const page0 = createTextureAtlas();
    const page1 = createTextureAtlas();
    const font = createBitmapFont({ ...sampleFontData(), pages: [page0, page1] });

    expect(getBitmapFontPages(font)).toEqual([page0, page1]);
  });
});

function sampleFontData(): BitmapFontData {
  return {
    glyphs: [
      { advance: 9, bearingX: 1, bearingY: 8, codepoint: 65, height: 8, width: 7, x: 0, y: 0 },
      { advance: 10, bearingX: 1, bearingY: 8, codepoint: 66, height: 8, width: 7, x: 8, y: 0 },
      { advance: 8, bearingX: 1, bearingY: 8, codepoint: 86, height: 8, width: 6, x: 16, y: 0 },
    ],
    kerning: [{ amount: -2, left: 65, right: 86 }],
    metrics: { ascent: 8, descent: 2, lineGap: 1 },
    pages: [createTextureAtlas()],
  };
}
