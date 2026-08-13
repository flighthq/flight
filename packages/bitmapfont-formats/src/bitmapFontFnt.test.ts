import {
  createGlyphSourceFromBitmapFont,
  getBitmapFontGlyph,
  getBitmapFontKerning,
  getBitmapFontMetrics,
  getBitmapFontPage,
} from '@flighthq/bitmapfont/contract';
import { createTextureAtlas, createTextureAtlasFromImageResource } from '@flighthq/textureatlas/contract';
import type { BitmapFontParseOptions, Image, ImportDiagnostic, TextureAtlas } from '@flighthq/types/contract';
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

const FNT_ASTRAL = [
  'info face="Test" size=32 unicode=1',
  'common lineHeight=32 base=26 scaleW=64 scaleH=64 pages=1 packed=0',
  'page id=0 file="test_0.png"',
  'chars count=2',
  'char id=128512 x=0 y=0 width=7 height=8 xoffset=1 yoffset=0 xadvance=9 page=0 chnl=15',
  'char id=65 x=8 y=0 width=6 height=8 xoffset=0 yoffset=0 xadvance=8 page=0 chnl=15',
  'kernings count=1',
  'kerning first=128512 second=65 amount=-3',
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

  it('round-trips kerning for a supplementary-plane pair', () => {
    // The round-trip alone cannot catch a wrong inverse if both sides share it, so this asserts the
    // emitted codepoints directly: the pair a 16-bit unpack would truncate outright.
    const options = pageOptions();
    const font = parseBitmapFontFnt(FNT_ASTRAL, options);
    expect(font).not.toBeNull();

    const text = formatBitmapFontFnt(font!);
    expect(text).toContain('kerning first=128512 second=65 amount=-3');

    const reparsed = parseBitmapFontFnt(text, options);
    expect(getBitmapFontKerning(reparsed!, 0x1f600, 65)).toBe(-3);
  });

  it('emits an empty page file reference (the atlas is a live resource, not a path)', () => {
    const font = parseBitmapFontFnt(FNT_TEXT, pageOptions());
    expect(formatBitmapFontFnt(font!)).toContain('page id=0 file=""');
  });
});

describe('parseBitmapFontFnt', () => {
  // A clean parse is two claims: the values are right AND THE PARSER IS NOT COMPLAINING. Every other test
  // here checks the first. This checks the second — the one that catches a walk that desynchronised and
  // still left the asserted fields looking plausible. Asserted as an EMPTY list rather than a filter over
  // truncation-shaped kind names: a pattern built from expected vocabulary silently exempts every kind
  // whose name nobody guessed, and this importer has kinds like that.
  it('raises no diagnostic at all for a well-formed file', () => {
    const diagnostics: ImportDiagnostic[] = [];

    parseBitmapFontFnt(FNT_TEXT, { resolvePage: () => createTextureAtlas() }, diagnostics);

    const complaints = diagnostics.map((diagnostic) => diagnostic.kind);
    expect(complaints, `a good fnt file made the parser complain: ${complaints.join(', ')}`).toEqual([]);
  });

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
    const image0 = {} as Image;
    const image1 = {} as Image;
    const page0 = createTextureAtlasFromImageResource(image0);
    const page1 = createTextureAtlasFromImageResource(image1);
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

describe('parseBitmapFontFntDroppedRecords', () => {
  // A malformed char line is skipped so the rest of the font still loads, which is right. What is not
  // right is that the font then reports FEWER GLYPHS THAN THE FILE AUTHORED with nothing saying so —
  // a caller sees a complete-looking font that is quietly missing characters.
  it('reports the records it could not read instead of dropping them silently', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const font = parseBitmapFontFnt(
      [
        'common lineHeight=32 base=26',
        'page id=0 file="a.png"',
        'page file="nopage.png"',
        'char id=65 x=0 y=0 width=8 height=8 xoffset=0 yoffset=0 xadvance=8 page=0',
        'char x=0 y=0 width=8 height=8',
        'kerning first=65 second=66 amount=-1',
        'kerning first=65 amount=-1',
      ].join('\n'),
      { resolvePage: () => createTextureAtlas() },
      diagnostics,
    );

    // The font still parses — that is exactly why the loss is invisible without the crumbs.
    expect(font).not.toBeNull();
    expect(diagnostics.map((entry) => entry.kind).sort()).toEqual([
      'bmfont.char-unreadable',
      'bmfont.kerning-unreadable',
      'bmfont.page-unreadable',
    ]);
  });

  it('reports once per kind however many records are unreadable', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const lines = [
      'common lineHeight=32 base=26',
      'char id=65 x=0 y=0 width=8 height=8 xoffset=0 yoffset=0 xadvance=8 page=0',
    ];
    for (let index = 0; index < 5; index++) lines.push('char x=0 y=0 width=8 height=8');
    parseBitmapFontFnt(lines.join('\n'), { resolvePage: () => createTextureAtlas() }, diagnostics);

    // A font carries thousands of char lines; one crumb each would drown the report it is making.
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.detail).toMatchObject({ records: 5 });
  });

  it('stays silent for a font whose records all read', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const font = parseBitmapFontFnt(FNT_MULTIPAGE, { resolvePage: () => createTextureAtlas() }, diagnostics);

    // Asserting a real glyph keeps the silence from being vacuous.
    expect(getBitmapFontGlyph(font!, 65)).not.toBeNull();
    expect(diagnostics).toEqual([]);
  });
});

function pageOptions(): BitmapFontParseOptions {
  const atlas: TextureAtlas = createTextureAtlas();
  return { resolvePage: () => atlas };
}
