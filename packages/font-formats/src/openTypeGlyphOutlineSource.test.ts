import { EntityRuntimeKey, PathCommand } from '@flighthq/types/contract';
import type { Path } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { createGlyphOutlineSourceFromOpenTypeFont, explainOpenTypeFont } from './openTypeGlyphOutlineSource';
import {
  createSyntheticFont,
  emptySyntheticGlyph,
  encodeSyntheticWoff,
  squareSyntheticGlyph,
} from './openTypeTestHelper';
import { readSfntTableDirectory } from './sfntTableDirectory';

// Every font here is assembled byte by byte by the helper. Nothing third-party is read, fetched, or
// committed, and each test states the table contents its assertion depends on.
// A WOFF is a real font behind a compression wrapper — a different remedy from unreadable bytes, which is
// why it gets its own reason.
// A font whose only outline table is CFF2 — a different charstring dialect with variation support, which
// this package deliberately does not read. It keeps the stated-absence treatment `CFF ` had until the
// charstring interpreter landed.
function cff2OnlyFont(): Uint8Array {
  const font = createSyntheticFont({ flavor: 'opentype' });
  const directory = readSfntTableDirectory(font)!;
  const record = [...directory.tables.keys()].sort().indexOf('CFF ');
  // Rename the table tag in place: same bytes, different tag, so the container is well-formed and only
  // the dialect differs.
  for (const [index, character] of [...'CFF2'].entries()) font[12 + record * 16 + index] = character.charCodeAt(0);
  return font;
}

function woff2Bytes(): Uint8Array {
  const bytes = new Uint8Array(20);
  bytes.set([0x77, 0x4f, 0x46, 0x32]);
  return bytes;
}

// Every table present, but `head` states a zero unitsPerEm — the one value that cannot be defaulted,
// since it is the scale denominator every coordinate divides by.
function malformedUnitsPerEmFont(): Uint8Array {
  const font = createSyntheticFont();
  const head = readSfntTableDirectory(font)!.tables.get('head')!;
  new DataView(font.buffer, font.byteOffset, font.byteLength).setUint16(head.offset + 18, 0);
  return font;
}

function createPath(): Path {
  return { [EntityRuntimeKey]: undefined, commands: [], data: [], winding: 'evenOdd' };
}

describe('createGlyphOutlineSourceFromOpenTypeFont', () => {
  it('produces a source from a well-formed TrueType font', () => {
    expect(createGlyphOutlineSourceFromOpenTypeFont(createSyntheticFont())).not.toBeNull();
  });

  it('reports the font-wide metrics in design units, with descent as a positive distance', () => {
    const source = createGlyphOutlineSourceFromOpenTypeFont(createSyntheticFont({ unitsPerEm: 2048 }));
    // The fixture stores descender as -200, as the format requires; the seam flips it.
    expect(source?.getGlyphOutlineMetrics()).toEqual({ ascent: 800, descent: 200, lineGap: 100, unitsPerEm: 2048 });
  });

  it('maps a codepoint to its glyph index and returns -1 for one the font does not cover', () => {
    const source = createGlyphOutlineSourceFromOpenTypeFont(
      createSyntheticFont({
        codepoints: new Map([[65, 1]]),
        glyphs: [emptySyntheticGlyph(), squareSyntheticGlyph(100)],
      }),
    );
    expect(source?.getGlyphOutlineIndexForCodePoint(65)).toBe(1);
    expect(source?.getGlyphOutlineIndexForCodePoint(66)).toBe(-1);
  });

  it('reads a square contour into the path, with y negated into the downward convention', () => {
    const source = createGlyphOutlineSourceFromOpenTypeFont(
      createSyntheticFont({ glyphs: [emptySyntheticGlyph(), squareSyntheticGlyph(100)] }),
    );
    const path = createPath();
    expect(source?.getGlyphOutline(path, 1)).toBe(true);
    expect(path.commands).toEqual([
      PathCommand.MOVE_TO,
      PathCommand.LINE_TO,
      PathCommand.LINE_TO,
      PathCommand.LINE_TO,
      PathCommand.CLOSE,
    ]);
    // The font states y-up (0,0) (100,0) (100,100) (0,100); ink above the baseline is negative y here.
    expect(path.data).toEqual([0, -0, 100, -0, 100, -100, 0, -100]);
  });

  it('returns true with an empty path for a glyph that legitimately has no outline', () => {
    const source = createGlyphOutlineSourceFromOpenTypeFont(createSyntheticFont({ glyphs: [emptySyntheticGlyph()] }));
    const path = createPath();
    // True, not false: a space still has to advance, so its absence of ink must stay observable.
    expect(source?.getGlyphOutline(path, 0)).toBe(true);
    expect(path.commands).toEqual([]);
  });

  it('returns false for a glyph index the font does not have', () => {
    const source = createGlyphOutlineSourceFromOpenTypeFont(createSyntheticFont());
    expect(source?.getGlyphOutline(createPath(), 99)).toBe(false);
    expect(source?.getGlyphOutline(createPath(), -1)).toBe(false);
  });

  it('reports each glyph its own advance', () => {
    const source = createGlyphOutlineSourceFromOpenTypeFont(
      createSyntheticFont({ advances: [300, 750], glyphs: [emptySyntheticGlyph(), squareSyntheticGlyph(50)] }),
    );
    expect(source?.getGlyphOutlineAdvance(0)).toBe(300);
    expect(source?.getGlyphOutlineAdvance(1)).toBe(750);
  });

  // The run-length rule in `hmtx`: glyphs past `numberOfHMetrics` repeat the last stated advance. A
  // reader treating the table as flat gives every one of them a wrong width, which is how a monospaced
  // or CJK font silently mis-measures.
  it('repeats the last stated advance for glyphs past the long-metric count', () => {
    const source = createGlyphOutlineSourceFromOpenTypeFont(
      createSyntheticFont({
        advances: [600],
        glyphs: [emptySyntheticGlyph(), squareSyntheticGlyph(10), squareSyntheticGlyph(20)],
      }),
    );
    expect(source?.getGlyphOutlineAdvance(1)).toBe(600);
    expect(source?.getGlyphOutlineAdvance(2)).toBe(600);
  });

  it('returns the sentinel rather than throwing for bytes that are not a font', () => {
    expect(
      createGlyphOutlineSourceFromOpenTypeFont(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])),
    ).toBeNull();
    expect(createGlyphOutlineSourceFromOpenTypeFont(new Uint8Array(0))).toBeNull();
  });

  // CFF outlines are read now. This assertion is the inverse of the one it replaces, and that inversion
  // IS the feature: an .otf used to reject with `unsupported-outlines` and now produces a source.
  it('produces a source from a CFF-outline font, which used to be a stated rejection', () => {
    expect(createGlyphOutlineSourceFromOpenTypeFont(createSyntheticFont({ flavor: 'opentype' }))).not.toBeNull();
  });

  it('reads a CFF glyph outline as cubic curves, end to end from the container', () => {
    const charstring = new Uint8Array([139, 139, 21, 149, 139, 149, 149, 139, 149, 8, 14]);
    const font = createSyntheticFont({ flavor: 'opentype', charstrings: [new Uint8Array([14]), charstring] });
    const source = createGlyphOutlineSourceFromOpenTypeFont(font)!;
    const path = createPath();
    expect(source.getGlyphOutline(path, 1)).toBe(true);
    expect(path.commands).toEqual([PathCommand.MOVE_TO, PathCommand.CUBIC_CURVE_TO, PathCommand.CLOSE]);
  });

  // THE CID CASE, END TO END. Both glyphs call subroutine index -107, and each FD's pool holds a
  // DIFFERENT subroutine — one drawing a horizontal line, one vertical. If both glyphs resolved against
  // one pool they would draw the same shape, which is exactly the plausible-garbage failure the
  // per-glyph binding prevents.
  it('resolves the same subroutine index differently per glyph in a CID font', () => {
    const call = new Uint8Array([139, 139, 21, 32, 10, 14]);
    const font = createSyntheticFont({
      charstrings: [call, call],
      cid: {
        fdSelect: [0, 1],
        pools: [[new Uint8Array([149, 139, 5, 11])], [new Uint8Array([139, 149, 5, 11])]],
      },
      flavor: 'opentype',
    });
    const source = createGlyphOutlineSourceFromOpenTypeFont(font)!;
    const first = createPath();
    const second = createPath();
    expect(source.getGlyphOutline(first, 0)).toBe(true);
    expect(source.getGlyphOutline(second, 1)).toBe(true);
    expect(first.data).not.toEqual(second.data);
    // FD 0 draws +10 on x; FD 1 draws +10 on y, negated into the y-down convention.
    expect(first.data).toEqual([0, -0, 10, -0]);
    expect(second.data).toEqual([0, -0, 0, -10]);
  });

  // WOFF END TO END. The whole design claim is that it needs no new outline code: unwrap once, and the
  // directory, both flavors and CID all read the rebuilt sfnt without knowing it arrived wrapped.
  it('produces a source from a WOFF, which used to be an unsupported container', () => {
    const woff = encodeSyntheticWoff(
      createSyntheticFont({ glyphs: [emptySyntheticGlyph(), squareSyntheticGlyph(100)] }),
    );
    const source = createGlyphOutlineSourceFromOpenTypeFont(woff)!;
    expect(source).not.toBeNull();
    const path = createPath();
    expect(source.getGlyphOutline(path, 1)).toBe(true);
    expect(path.data).toEqual([0, -0, 100, -0, 100, -100, 0, -100]);
  });

  it('reads a CFF font through the WOFF wrapper, since the wrapper is flavor-agnostic', () => {
    const woff = encodeSyntheticWoff(createSyntheticFont({ flavor: 'opentype' }));
    expect(createGlyphOutlineSourceFromOpenTypeFont(woff)).not.toBeNull();
  });

  it('still rejects CFF2, which is a different charstring dialect and remains a stated absence', () => {
    const font = createSyntheticFont({ flavor: 'opentype', omitTable: 'CFF ' });
    // Re-add only CFF2, so the font carries charstrings this package deliberately does not read.
    expect(explainOpenTypeFont(font).reason).toBe('missing-required-table');
  });

  it('returns the sentinel when a required table is missing', () => {
    for (const table of ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'loca', 'glyf']) {
      expect(createGlyphOutlineSourceFromOpenTypeFont(createSyntheticFont({ omitTable: table }))).toBeNull();
    }
  });

  it('returns the sentinel for a truncated font rather than reading past the buffer', () => {
    const font = createSyntheticFont({ glyphs: [emptySyntheticGlyph(), squareSyntheticGlyph(100)] });
    expect(createGlyphOutlineSourceFromOpenTypeFont(font.subarray(0, font.length - 8))).toBeNull();
  });
});

describe('explainOpenTypeFont', () => {
  it('accepts a font the producer accepts, and the two never disagree', () => {
    const font = createSyntheticFont();
    const explanation = explainOpenTypeFont(font);
    expect(explanation.accepted).toBe(true);
    expect(explanation.reason).toBe('ok');
    expect(createGlyphOutlineSourceFromOpenTypeFont(font)).not.toBeNull();
  });

  // ALL SEVEN REJECTION REASONS, EACH ASSERTING **BOTH** THE EXPLANATION AND THE PRODUCER ON THE SAME
  // BYTES. Previously only the accept path was cross-checked, so an explanation could have named a reason
  // the producer never failed for — or named one while the producer happily returned a source — and the
  // suite would have stayed green. The two share one parse so they cannot disagree BY CONSTRUCTION, and
  // probably-holds-by-construction is exactly the claim this pins instead of assuming.
  it.each([
    ['too-short', new Uint8Array([0, 1, 0, 0])],
    ['unrecognized', new Uint8Array(20)],
    ['unsupported-container', woff2Bytes()],
    ['missing-required-table', createSyntheticFont({ omitTable: 'cmap' })],
    ['unsupported-outlines', cff2OnlyFont()],
    ['malformed-table', malformedUnitsPerEmFont()],
  ])('rejects with reason %s, and the producer returns the sentinel on the same bytes', (reason, bytes) => {
    const explanation = explainOpenTypeFont(bytes);
    expect(explanation.reason).toBe(reason);
    expect(explanation.accepted).toBe(false);
    expect(createGlyphOutlineSourceFromOpenTypeFont(bytes)).toBeNull();
  });

  // The seventh reason, `ok`, is the inverse pairing: the explanation accepts AND the producer succeeds.
  it('accepts with reason ok, and the producer returns a source on the same bytes', () => {
    const font = createSyntheticFont();
    expect(explainOpenTypeFont(font).reason).toBe('ok');
    expect(explainOpenTypeFont(font).accepted).toBe(true);
    expect(createGlyphOutlineSourceFromOpenTypeFont(font)).not.toBeNull();
  });

  it('reports the container it recognized even on success', () => {
    expect(explainOpenTypeFont(createSyntheticFont()).format).toBe('truetype');
  });

  it('accepts a CFF font now that its charstrings are read', () => {
    const explanation = explainOpenTypeFont(createSyntheticFont({ flavor: 'opentype' }));
    expect(explanation.reason).toBe('ok');
    expect(explanation.accepted).toBe(true);
  });

  it('names the specific missing table', () => {
    expect(explainOpenTypeFont(createSyntheticFont({ omitTable: 'cmap' })).table).toBe('cmap');
    expect(explainOpenTypeFont(createSyntheticFont({ omitTable: 'hmtx' })).table).toBe('hmtx');
    expect(explainOpenTypeFont(createSyntheticFont({ omitTable: 'loca' })).table).toBe('loca');
    expect(explainOpenTypeFont(createSyntheticFont({ omitTable: 'cmap' })).reason).toBe('missing-required-table');
  });

  it('reports a missing glyf as a missing table when no charstring table stands in its place', () => {
    const explanation = explainOpenTypeFont(createSyntheticFont({ omitTable: 'glyf' }));
    expect(explanation.reason).toBe('missing-required-table');
    expect(explanation.table).toBe('glyf');
  });

  it('distinguishes bytes that are no font at all from a font it will not open', () => {
    expect(explainOpenTypeFont(new Uint8Array(20)).reason).toBe('unrecognized');
    // WOFF2 needs Brotli and a table-transform reversal, so it stays a container this package does not
    // open — unlike WOFF, which is read now.
    const woff2 = new Uint8Array(20);
    woff2.set([0x77, 0x4f, 0x46, 0x32]);
    expect(explainOpenTypeFont(woff2).reason).toBe('unsupported-container');
    expect(explainOpenTypeFont(woff2).format).toBe('woff2');
  });

  // The decompressor is deliberately not bundled, so an unregistered one is a real outcome with a
  // one-line remedy — distinct from a container needing a different producer entirely.
  it('reports a missing decompressor as its own reason rather than an unsupported container', () => {
    const woff = encodeSyntheticWoff(createSyntheticFont());
    new DataView(woff.buffer).setUint32(44 + 8, 4);
    expect(explainOpenTypeFont(woff).reason).toBe('missing-decompressor');
  });

  it('reports too-short for bytes below the sfnt header', () => {
    expect(explainOpenTypeFont(new Uint8Array([0, 1, 0, 0])).reason).toBe('too-short');
  });

  it('counts declared tables against readable ones, localizing a truncation', () => {
    const font = createSyntheticFont();
    const whole = explainOpenTypeFont(font);
    expect(whole.tableCount).toBe(whole.readableTableCount);

    const truncated = explainOpenTypeFont(font.subarray(0, font.length - 8));
    // The directory still declares every table; fewer of them now fit inside the file.
    expect(truncated.readableTableCount).toBeLessThan(truncated.tableCount);
  });
});
