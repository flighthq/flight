import { createTextureAtlas } from '@flighthq/textureatlas';
import type { BitmapFontData } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import {
  createBitmapFont,
  getBitmapFontAtlas,
  getBitmapFontGlyph,
  getBitmapFontKerning,
  getBitmapFontMetrics,
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
      width: 7,
      x: 0,
      y: 0,
    });
  });

  it('defaults encoding to raster and carries an explicit encoding', () => {
    expect(createBitmapFont(sampleFontData()).encoding).toBe('raster');
    expect(createBitmapFont({ ...sampleFontData(), encoding: 'msdf' }).encoding).toBe('msdf');
  });
});

describe('getBitmapFontAtlas', () => {
  it('returns the same atlas reference passed to the constructor', () => {
    const atlas = createTextureAtlas();
    const font = createBitmapFont({ ...sampleFontData(), atlas });

    expect(getBitmapFontAtlas(font)).toBe(atlas);
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

function sampleFontData(): BitmapFontData {
  return {
    atlas: createTextureAtlas(),
    glyphs: [
      { advance: 9, bearingX: 1, bearingY: 8, codepoint: 65, height: 8, width: 7, x: 0, y: 0 },
      { advance: 10, bearingX: 1, bearingY: 8, codepoint: 66, height: 8, width: 7, x: 8, y: 0 },
      { advance: 8, bearingX: 1, bearingY: 8, codepoint: 86, height: 8, width: 6, x: 16, y: 0 },
    ],
    kerning: [{ amount: -2, left: 65, right: 86 }],
    metrics: { ascent: 8, descent: 2, lineGap: 1 },
  };
}
