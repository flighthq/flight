import type { TextureAtlas } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { explainBitmapFontParse } from './explainBitmapFontParse';

describe('explainBitmapFontParse', () => {
  it('returns invalid-data for empty string', () => {
    const result = explainBitmapFontParse('');
    expect(result.success).toBe(false);
    expect(result.reason).toBe('invalid-data');
    expect(result.detectedFormat).toBe('unknown');
  });

  it('returns invalid-data for arbitrary text', () => {
    const result = explainBitmapFontParse('hello world');
    expect(result.success).toBe(false);
    expect(result.reason).toBe('invalid-data');
  });

  it('detects JSON format and reports missing-common', () => {
    const result = explainBitmapFontParse(JSON.stringify({ chars: [{ id: 65, x: 0, y: 0 }] }));
    expect(result.detectedFormat).toBe('json');
    expect(result.reason).toBe('missing-common');
    expect(result.success).toBe(false);
  });

  it('detects JSON format and reports missing-chars', () => {
    const result = explainBitmapFontParse(JSON.stringify({ common: { lineHeight: 32, base: 24 } }));
    expect(result.detectedFormat).toBe('json');
    expect(result.reason).toBe('missing-chars');
    expect(result.charCount).toBe(0);
  });

  it('detects JSON format and reports unresolved-page without resolvePage', () => {
    const json = JSON.stringify({
      chars: [{ id: 65, x: 0, y: 0, width: 10, height: 10, xoffset: 0, yoffset: 0, xadvance: 10, page: 0 }],
      common: { lineHeight: 32, base: 24 },
      pages: ['font.png'],
    });
    const result = explainBitmapFontParse(json);
    expect(result.detectedFormat).toBe('json');
    expect(result.reason).toBe('unresolved-page');
    expect(result.unresolvedPages).toEqual([0]);
    expect(result.charCount).toBe(1);
    expect(result.pageCount).toBe(1);
  });

  it('detects JSON format and reports ok when pages resolve', () => {
    const json = JSON.stringify({
      chars: [{ id: 65, x: 0, y: 0, width: 10, height: 10, xoffset: 0, yoffset: 0, xadvance: 10, page: 0 }],
      common: { lineHeight: 32, base: 24 },
      pages: ['font.png'],
    });
    const result = explainBitmapFontParse(json, {
      resolvePage: () => ({}) as TextureAtlas,
    });
    expect(result.success).toBe(true);
    expect(result.reason).toBe('ok');
    expect(result.charCount).toBe(1);
    expect(result.kerningCount).toBe(0);
  });

  it('detects JSON with chars-as-object', () => {
    const json = JSON.stringify({
      chars: { '65': { id: 65, x: 0, y: 0, width: 10, height: 10, xoffset: 0, yoffset: 0, xadvance: 10, page: 0 } },
      common: { lineHeight: 32, base: 24 },
      pages: ['font.png'],
    });
    const result = explainBitmapFontParse(json, {
      resolvePage: () => ({}) as TextureAtlas,
    });
    expect(result.detectedFormat).toBe('json');
    expect(result.charCount).toBe(1);
    expect(result.success).toBe(true);
  });

  it('counts kernings in JSON', () => {
    const json = JSON.stringify({
      chars: [{ id: 65, x: 0, y: 0, width: 10, height: 10, xoffset: 0, yoffset: 0, xadvance: 10 }],
      common: { lineHeight: 32, base: 24 },
      kernings: [
        { first: 65, second: 66, amount: -2 },
        { first: 66, second: 65, amount: -1 },
      ],
    });
    const result = explainBitmapFontParse(json, {
      resolvePage: () => ({}) as TextureAtlas,
    });
    expect(result.kerningCount).toBe(2);
  });

  it('detects FNT text format and reports missing-common', () => {
    const fnt = 'char id=65 x=0 y=0 width=10 height=10 xoffset=0 yoffset=0 xadvance=10 page=0\n';
    const result = explainBitmapFontParse(fnt);
    expect(result.detectedFormat).toBe('fnt');
    expect(result.reason).toBe('missing-common');
  });

  it('detects FNT text format and reports missing-chars', () => {
    const fnt = 'common lineHeight=32 base=24 scaleW=256 scaleH=256 pages=1\n';
    const result = explainBitmapFontParse(fnt);
    expect(result.detectedFormat).toBe('fnt');
    expect(result.reason).toBe('missing-chars');
  });

  it('detects FNT text format and reports ok', () => {
    const fnt = [
      'common lineHeight=32 base=24 scaleW=256 scaleH=256 pages=1',
      'page id=0 file="font.png"',
      'char id=65 x=0 y=0 width=10 height=10 xoffset=0 yoffset=0 xadvance=10 page=0',
    ].join('\n');
    const result = explainBitmapFontParse(fnt, {
      resolvePage: () => ({}) as TextureAtlas,
    });
    expect(result.detectedFormat).toBe('fnt');
    expect(result.success).toBe(true);
    expect(result.charCount).toBe(1);
    expect(result.pageCount).toBe(1);
  });

  it('detects XML format and reports ok', () => {
    const xml = [
      '<font>',
      '  <common lineHeight="32" base="24" scaleW="256" scaleH="256"/>',
      '  <pages><page id="0" file="font.png"/></pages>',
      '  <chars><char id="65" x="0" y="0" width="10" height="10" xoffset="0" yoffset="0" xadvance="10" page="0"/></chars>',
      '</font>',
    ].join('\n');
    const result = explainBitmapFontParse(xml, {
      resolvePage: () => ({}) as TextureAtlas,
    });
    expect(result.detectedFormat).toBe('xml');
    expect(result.success).toBe(true);
    expect(result.charCount).toBe(1);
  });

  it('detects XML format and reports missing-common', () => {
    const xml = [
      '<font>',
      '  <chars><char id="65" x="0" y="0" width="10" height="10" xoffset="0" yoffset="0" xadvance="10"/></chars>',
      '</font>',
    ].join('\n');
    const result = explainBitmapFontParse(xml);
    expect(result.detectedFormat).toBe('xml');
    expect(result.reason).toBe('missing-common');
  });

  it('reports multiple unresolved pages', () => {
    const json = JSON.stringify({
      chars: [
        { id: 65, x: 0, y: 0, width: 10, height: 10, xoffset: 0, yoffset: 0, xadvance: 10, page: 0 },
        { id: 66, x: 10, y: 0, width: 10, height: 10, xoffset: 0, yoffset: 0, xadvance: 10, page: 1 },
      ],
      common: { lineHeight: 32, base: 24 },
      pages: ['font0.png', 'font1.png'],
    });
    const result = explainBitmapFontParse(json);
    expect(result.unresolvedPages).toEqual(expect.arrayContaining([0, 1]));
    expect(result.unresolvedPages).toHaveLength(2);
  });
});
