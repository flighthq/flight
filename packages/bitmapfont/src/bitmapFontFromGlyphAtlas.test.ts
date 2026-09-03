import { createGlyphAtlas, getGlyphAtlasEntry } from '@flighthq/glyphatlas/contract';
import type { GlyphRasterizerBackend } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { getBitmapFontGlyph, getBitmapFontMetrics } from './bitmapFont';
import { createBitmapFontFromGlyphAtlas } from './bitmapFontFromGlyphAtlas';

function backendProducing(width: number, height: number): GlyphRasterizerBackend {
  return {
    measureMetrics: () => ({ ascent: 12, descent: 3, lineGap: 1 }),
    rasterize: () => ({
      advance: width,
      bearingX: 1,
      bearingY: 2,
      height,
      pixels: new Uint8ClampedArray(width * height * 4),
      width,
    }),
  };
}

describe('createBitmapFontFromGlyphAtlas', () => {
  function bakedFromTwoGlyphs() {
    const atlas = createGlyphAtlas({
      fontFamily: 'mock',
      fontSize: 16,
      height: 64,
      rasterizerBackend: backendProducing(8, 8),
      width: 64,
    });
    getGlyphAtlasEntry(atlas, 65);
    getGlyphAtlasEntry(atlas, 66);
    return { atlas, font: createBitmapFontFromGlyphAtlas(atlas) };
  }

  it('carries every cached glyph across with its rect and pen data', () => {
    const { atlas, font } = bakedFromTwoGlyphs();

    const source = getGlyphAtlasEntry(atlas, 65)!;
    const baked = getBitmapFontGlyph(font, 65)!;

    expect(baked).not.toBeNull();
    expect(baked.x).toBe(source.x);
    expect(baked.y).toBe(source.y);
    expect(baked.width).toBe(source.width);
    expect(baked.advance).toBe(source.advance);
    expect(baked.bearingY).toBe(source.bearingY);
    expect(getBitmapFontGlyph(font, 66)).not.toBeNull();
  });

  it('carries the atlas metrics rather than re-deriving them', () => {
    const { font } = bakedFromTwoGlyphs();
    expect(getBitmapFontMetrics(font)).toEqual({ ascent: 12, descent: 3, lineGap: 1 });
  });

  it('builds a single page whose texture is sourced from the atlas bitmap', () => {
    const { atlas, font } = bakedFromTwoGlyphs();

    expect(font.pages).toHaveLength(1);
    expect(font.pages[0]!.texture!.source).toBe(atlas.runtime.bitmap);
  });

  it('does not gain glyphs rasterized into the atlas after the bake', () => {
    const { atlas, font } = bakedFromTwoGlyphs();

    getGlyphAtlasEntry(atlas, 67);

    expect(getBitmapFontGlyph(font, 67)).toBeNull();
  });

  it('bakes an empty atlas to a font with no glyphs rather than failing', () => {
    const atlas = createGlyphAtlas({
      fontFamily: 'mock',
      fontSize: 16,
      height: 64,
      rasterizerBackend: backendProducing(8, 8),
      width: 64,
    });

    const font = createBitmapFontFromGlyphAtlas(atlas);

    expect(getBitmapFontGlyph(font, 65)).toBeNull();
    expect(font.pages).toHaveLength(1);
  });
});
