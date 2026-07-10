import { createTextureAtlas, createTextureAtlasRegion } from '@flighthq/textureatlas';

import {
  addBitmapFontGlyph,
  addBitmapFontKerning,
  createBitmapFont,
  getBitmapFontGlyph,
  getBitmapFontGlyphRegion,
  getBitmapFontKerning,
  measureBitmapFontText,
} from './bitmapFont';

const A = 'A'.codePointAt(0)!; // 65
const V = 'V'.codePointAt(0)!; // 86

describe('addBitmapFontGlyph', () => {
  it('appends a glyph with its placement metrics', () => {
    const font = createBitmapFont();
    addBitmapFontGlyph(font, A, 1, 2, 10);
    expect(font.glyphs).toHaveLength(1);
    expect(font.glyphs[0]).toEqual({ id: A, page: 0, xadvance: 10, xoffset: 1, yoffset: 2 });
  });

  it('defaults page to 0 and honors an explicit page', () => {
    const font = createBitmapFont();
    addBitmapFontGlyph(font, A, 0, 0, 8, 3);
    expect(font.glyphs[0].page).toBe(3);
  });
});

describe('addBitmapFontKerning', () => {
  it('appends a kerning entry for the ordered pair', () => {
    const font = createBitmapFont();
    addBitmapFontKerning(font, A, V, -2);
    expect(font.kernings).toEqual([{ amount: -2, first: A, second: V }]);
  });
});

describe('createBitmapFont', () => {
  it('creates an empty font with zeroed metrics', () => {
    const font = createBitmapFont();
    expect(font.atlas).toBeNull();
    expect(font.face).toBeNull();
    expect(font.glyphs).toEqual([]);
    expect(font.kernings).toEqual([]);
    expect(font.base).toBe(0);
    expect(font.lineHeight).toBe(0);
    expect(font.size).toBe(0);
  });

  it('honors provided fields', () => {
    const font = createBitmapFont({ base: 24, face: 'Arial', lineHeight: 32, size: 32 });
    expect(font.face).toBe('Arial');
    expect(font.base).toBe(24);
    expect(font.lineHeight).toBe(32);
    expect(font.size).toBe(32);
  });
});

describe('getBitmapFontGlyph', () => {
  it('returns the glyph for a code point', () => {
    const font = createBitmapFont();
    addBitmapFontGlyph(font, A, 1, 2, 10);
    expect(getBitmapFontGlyph(font, A)?.xadvance).toBe(10);
  });

  it('returns null for a code point with no glyph', () => {
    const font = createBitmapFont();
    expect(getBitmapFontGlyph(font, A)).toBeNull();
  });
});

describe('getBitmapFontGlyphRegion', () => {
  it('returns the atlas region keyed by the glyph code point', () => {
    const atlas = createTextureAtlas({
      regions: [createTextureAtlasRegion({ id: A, x: 4, y: 8, width: 12, height: 16 })],
    });
    const font = createBitmapFont({ atlas: atlas });
    addBitmapFontGlyph(font, A, 0, 0, 12);
    const region = getBitmapFontGlyphRegion(font, font.glyphs[0]);
    expect(region?.width).toBe(12);
    expect(region?.height).toBe(16);
  });

  it('returns null when the font has no atlas', () => {
    const font = createBitmapFont();
    addBitmapFontGlyph(font, A, 0, 0, 12);
    expect(getBitmapFontGlyphRegion(font, font.glyphs[0])).toBeNull();
  });

  it('returns null when the atlas has no region for the glyph', () => {
    const font = createBitmapFont({ atlas: createTextureAtlas() });
    addBitmapFontGlyph(font, A, 0, 0, 12);
    expect(getBitmapFontGlyphRegion(font, font.glyphs[0])).toBeNull();
  });
});

describe('getBitmapFontKerning', () => {
  it('returns the amount for a known pair', () => {
    const font = createBitmapFont();
    addBitmapFontKerning(font, A, V, -3);
    expect(getBitmapFontKerning(font, A, V)).toBe(-3);
  });

  it('returns 0 for an unknown pair', () => {
    const font = createBitmapFont();
    expect(getBitmapFontKerning(font, A, V)).toBe(0);
  });

  it('is order-sensitive', () => {
    const font = createBitmapFont();
    addBitmapFontKerning(font, A, V, -3);
    expect(getBitmapFontKerning(font, V, A)).toBe(0);
  });
});

describe('measureBitmapFontText', () => {
  it('sums glyph advances', () => {
    const font = createBitmapFont();
    addBitmapFontGlyph(font, A, 0, 0, 10);
    addBitmapFontGlyph(font, V, 0, 0, 12);
    expect(measureBitmapFontText(font, 'AV')).toBe(22);
  });

  it('applies kerning between adjacent pairs', () => {
    const font = createBitmapFont();
    addBitmapFontGlyph(font, A, 0, 0, 10);
    addBitmapFontGlyph(font, V, 0, 0, 12);
    addBitmapFontKerning(font, A, V, -4);
    expect(measureBitmapFontText(font, 'AV')).toBe(18);
  });

  it('ignores missing glyphs', () => {
    const font = createBitmapFont();
    addBitmapFontGlyph(font, A, 0, 0, 10);
    expect(measureBitmapFontText(font, 'AV')).toBe(10);
  });

  it('measures empty text as 0', () => {
    expect(measureBitmapFontText(createBitmapFont(), '')).toBe(0);
  });
});
