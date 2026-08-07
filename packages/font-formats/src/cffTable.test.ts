import { describe, expect, it } from 'vitest';

import { readCffTable } from './cffTable';
import { createSyntheticFont } from './openTypeTestHelper';
import { readSfntTableDirectory } from './sfntTableDirectory';

function cffOf(options: Parameters<typeof createSyntheticFont>[0] = {}) {
  const font = createSyntheticFont({ flavor: 'opentype', ...options });
  return { font, table: readCffTable(font, readSfntTableDirectory(font)!) };
}

describe('readCffTable', () => {
  it('reaches the charstrings through the offset the top DICT states', () => {
    const { table } = cffOf({ charstrings: [new Uint8Array([14]), new Uint8Array([14])] });
    expect(table?.charstrings).toHaveLength(2);
  });

  it('yields an empty subroutine pool when the font declares none, rather than failing', () => {
    // Absent and present-but-empty are identical to the biasing arithmetic, so a caller never has to
    // distinguish them.
    const { table } = cffOf();
    expect(table?.localSubrs).toEqual([]);
    expect(table?.globalSubrs).toEqual([]);
  });

  it('returns the sentinel when the table is absent', () => {
    const font = createSyntheticFont();
    expect(readCffTable(font, readSfntTableDirectory(font)!)).toBeNull();
  });

  it('returns the sentinel for a truncated table rather than ranges into arbitrary bytes', () => {
    const { font } = cffOf();
    const directory = readSfntTableDirectory(font)!;
    const shortened = new Map(directory.tables);
    shortened.set('CFF ', { length: 8, offset: directory.tables.get('CFF ')!.offset });
    expect(readCffTable(font, { ...directory, tables: shortened })).toBeNull();
  });
});

describe('readCffTable — CID-keyed', () => {
  // Two FDs with DIFFERENT subroutine pools. The point of the whole slab is that glyph 0 and glyph 1
  // resolve the SAME subroutine index to DIFFERENT bytes.
  function cidFont() {
    return createSyntheticFont({
      charstrings: [new Uint8Array([139, 139, 21, 32, 10, 14]), new Uint8Array([139, 139, 21, 32, 10, 14])],
      cid: {
        fdSelect: [0, 1],
        pools: [[new Uint8Array([149, 139, 5, 11])], [new Uint8Array([139, 149, 5, 11])]],
      },
      flavor: 'opentype',
    });
  }

  it('reads a CID font instead of refusing it', () => {
    const font = cidFont();
    const table = readCffTable(font, readSfntTableDirectory(font)!)!;
    expect(table).not.toBeNull();
    expect(table.charstrings).toHaveLength(2);
  });

  it('binds each glyph to its own pool, which is the entire reason this path exists', () => {
    const font = cidFont();
    const table = readCffTable(font, readSfntTableDirectory(font)!)!;
    expect(table.localSubrsByGlyph).not.toBeNull();
    expect(table.localSubrsByGlyph).toHaveLength(2);
    // Different FDs, so different pools — not merely two references to one.
    expect(table.localSubrsByGlyph![0]).not.toBe(table.localSubrsByGlyph![1]);
  });

  it('leaves the single table-wide pool empty, so a reader ignoring CID fails visibly', () => {
    const font = cidFont();
    expect(readCffTable(font, readSfntTableDirectory(font)!)!.localSubrs).toEqual([]);
  });

  it('refuses rather than falling back when FDSelect names an FD the FDArray does not have', () => {
    const font = createSyntheticFont({
      charstrings: [new Uint8Array([14])],
      cid: { fdSelect: [5], pools: [[]] },
      flavor: 'opentype',
    });
    // A fallback to pool 0 would be the wrong-pool outcome wearing a reasonable-looking default.
    expect(readCffTable(font, readSfntTableDirectory(font)!)).toBeNull();
  });
});
