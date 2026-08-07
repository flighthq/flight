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
