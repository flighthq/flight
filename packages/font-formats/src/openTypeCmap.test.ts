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
});

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
