import { encodeUTF8 } from '@flighthq/encoding/contract';
import { RequirementFacet } from '@flighthq/types/contract';

import {
  BITMAP_FONT_REQUIREMENT_KEY_NAMESPACE,
  isReadableBitmapFont,
  parseBitmapFontRequirements,
} from './bitmapFontRequirements.ts';

// One minimal document per built-in format, each carrying the invariant its own detector reads: the binary
// header, an XML root element, a JSON object, or the text grammar's own block vocabulary.
const BINARY = new Uint8Array([66, 77, 70, 3, 2, 4, 0, 0, 0, 32, 0, 26, 0]);
const TEXT = encodeUTF8('info face="Test" size=32\ncommon lineHeight=32 base=26\n');
const XML = encodeUTF8('<?xml version="1.0"?><font><common lineHeight="32" base="26"/></font>');
const JSON_BYTES = encodeUTF8(JSON.stringify({ chars: [], common: { base: 26, lineHeight: 32 } }));

describe('BITMAP_FONT_REQUIREMENT_KEY_NAMESPACE', () => {
  // The namespace is what keeps `bitmapfont.BmFontXml` from colliding with any other family's kind on the
  // shared `document.format` facet, and the catalog builds its rows from this same constant.
  it('is the prefix every emitted key carries', () => {
    expect(BITMAP_FONT_REQUIREMENT_KEY_NAMESPACE).toBe('bitmapfont');
    expect(keyOf(XML)?.startsWith(`${BITMAP_FONT_REQUIREMENT_KEY_NAMESPACE}.`)).toBe(true);
  });
});

describe('isReadableBitmapFont', () => {
  it.each([
    ['BmFontBinary', BINARY],
    ['BmFontJson', JSON_BYTES],
    ['BmFontText', TEXT],
    ['BmFontXml', XML],
  ])('recognises a %s document', (_kind, bytes) => {
    expect(isReadableBitmapFont(bytes)).toBe(true);
  });

  // ★ UNKNOWN CONTENT STAYS UNREADABLE RATHER THAN CLAIMING A FALLBACK. There is no default front end, so
  // treating "unrecognised" as some format would ship an implementation that cannot read the file.
  it.each([
    ['empty bytes', new Uint8Array(0)],
    ['an unrelated binary header', new Uint8Array([0x89, 0x50, 0x4e, 0x47])],
    ['an older binary version', new Uint8Array([66, 77, 70, 2])],
    ['unrelated XML', encodeUTF8('<?xml version="1.0"?><TextureAtlas/>')],
    ['prose', encodeUTF8('this is not a font')],
  ])('reports %s unreadable', (_label, bytes) => {
    expect(isReadableBitmapFont(bytes)).toBe(false);
  });
});

describe('parseBitmapFontRequirements', () => {
  it.each([
    ['BmFontBinary', BINARY],
    ['BmFontJson', JSON_BYTES],
    ['BmFontText', TEXT],
    ['BmFontXml', XML],
  ])('emits exactly the requirement for the %s front end', (kind, bytes) => {
    expect(parseBitmapFontRequirements(bytes).requirements).toEqual([
      { facet: RequirementFacet.DocumentFormat, key: `${BITMAP_FONT_REQUIREMENT_KEY_NAMESPACE}.${kind}` },
    ]);
  });

  it('emits nothing for content no format recognises', () => {
    expect(parseBitmapFontRequirements(encodeUTF8('this is not a font')).requirements).toEqual([]);
  });

  // ★ THE THREE `.fnt` FORMS ARE THE WHOLE REASON THIS IS CONTENT-AWARE. BMFont writes binary, text and XML all
  // under the same extension, so a build that resolved the front end from the extension would link the wrong one
  // for two of the three — and the wrong front end returns null for content it cannot read, which reads as a
  // corrupt asset rather than as a misconfigured build.
  it('separates the three forms that share the fnt extension', () => {
    expect(keyOf(BINARY)).toBe('bitmapfont.BmFontBinary');
    expect(keyOf(TEXT)).toBe('bitmapfont.BmFontText');
    expect(keyOf(XML)).toBe('bitmapfont.BmFontXml');
  });

  it('covers the document.format facet, so a build knows the question was asked', () => {
    expect(parseBitmapFontRequirements(XML).covers).toEqual([RequirementFacet.DocumentFormat]);
  });
});

function keyOf(bytes: Readonly<Uint8Array>): string | undefined {
  return parseBitmapFontRequirements(bytes).requirements[0]?.key;
}
