import { getBitmapFontGlyph, getBitmapFontKerning, getBitmapFontMetrics } from '@flighthq/bitmapfont';
import { createTextureAtlas } from '@flighthq/textureatlas';
import type { BitmapFont } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { parseBitmapFontFnt } from './bitmapFontFnt';
import { parseBitmapFontJson } from './bitmapFontJson';
import { parseBitmapFontXml } from './bitmapFontXml';

const FNT_JSON = JSON.stringify({
  chars: [
    { chnl: 15, height: 8, id: 65, page: 0, width: 7, x: 0, xadvance: 9, xoffset: 1, y: 0, yoffset: 0 },
    { chnl: 15, height: 8, id: 86, page: 0, width: 6, x: 8, xadvance: 8, xoffset: 0, y: 0, yoffset: 0 },
  ],
  common: { base: 26, lineHeight: 32, pages: 1, scaleH: 64, scaleW: 64 },
  info: { face: 'Test', size: 32 },
  kernings: [{ amount: -2, first: 65, second: 86 }],
  pages: ['test_0.png'],
});

const FNT_TEXT = [
  'common lineHeight=32 base=26 scaleW=64 scaleH=64 pages=1',
  'page id=0 file="test_0.png"',
  'chars count=2',
  'char id=65 x=0 y=0 width=7 height=8 xoffset=1 yoffset=0 xadvance=9 page=0 chnl=15',
  'char id=86 x=8 y=0 width=6 height=8 xoffset=0 yoffset=0 xadvance=8 page=0 chnl=15',
  'kernings count=1',
  'kerning first=65 second=86 amount=-2',
].join('\n');

const FNT_XML = [
  '<font>',
  '  <common lineHeight="32" base="26" scaleW="64" scaleH="64" pages="1"/>',
  '  <pages><page id="0" file="test_0.png"/></pages>',
  '  <chars count="2">',
  '    <char id="65" x="0" y="0" width="7" height="8" xoffset="1" yoffset="0" xadvance="9"/>',
  '    <char id="86" x="8" y="0" width="6" height="8" xoffset="0" yoffset="0" xadvance="8"/>',
  '  </chars>',
  '  <kernings count="1"><kerning first="65" second="86" amount="-2"/></kernings>',
  '</font>',
].join('\n');

describe('parseBitmapFontJson', () => {
  it('parses glyphs, kerning, and line metrics with the resolved atlas', () => {
    const atlas = createTextureAtlas();
    const font = parseBitmapFontJson(FNT_JSON, { resolvePage: () => atlas });
    expect(font).not.toBeNull();

    expect(font!.atlas).toBe(atlas);
    expect(getBitmapFontGlyph(font!, 65)).toEqual({
      advance: 9,
      bearingX: 1,
      bearingY: 0,
      height: 8,
      width: 7,
      x: 0,
      y: 0,
    });
    expect(getBitmapFontGlyph(font!, 86)?.advance).toBe(8);
    expect(getBitmapFontKerning(font!, 65, 86)).toBe(-2);
    expect(getBitmapFontMetrics(font!)).toEqual({ ascent: 26, descent: 6, lineGap: 0 });
  });

  it('reads the sdf/msdf encoding from a distanceField block', () => {
    const withField = JSON.parse(FNT_JSON) as Record<string, unknown>;
    withField.distanceField = { distanceRange: 4, fieldType: 'msdf' };
    const font = parseBitmapFontJson(JSON.stringify(withField), { resolvePage: () => createTextureAtlas() });
    expect(font!.encoding).toBe('msdf');
  });

  it('parses equivalently to the text and XML variants', () => {
    const atlas = createTextureAtlas();
    const resolvePage = () => atlas;
    const fromJson = parseBitmapFontJson(FNT_JSON, { resolvePage })!;
    const fromText = parseBitmapFontFnt(FNT_TEXT, { resolvePage })!;
    const fromXml = parseBitmapFontXml(FNT_XML, { resolvePage })!;

    for (const codepoint of [65, 86]) {
      const glyph = getBitmapFontGlyph(fromJson, codepoint);
      expect(getBitmapFontGlyph(fromText, codepoint)).toEqual(glyph);
      expect(getBitmapFontGlyph(fromXml, codepoint)).toEqual(glyph);
    }
    expectSameKerningAndMetrics(fromText, fromJson);
    expectSameKerningAndMetrics(fromXml, fromJson);
  });

  it('returns null for malformed JSON without throwing', () => {
    expect(parseBitmapFontJson('{ not json', { resolvePage: () => createTextureAtlas() })).toBeNull();
    expect(parseBitmapFontJson('{}', { resolvePage: () => createTextureAtlas() })).toBeNull();
  });

  it('returns null when no resolvePage is supplied', () => {
    expect(parseBitmapFontJson(FNT_JSON)).toBeNull();
  });
});

function expectSameKerningAndMetrics(actual: BitmapFont, expected: BitmapFont): void {
  expect(getBitmapFontKerning(actual, 65, 86)).toBe(getBitmapFontKerning(expected, 65, 86));
  expect(getBitmapFontMetrics(actual)).toEqual(getBitmapFontMetrics(expected));
}
