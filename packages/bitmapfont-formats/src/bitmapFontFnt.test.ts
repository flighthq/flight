import {
  createGlyphSourceFromBitmapFont,
  getBitmapFontGlyph,
  getBitmapFontKerning,
  getBitmapFontMetrics,
  getBitmapFontPage,
} from '@flighthq/bitmapfont';
import { createTextureAtlas } from '@flighthq/textureatlas';
import type { BitmapFontParseOptions, ImageResource, TextureAtlas } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { formatBitmapFontFnt, parseBitmapFontFnt } from './bitmapFontFnt';

const FNT_MULTIPAGE = [
  'info face="Test" size=32 unicode=1',
  'common lineHeight=32 base=26 scaleW=64 scaleH=64 pages=2 packed=0',
  'page id=0 file="test_0.png"',
  'page id=1 file="test_1.png"',
  'chars count=2',
  'char id=65 x=0 y=0 width=7 height=8 xoffset=1 yoffset=0 xadvance=9 page=0 chnl=15',
  'char id=66 x=3 y=0 width=6 height=8 xoffset=0 yoffset=0 xadvance=8 page=1 chnl=15',
].join('\n');

const FNT_TEXT = [
  'info face="Test" size=32 bold=0 italic=0 unicode=1 padding=0,0,0,0 spacing=1,1',
  'common lineHeight=32 base=26 scaleW=64 scaleH=64 pages=1 packed=0',
  'page id=0 file="test_0.png"',
  'chars count=2',
  'char id=65 x=0 y=0 width=7 height=8 xoffset=1 yoffset=5 xadvance=9 page=0 chnl=15',
  'char id=86 x=8 y=0 width=6 height=8 xoffset=0 yoffset=0 xadvance=8 page=0 chnl=15',
  'kernings count=1',
  'kerning first=65 second=86 amount=-2',
].join('\n');

describe('formatBitmapFontFnt', () => {
  it('round-trips a parsed font through parse → format → parse', () => {
    const options = pageOptions();
    const font = parseBitmapFontFnt(FNT_TEXT, options);
    expect(font).not.toBeNull();

    const reparsed = parseBitmapFontFnt(formatBitmapFontFnt(font!), options);
    expect(reparsed).not.toBeNull();

    expect(getBitmapFontGlyph(reparsed!, 65)).toEqual(getBitmapFontGlyph(font!, 65));
    expect(getBitmapFontGlyph(reparsed!, 86)).toEqual(getBitmapFontGlyph(font!, 86));
    expect(getBitmapFontKerning(reparsed!, 65, 86)).toBe(-2);
    expect(getBitmapFontMetrics(reparsed!)).toEqual(getBitmapFontMetrics(font!));
  });

  it('emits an empty page file reference (the atlas is a live resource, not a path)', () => {
    const font = parseBitmapFontFnt(FNT_TEXT, pageOptions());
    expect(formatBitmapFontFnt(font!)).toContain('page id=0 file=""');
  });
});

describe('parseBitmapFontFnt', () => {
  it('parses glyphs, kerning, and line metrics with the resolved atlas', () => {
    const atlas = createTextureAtlas();
    const font = parseBitmapFontFnt(FNT_TEXT, { resolvePage: () => atlas });
    expect(font).not.toBeNull();

    expect(getBitmapFontPage(font!, 0)).toBe(atlas);
    // yoffset=5 with base=26 → bearingY = base - yoffset = 21 (baseline-relative, up-positive).
    expect(getBitmapFontGlyph(font!, 65)).toEqual({
      advance: 9,
      bearingX: 1,
      bearingY: 21,
      height: 8,
      page: 0,
      width: 7,
      x: 0,
      y: 0,
    });
    // yoffset=0 → bearingY = base = 26 (glyph top at the line top, one full ascent above the baseline).
    expect(getBitmapFontGlyph(font!, 86)).toEqual({
      advance: 8,
      bearingX: 0,
      bearingY: 26,
      height: 8,
      page: 0,
      width: 6,
      x: 8,
      y: 0,
    });
    expect(getBitmapFontKerning(font!, 65, 86)).toBe(-2);
    expect(getBitmapFontKerning(font!, 86, 65)).toBe(0);
    expect(getBitmapFontMetrics(font!)).toEqual({ ascent: 26, descent: 6, lineGap: 0 });
  });

  it('passes the parsed page id and file to the resolver', () => {
    const seen: Array<[number, string]> = [];
    parseBitmapFontFnt(FNT_TEXT, {
      resolvePage: (id, file) => {
        seen.push([id, file]);
        return createTextureAtlas();
      },
    });
    expect(seen).toEqual([[0, 'test_0.png']]);
  });

  it('resolves every page of a multi-page font and routes each glyph to the right page image', () => {
    const image0 = {} as ImageResource;
    const image1 = {} as ImageResource;
    const page0 = createTextureAtlas({ image: image0 });
    const page1 = createTextureAtlas({ image: image1 });
    const seen: Array<[number, string]> = [];
    const font = parseBitmapFontFnt(FNT_MULTIPAGE, {
      resolvePage: (id, file) => {
        seen.push([id, file]);
        return id === 0 ? page0 : page1;
      },
    });
    expect(font).not.toBeNull();

    expect(seen).toEqual([
      [0, 'test_0.png'],
      [1, 'test_1.png'],
    ]);
    expect(font!.pages).toEqual([page0, page1]);
    expect(getBitmapFontPage(font!, 0)).toBe(page0);
    expect(getBitmapFontPage(font!, 1)).toBe(page1);
    expect(getBitmapFontGlyph(font!, 65)!.page).toBe(0);
    expect(getBitmapFontGlyph(font!, 66)!.page).toBe(1);

    const source = createGlyphSourceFromBitmapFont(font!);
    expect(source.getGlyphAtlasImage(source.getGlyphEntry(65)!.page)).toBe(image0);
    expect(source.getGlyphAtlasImage(source.getGlyphEntry(66)!.page)).toBe(image1);
  });

  it('returns null for malformed text without throwing', () => {
    expect(parseBitmapFontFnt('this is not a bitmap font', pageOptions())).toBeNull();
  });

  it('returns null when no resolvePage is supplied (the page is dropped)', () => {
    expect(parseBitmapFontFnt(FNT_TEXT)).toBeNull();
  });

  it('returns null when the resolver cannot resolve the page', () => {
    expect(parseBitmapFontFnt(FNT_TEXT, { resolvePage: () => null })).toBeNull();
  });
});

function pageOptions(): BitmapFontParseOptions {
  const atlas: TextureAtlas = createTextureAtlas();
  return { resolvePage: () => atlas };
}
