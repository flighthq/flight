import { describe, expect, it } from 'vitest';

import { findOpenTypeUnicodeSubtable, rankOpenTypeUnicodeEncoding, readOpenTypeCodepointMap } from './openTypeCmap';
import { createSyntheticFont } from './openTypeTestHelper';
import { readSfntTableDirectory } from './sfntTableDirectory';

describe('findOpenTypeUnicodeSubtable', () => {
  it('finds the sub-table a font declares', () => {
    const font = createSyntheticFont({ codepoints: new Map([[65, 1]]) });
    const cmap = readSfntTableDirectory(font)!.tables.get('cmap')!;
    const view = new DataView(font.buffer, font.byteOffset, font.byteLength);
    expect(findOpenTypeUnicodeSubtable(view, cmap.offset, cmap.length, font.byteLength)).toBeGreaterThan(cmap.offset);
  });

  it('returns -1 when the font declares no Unicode mapping', () => {
    const font = createSyntheticFont({ codepoints: new Map([[65, 1]]) });
    const cmap = readSfntTableDirectory(font)!.tables.get('cmap')!;
    const view = new DataView(font.buffer, font.byteOffset, font.byteLength);
    // Platform 1 is the legacy Macintosh encoding, which answers a different question than "which glyph
    // draws this codepoint" and is deliberately not read.
    view.setUint16(cmap.offset + 4, 1);
    view.setUint16(cmap.offset + 6, 0);
    expect(findOpenTypeUnicodeSubtable(view, cmap.offset, cmap.length, font.byteLength)).toBe(-1);
  });

  it('skips a wider-repertoire sub-table stored in a format this reader cannot read', () => {
    // A real font is shaped exactly like this: a readable format 4 at rank 1 and a format 0 at rank 2.
    // Ranking on encoding alone picks the format 0 and the whole font is refused, while a readable
    // sub-table sits beside it. Built by hand rather than through the font helper, because the helper
    // only ever writes formats this reader supports and so could never express the case.
    const table = buildCmapWithTwoSubtables(0);
    const view = new DataView(table.buffer);
    const chosen = findOpenTypeUnicodeSubtable(view, 0, table.byteLength, table.byteLength);
    expect(chosen).toBe(20);
    expect(view.getUint16(chosen)).toBe(4);
  });

  it('still prefers the wider repertoire when that sub-table IS readable', () => {
    // The mirror of the case above, and what stops the fix from degenerating into "always take rank 1":
    // same layout, but the rank-2 sub-table is a format 12 rather than a format 0.
    const table = buildCmapWithTwoSubtables(12);
    const view = new DataView(table.buffer);
    const chosen = findOpenTypeUnicodeSubtable(view, 0, table.byteLength, table.byteLength);
    expect(chosen).toBe(24);
    expect(view.getUint16(chosen)).toBe(12);
  });
});

// A `cmap` carrying two Unicode sub-tables: platform 3 encoding 1 (rank 1) holding a format 4 at offset
// 20, and platform 3 encoding 10 (rank 2) holding `widerFormat` at offset 24. Only the format words
// matter to the chooser, so the sub-table bodies are left empty.
function buildCmapWithTwoSubtables(widerFormat: number): Uint8Array {
  const table = new Uint8Array(32);
  const view = new DataView(table.buffer);
  view.setUint16(2, 2);
  view.setUint16(4, 3);
  view.setUint16(6, 1);
  view.setUint32(8, 20);
  view.setUint16(12, 3);
  view.setUint16(14, 10);
  view.setUint32(16, 24);
  view.setUint16(20, 4);
  view.setUint16(24, widerFormat);
  return table;
}

describe('rankOpenTypeUnicodeEncoding', () => {
  // Preferring the full-repertoire mapping is what keeps emoji and CJK extensions reachable; a BMP-only
  // sub-table silently drops exactly that material, and both are usually present in the same font.
  it('ranks the full-repertoire mappings above the BMP-only ones', () => {
    expect(rankOpenTypeUnicodeEncoding(3, 10)).toBeGreaterThan(rankOpenTypeUnicodeEncoding(3, 1));
    expect(rankOpenTypeUnicodeEncoding(0, 4)).toBeGreaterThan(rankOpenTypeUnicodeEncoding(0, 3));
  });

  it('rejects a platform that is not a Unicode mapping at all', () => {
    expect(rankOpenTypeUnicodeEncoding(1, 0)).toBe(-1);
    expect(rankOpenTypeUnicodeEncoding(3, 0)).toBe(-1);
  });
});

describe('readOpenTypeCodepointMap', () => {
  it('maps every codepoint the font states', () => {
    const font = createSyntheticFont({
      codepoints: new Map([
        [65, 1],
        [66, 2],
        [0x4e2d, 3],
      ]),
    });
    const map = readOpenTypeCodepointMap(font, readSfntTableDirectory(font)!)!;
    expect(map.get(65)).toBe(1);
    expect(map.get(66)).toBe(2);
    expect(map.get(0x4e2d)).toBe(3);
  });

  it('omits codepoints the font does not cover rather than mapping them to glyph zero', () => {
    const font = createSyntheticFont({ codepoints: new Map([[65, 1]]) });
    const map = readOpenTypeCodepointMap(font, readSfntTableDirectory(font)!)!;
    // Glyph 0 is the "missing glyph" box. Mapping an uncovered codepoint to it here would make the
    // source unable to report that the font does not cover the character.
    expect(map.has(66)).toBe(false);
    expect(map.size).toBe(1);
  });

  it('does not map the 0xFFFF terminator segment the format requires', () => {
    const font = createSyntheticFont({ codepoints: new Map([[65, 1]]) });
    expect(readOpenTypeCodepointMap(font, readSfntTableDirectory(font)!)!.has(0xffff)).toBe(false);
  });

  it('returns the sentinel when cmap is absent', () => {
    const font = createSyntheticFont({ omitTable: 'cmap' });
    expect(readOpenTypeCodepointMap(font, readSfntTableDirectory(font)!)).toBeNull();
  });

  it('returns the sentinel for a sub-table format it does not read', () => {
    const font = createSyntheticFont({ codepoints: new Map([[65, 1]]) });
    const directory = readSfntTableDirectory(font)!;
    const cmap = directory.tables.get('cmap')!;
    const view = new DataView(font.buffer, font.byteOffset, font.byteLength);
    // Format 6 is a trimmed single-range table, not read here; a sentinel beats a partial map.
    view.setUint16(cmap.offset + view.getUint32(cmap.offset + 8), 6);
    expect(readOpenTypeCodepointMap(font, directory)).toBeNull();
  });
});
