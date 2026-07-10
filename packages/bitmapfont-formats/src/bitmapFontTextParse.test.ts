import { getBitmapFontGlyph, getBitmapFontGlyphRegion, getBitmapFontKerning } from '@flighthq/bitmapfont';

import { parseBitmapFontText, parseBitmapFontTextDocument } from './bitmapFontTextParse';

const FNT = [
  'info face="Test Font" size=32 bold=0 italic=1 charset="" unicode=1 stretchH=100 smooth=1 aa=1 padding=0,0,0,0 spacing=1,1 outline=0',
  'common lineHeight=36 base=28 scaleW=256 scaleH=128 pages=1 packed=0 alphaChnl=1',
  'page id=0 file="test_0.png"',
  'chars count=2',
  'char id=65 x=0  y=0 width=20 height=24 xoffset=1 yoffset=4 xadvance=22 page=0 chnl=15',
  'char id=86 x=20 y=0 width=18 height=24 xoffset=0 yoffset=4 xadvance=20 page=0 chnl=15',
  'kernings count=1',
  'kerning first=65 second=86 amount=-3',
  '',
].join('\n');

describe('parseBitmapFontText', () => {
  it('builds a font with line metrics, glyphs, kerning, and an atlas of glyph regions', () => {
    const font = parseBitmapFontText(FNT);
    expect(font.face).toBe('Test Font');
    expect(font.size).toBe(32);
    expect(font.base).toBe(28);
    expect(font.lineHeight).toBe(36);
    expect(font.glyphs).toHaveLength(2);

    const a = getBitmapFontGlyph(font, 65);
    expect(a).not.toBeNull();
    expect(a?.xadvance).toBe(22);
    expect(a?.xoffset).toBe(1);
    expect(a?.yoffset).toBe(4);

    // The glyph's pixel rectangle lives in the atlas, paired by code-point id.
    expect(font.atlas).not.toBeNull();
    const region = getBitmapFontGlyphRegion(font, a!);
    expect(region?.x).toBe(0);
    expect(region?.width).toBe(20);
    expect(region?.height).toBe(24);

    expect(getBitmapFontKerning(font, 65, 86)).toBe(-3);
  });

  it('leaves the atlas image unloaded (page files are not fetched)', () => {
    const font = parseBitmapFontText(FNT);
    expect(font.atlas?.image).toBeNull();
  });
});

describe('parseBitmapFontTextDocument', () => {
  it('parses info, common, pages, chars, and kernings', () => {
    const doc = parseBitmapFontTextDocument(FNT);
    expect(doc.info.face).toBe('Test Font');
    expect(doc.info.size).toBe(32);
    expect(doc.info.italic).toBe(true);
    expect(doc.info.bold).toBe(false);
    expect(doc.info.unicode).toBe(true);
    expect(doc.info.smooth).toBe(true);
    expect(doc.info.padding).toBe('0,0,0,0');

    expect(doc.common.lineHeight).toBe(36);
    expect(doc.common.base).toBe(28);
    expect(doc.common.scaleW).toBe(256);
    expect(doc.common.scaleH).toBe(128);
    expect(doc.common.pages).toBe(1);

    expect(doc.pages).toEqual([{ file: 'test_0.png', id: 0 }]);

    expect(doc.chars).toHaveLength(2);
    expect(doc.chars[0]).toMatchObject({ height: 24, id: 65, width: 20, xadvance: 22 });

    expect(doc.kernings).toEqual([{ amount: -3, first: 65, second: 86 }]);
  });

  it('is loss-tolerant: blank input yields empty defaults', () => {
    const doc = parseBitmapFontTextDocument('');
    expect(doc.chars).toEqual([]);
    expect(doc.kernings).toEqual([]);
    expect(doc.pages).toEqual([]);
    expect(doc.info.face).toBe('');
    expect(doc.common.lineHeight).toBe(0);
  });

  it('handles negative kerning amounts and the size field written as negative', () => {
    const doc = parseBitmapFontTextDocument('info face="X" size=-24\nkerning first=1 second=2 amount=-5');
    expect(doc.info.size).toBe(24);
    expect(doc.kernings[0].amount).toBe(-5);
  });
});
