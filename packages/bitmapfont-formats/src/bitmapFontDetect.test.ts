import { encodeUTF8 } from '@flighthq/encoding/contract';
import { createTextureAtlas } from '@flighthq/textureatlas/contract';
import type { BitmapFontFormatKind } from '@flighthq/types/contract';
import {
  BitmapFontFormatKindBmFontBinary,
  BitmapFontFormatKindBmFontJson,
  BitmapFontFormatKindBmFontText,
  BitmapFontFormatKindBmFontXml,
} from '@flighthq/types/contract';

import {
  applyBitmapFontImportOptions,
  bitmapFontAllFormats,
  bmFontBinaryFormat,
  bmFontJsonFormat,
  bmFontTextFormat,
  bmFontXmlFormat,
  detectBitmapFontFormat,
  getBitmapFontFormat,
  getBitmapFontFormatKinds,
  parseBitmapFont,
  registerBitmapFontFormat,
  unregisterBitmapFontFormat,
} from './bitmapFontDetect.ts';

const TEXT = encodeUTF8(
  [
    'info face="Test" size=32 unicode=1',
    'common lineHeight=32 base=26 scaleW=64 scaleH=64 pages=1 packed=0',
    'page id=0 file="test_0.png"',
    'chars count=1',
    'char id=65 x=0 y=0 width=7 height=8 xoffset=1 yoffset=5 xadvance=9 page=0 chnl=15',
  ].join('\n'),
);

const XML = encodeUTF8(
  [
    '<?xml version="1.0"?>',
    '<!-- exported by hand -->',
    '<font>',
    '  <common lineHeight="32" base="26" scaleW="64" scaleH="64" pages="1"/>',
    '  <pages><page id="0" file="test_0.png"/></pages>',
    '  <chars count="1">',
    '    <char id="65" x="0" y="0" width="7" height="8" xoffset="1" yoffset="5" xadvance="9" page="0" chnl="15"/>',
    '  </chars>',
    '</font>',
  ].join('\n'),
);

const JSON_TEXT = encodeUTF8(
  JSON.stringify({
    chars: [{ chnl: 15, height: 8, id: 65, page: 0, width: 7, x: 0, xadvance: 9, xoffset: 1, y: 0, yoffset: 5 }],
    common: { base: 26, lineHeight: 32, pages: 1, scaleH: 64, scaleW: 64 },
    info: { face: 'Test', size: 32 },
    pages: ['test_0.png'],
  }),
);

// One document per built-in format, shared by the exclusivity proof and the reverse-order proof: both are
// statements about the same corpus, and a second copy of it could drift from the first without failing either.
const CORPUS: readonly (readonly [BitmapFontFormatKind, Readonly<Uint8Array>])[] = [
  [BitmapFontFormatKindBmFontBinary, buildBinaryFont()],
  [BitmapFontFormatKindBmFontJson, JSON_TEXT],
  [BitmapFontFormatKindBmFontText, TEXT],
  [BitmapFontFormatKindBmFontXml, XML],
];

describe('applyBitmapFontImportOptions', () => {
  it('installs a named format and nothing else', () => {
    const kind = 'acme.SeamFont' as BitmapFontFormatKind;
    expect(getBitmapFontFormat(kind)).toBeNull();
    applyBitmapFontImportOptions({ formats: [{ entry: { detect: () => false, parse: () => null }, kind }] });
    expect(getBitmapFontFormat(kind)).not.toBeNull();
    unregisterBitmapFontFormat(kind);
    expect(getBitmapFontFormat(kind)).toBeNull();
  });

  // ★ MEASURED AGAINST A KIND THAT IS ABSENT, because a before/after comparison of the kind set cannot see this
  // bug. Empty options falling back to the full preset would re-register kinds that are ALREADY installed, which
  // leaves the set identical — the comparison passes while the fallback is live.
  it('installs nothing for empty options, rather than falling back to the built-ins', () => {
    unregisterBitmapFontFormat(BitmapFontFormatKindBmFontXml);
    applyBitmapFontImportOptions({});
    expect(getBitmapFontFormat(BitmapFontFormatKindBmFontXml)).toBeNull();
    applyBitmapFontImportOptions({ formats: [bmFontXmlFormat] });
    expect(getBitmapFontFormat(BitmapFontFormatKindBmFontXml)).toBe(bmFontXmlFormat.entry);
  });
});

describe('bitmapFontAllFormats', () => {
  it('covers exactly the built-in kinds the registry holds', () => {
    expect([...bitmapFontAllFormats.map((format) => format.kind)].sort()).toEqual(
      [...getBitmapFontFormatKinds()].sort(),
    );
  });

  // A descriptor has to carry the SAME entry the registry resolved, or a catalog row naming a descriptor would
  // name an implementation the importer does not use.
  it('carries the entry identity the registry holds for each kind', () => {
    for (const format of bitmapFontAllFormats) {
      expect(getBitmapFontFormat(format.kind)).toBe(format.entry);
    }
  });

  // ★ THE PROPERTY THAT MATTERS FOR THIS FAMILY ABOVE ALL OTHERS. BMFont writes binary, text and XML all under
  // `.fnt`, so nothing outside the content separates them. Exactly one detector may accept any file.
  it('accepts each corpus document in exactly one format', () => {
    for (const [expected, bytes] of CORPUS) {
      const accepting = bitmapFontAllFormats.filter((format) => format.entry.detect(bytes)).map((f) => f.kind);
      expect(accepting, expected).toEqual([expected]);
    }
  });

  // ★ PRECEDENCE IS NOT LOAD-BEARING, PROVEN BY REVERSING IT rather than by reading the detectors. Re-registering
  // a kind keeps its position, so the built-ins have to be REMOVED first or the reversed apply is a no-op and
  // this test passes without reordering anything.
  it('detects every corpus document identically when installed in reverse order', () => {
    const forward = CORPUS.map(([, bytes]) => detectBitmapFontFormat(bytes));
    expect(forward).toEqual(CORPUS.map(([kind]) => kind));

    for (const format of bitmapFontAllFormats) unregisterBitmapFontFormat(format.kind);
    expect(getBitmapFontFormatKinds()).toEqual([]);
    applyBitmapFontImportOptions({ formats: [...bitmapFontAllFormats].reverse() });
    expect(CORPUS.map(([, bytes]) => detectBitmapFontFormat(bytes))).toEqual(forward);

    for (const format of bitmapFontAllFormats) unregisterBitmapFontFormat(format.kind);
    applyBitmapFontImportOptions({ formats: bitmapFontAllFormats });
    expect(CORPUS.map(([, bytes]) => detectBitmapFontFormat(bytes))).toEqual(forward);
  });

  it('names each kind once', () => {
    const kinds = bitmapFontAllFormats.map((format) => format.kind);
    expect(kinds.length).toBe(new Set(kinds).size);
  });
});

describe('bmFontBinaryFormat', () => {
  it('names the binary kind', () => {
    expect(bmFontBinaryFormat.kind).toBe(BitmapFontFormatKindBmFontBinary);
  });
});

describe('bmFontJsonFormat', () => {
  it('names the JSON kind', () => {
    expect(bmFontJsonFormat.kind).toBe(BitmapFontFormatKindBmFontJson);
  });
});

describe('bmFontTextFormat', () => {
  it('names the text kind', () => {
    expect(bmFontTextFormat.kind).toBe(BitmapFontFormatKindBmFontText);
  });
});

describe('bmFontXmlFormat', () => {
  it('names the XML kind', () => {
    expect(bmFontXmlFormat.kind).toBe(BitmapFontFormatKindBmFontXml);
  });
});

describe('detectBitmapFontFormat', () => {
  it('detects each built-in document as its own format', () => {
    for (const [expected, bytes] of CORPUS) {
      expect(detectBitmapFontFormat(bytes), expected).toBe(expected);
    }
  });

  // The binary front end requires `BMF` plus version 3 exactly, and the detector asks the same question — so a
  // version this build cannot read is reported unrecognised rather than handed to a parser that returns null.
  it('requires the exact binary header the binary front end requires', () => {
    expect(detectBitmapFontFormat(new Uint8Array([66, 77, 70, 3, 2, 0, 0, 0, 0, 0]))).toBe(
      BitmapFontFormatKindBmFontBinary,
    );
    expect(detectBitmapFontFormat(new Uint8Array([66, 77, 70, 2]))).toBeNull();
    expect(detectBitmapFontFormat(new Uint8Array([66, 77, 71, 3]))).toBeNull();
  });

  it('reads the XML root element, so another XML document is not a font', () => {
    expect(detectBitmapFontFormat(encodeUTF8('<?xml version="1.0"?><TextureAtlas imagePath="a.png"/>'))).toBeNull();
    expect(detectBitmapFontFormat(encodeUTF8('<?xml version="1.0"?><!DOCTYPE font><font/>'))).toBe(
      BitmapFontFormatKindBmFontXml,
    );
  });

  // ★ PROSE IS NOT THE TEXT GRAMMAR. The text form has no header line to key on the way the others do, so the
  // discriminant is its own block vocabulary — without that, every unrecognised text asset in a build would be
  // claimed as a bitmap font and would link the text front end.
  it('requires a BMFont block name on the first line of a text document', () => {
    expect(detectBitmapFontFormat(encodeUTF8('this is not a font\ncommon lineHeight=1'))).toBeNull();
    expect(detectBitmapFontFormat(encodeUTF8('a.png\nsize: 2,2\nformat: RGBA8888\n'))).toBeNull();
    expect(detectBitmapFontFormat(encodeUTF8('\n\ncommon lineHeight=32 base=26'))).toBe(BitmapFontFormatKindBmFontText);
  });

  it('returns null for empty and unrecognised bytes rather than throwing', () => {
    expect(detectBitmapFontFormat(new Uint8Array(0))).toBeNull();
    expect(detectBitmapFontFormat(encodeUTF8('   \n  '))).toBeNull();
    expect(detectBitmapFontFormat(new Uint8Array([0, 1, 2]))).toBeNull();
  });

  // ★ THE OPENING BRACE IS NOT ENOUGH, and the cost of pretending otherwise is paid in someone else's bundle.
  // `.json` is shared with seven other format families, so a detector that claimed every JSON object would link
  // this front end into any build carrying an app config or a Tiled map beside its assets. The discriminant is
  // the `common` and `chars` blocks the JSON front end itself requires, so detector and parser still agree.
  it('requires the common and chars blocks the JSON front end requires', () => {
    expect(
      detectBitmapFontFormat(encodeUTF8(JSON.stringify({ frames: {}, meta: { app: 'texturepacker' } }))),
    ).toBeNull();
    expect(detectBitmapFontFormat(encodeUTF8(JSON.stringify({ apiBase: 'https://example.invalid' })))).toBeNull();
    expect(detectBitmapFontFormat(encodeUTF8(JSON.stringify({ layers: [], type: 'map' })))).toBeNull();
    // `common` alone is not a font either: the front end rejects a document with no chars.
    expect(detectBitmapFontFormat(encodeUTF8(JSON.stringify({ common: { base: 26, lineHeight: 32 } })))).toBeNull();
    expect(detectBitmapFontFormat(JSON_TEXT)).toBe(BitmapFontFormatKindBmFontJson);
  });
});

describe('getBitmapFontFormat', () => {
  it('resolves a built-in kind and answers null for an unregistered one', () => {
    expect(getBitmapFontFormat(BitmapFontFormatKindBmFontText)).toBe(bmFontTextFormat.entry);
    expect(getBitmapFontFormat('acme.Absent')).toBeNull();
  });
});

describe('getBitmapFontFormatKinds', () => {
  it('names the built-in kinds and stops naming one after it is unregistered', () => {
    expect([...getBitmapFontFormatKinds()].sort()).toEqual(
      [
        BitmapFontFormatKindBmFontBinary,
        BitmapFontFormatKindBmFontJson,
        BitmapFontFormatKindBmFontText,
        BitmapFontFormatKindBmFontXml,
      ].sort(),
    );
    const kind = 'acme.Enumerated' as BitmapFontFormatKind;
    registerBitmapFontFormat(kind, { detect: () => false, parse: () => null });
    expect(getBitmapFontFormatKinds()).toContain(kind);
    unregisterBitmapFontFormat(kind);
    expect(getBitmapFontFormatKinds()).not.toContain(kind);
  });
});

describe('parseBitmapFont', () => {
  // ★ EVERY FRONT END REACHED THROUGH ONE CALL, which is the claim the descriptors make. The text forms decode
  // the bytes inside the entry, so a caller never has to know that three of the four are text.
  it.each([
    ['binary', 0],
    ['json', 1],
    ['text', 2],
    ['xml', 3],
  ])('auto-detects and reads the %s form', (_label, index) => {
    const font = parseBitmapFont(CORPUS[index][1], undefined, { resolvePage: () => createTextureAtlas() });
    expect(font).not.toBeNull();
    expect(font!.pages.length).toBeGreaterThan(0);
  });

  it('honours an explicit format kind', () => {
    expect(
      parseBitmapFont(TEXT, BitmapFontFormatKindBmFontText, { resolvePage: () => createTextureAtlas() }),
    ).not.toBeNull();
  });

  it('returns null for unrecognised bytes and for a kind nothing is registered under', () => {
    expect(parseBitmapFont(new Uint8Array([0, 1, 2]))).toBeNull();
    expect(parseBitmapFont(TEXT, 'acme.Absent')).toBeNull();
  });
});

describe('registerBitmapFontFormat', () => {
  it('makes a custom format detectable and parseable', () => {
    const kind = 'acme.CustomFont' as BitmapFontFormatKind;
    registerBitmapFontFormat(kind, {
      // Forwards the options it was handed, which is what any real custom format does: a bitmap font needs its
      // page atlas resolved and the entry is the only thing holding the caller's resolver.
      detect: (bytes) => bytes[0] === 0x7a,
      parse: (_bytes, options, diagnostics) =>
        parseBitmapFont(TEXT, BitmapFontFormatKindBmFontText, options, diagnostics),
    });
    const custom = new Uint8Array([0x7a, 0x7a]);
    expect(detectBitmapFontFormat(custom)).toBe(kind);
    expect(parseBitmapFont(custom, undefined, { resolvePage: () => createTextureAtlas() })).not.toBeNull();
    unregisterBitmapFontFormat(kind);
    expect(detectBitmapFontFormat(custom)).toBeNull();
  });

  it('does not disturb the built-in formats', () => {
    const kind = 'acme.Quiet' as BitmapFontFormatKind;
    registerBitmapFontFormat(kind, { detect: () => false, parse: () => null });
    expect(detectBitmapFontFormat(XML)).toBe(BitmapFontFormatKindBmFontXml);
    unregisterBitmapFontFormat(kind);
  });
});

describe('unregisterBitmapFontFormat', () => {
  it('removes a format from detection and resolution', () => {
    unregisterBitmapFontFormat(BitmapFontFormatKindBmFontBinary);
    expect(detectBitmapFontFormat(CORPUS[0][1])).toBeNull();
    applyBitmapFontImportOptions({ formats: [bmFontBinaryFormat] });
    expect(detectBitmapFontFormat(CORPUS[0][1])).toBe(BitmapFontFormatKindBmFontBinary);
  });
});

// A minimal well-formed BMFont binary: the `BMF` magic plus version 3, a common block carrying lineHeight and
// base, a page block naming one image, and one char block. Built here rather than imported so this file states
// the header the detector keys on.
function buildBinaryFont(): Uint8Array {
  const common = new Uint8Array(15);
  const commonView = new DataView(common.buffer);
  commonView.setUint16(0, 32, true);
  commonView.setUint16(2, 26, true);
  const page = encodeUTF8('test_0.png\0');
  const chars = new Uint8Array(20);
  const charView = new DataView(chars.buffer);
  charView.setUint32(0, 65, true);
  charView.setUint16(8, 7, true);
  charView.setUint16(10, 8, true);
  charView.setInt16(16, 9, true);
  const blocks = [block(2, common), block(3, page), block(4, chars)];
  let total = 4;
  for (const part of blocks) total += part.length;
  const bytes = new Uint8Array(total);
  bytes.set([66, 77, 70, 3], 0);
  let offset = 4;
  for (const part of blocks) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}

function block(type: number, data: Readonly<Uint8Array>): Uint8Array {
  const out = new Uint8Array(5 + data.length);
  out[0] = type;
  new DataView(out.buffer).setUint32(1, data.length, true);
  out.set(data, 5);
  return out;
}
