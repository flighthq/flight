import {
  getBitmapFontGlyph,
  getBitmapFontKerning,
  getBitmapFontMetrics,
  getBitmapFontPage,
} from '@flighthq/bitmapfont';
import { createTextureAtlas } from '@flighthq/textureatlas';
import { describe, expect, it } from 'vitest';

import { parseBitmapFontXml } from './bitmapFontXml';

const FNT_XML = [
  '<?xml version="1.0"?>',
  '<font>',
  '  <info face="Test" size="32" unicode="1"/>',
  '  <common lineHeight="32" base="26" scaleW="64" scaleH="64" pages="1" packed="0"/>',
  '  <pages><page id="0" file="test_0.png"/></pages>',
  '  <chars count="2">',
  '    <char id="65" x="0" y="0" width="7" height="8" xoffset="1" yoffset="5" xadvance="9" page="0" chnl="15"/>',
  '    <char id="86" x="8" y="0" width="6" height="8" xoffset="0" yoffset="0" xadvance="8" page="0" chnl="15"/>',
  '  </chars>',
  '  <kernings count="1">',
  '    <kerning first="65" second="86" amount="-2"/>',
  '  </kernings>',
  '</font>',
].join('\n');

describe('parseBitmapFontXml', () => {
  it('parses glyphs, kerning, and line metrics with the resolved atlas', () => {
    const atlas = createTextureAtlas();
    const font = parseBitmapFontXml(FNT_XML, { resolvePage: () => atlas });
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
    expect(getBitmapFontGlyph(font!, 86)?.advance).toBe(8);
    expect(getBitmapFontKerning(font!, 65, 86)).toBe(-2);
    expect(getBitmapFontMetrics(font!)).toEqual({ ascent: 26, descent: 6, lineGap: 0 });
  });

  it('passes the parsed page id and file to the resolver', () => {
    const seen: Array<[number, string]> = [];
    parseBitmapFontXml(FNT_XML, {
      resolvePage: (id, file) => {
        seen.push([id, file]);
        return createTextureAtlas();
      },
    });
    expect(seen).toEqual([[0, 'test_0.png']]);
  });

  it('returns null for malformed XML without throwing', () => {
    expect(parseBitmapFontXml('<font><common/></font>', { resolvePage: () => createTextureAtlas() })).toBeNull();
    expect(parseBitmapFontXml('not xml at all', { resolvePage: () => createTextureAtlas() })).toBeNull();
  });

  it('returns null when no resolvePage is supplied', () => {
    expect(parseBitmapFontXml(FNT_XML)).toBeNull();
  });
});
