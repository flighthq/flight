import { PathCommand } from '@flighthq/types/contract';
import type { Path } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { createGlyphOutlineSourceFromOpenTypeFont, explainOpenTypeFont } from './openTypeGlyphOutlineSource';
import { createSyntheticFont, emptySyntheticGlyph, squareSyntheticGlyph } from './openTypeTestHelper';
import { readSfntTableDirectory } from './sfntTableDirectory';

// Every font here is assembled byte by byte by the helper. Nothing third-party is read, fetched, or
// committed, and each test states the table contents its assertion depends on.
// A WOFF is a real font behind a compression wrapper — a different remedy from unreadable bytes, which is
// why it gets its own reason.
function woffBytes(): Uint8Array {
  const bytes = new Uint8Array(20);
  bytes.set([0x77, 0x4f, 0x46, 0x46]);
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
  return { commands: [], data: [], winding: 'evenOdd' };
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

  it('returns the sentinel for a CFF-outline font rather than producing an empty source', () => {
    expect(createGlyphOutlineSourceFromOpenTypeFont(createSyntheticFont({ flavor: 'opentype' }))).toBeNull();
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
    ['unsupported-container', woffBytes()],
    ['missing-required-table', createSyntheticFont({ omitTable: 'cmap' })],
    ['unsupported-outlines', createSyntheticFont({ flavor: 'opentype' })],
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

  it('separates a CFF font from a damaged one, naming the outline table it found', () => {
    const explanation = explainOpenTypeFont(createSyntheticFont({ flavor: 'opentype' }));
    // The distinction that matters: this font wants a different producer, not a re-download.
    expect(explanation.reason).toBe('unsupported-outlines');
    expect(explanation.table).toBe('CFF ');
    expect(explanation.accepted).toBe(false);
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
    // A WOFF is a real font behind a compression wrapper — a different remedy from unreadable bytes.
    const woff = new Uint8Array(20);
    woff.set([0x77, 0x4f, 0x46, 0x46]);
    expect(explainOpenTypeFont(woff).reason).toBe('unsupported-container');
    expect(explainOpenTypeFont(woff).format).toBe('woff');
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
