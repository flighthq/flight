import { describe, expect, it } from 'vitest';

import { createSyntheticFont } from './openTypeTestHelper';
import { readSfntTableDirectory, readSfntTag } from './sfntTableDirectory';

describe('readSfntTableDirectory', () => {
  it('reads every table a well-formed font declares', () => {
    const directory = readSfntTableDirectory(createSyntheticFont())!;
    expect(directory.tables.has('glyf')).toBe(true);
    expect(directory.tables.has('cmap')).toBe(true);
    expect(directory.declaredTableCount).toBe(directory.tables.size);
  });

  it('reports the container flavor from the sfnt version', () => {
    expect(readSfntTableDirectory(createSyntheticFont())?.sfntVersion).toBe(0x00010000);
    // 'OTTO' — the same directory layout, PostScript outlines behind it.
    expect(readSfntTableDirectory(createSyntheticFont({ flavor: 'opentype' }))?.sfntVersion).toBe(0x4f54544f);
  });

  it('gives each table a byte range that lies inside the file', () => {
    const font = createSyntheticFont();
    for (const range of readSfntTableDirectory(font)!.tables.values()) {
      expect(range.offset + range.length).toBeLessThanOrEqual(font.byteLength);
    }
  });

  // The distinction the explanation is built on: a truncated file still DECLARES every table, and the
  // gap between what it declares and what is readable is what localizes the damage.
  it('keeps the declared count while dropping tables that fall outside a truncated file', () => {
    const font = createSyntheticFont();
    const whole = readSfntTableDirectory(font)!;
    const truncated = readSfntTableDirectory(font.subarray(0, font.length - 8))!;
    expect(truncated.declaredTableCount).toBe(whole.declaredTableCount);
    expect(truncated.tables.size).toBeLessThan(whole.tables.size);
  });

  it('returns the sentinel for bytes shorter than the header', () => {
    expect(readSfntTableDirectory(new Uint8Array(11))).toBeNull();
    expect(readSfntTableDirectory(new Uint8Array(0))).toBeNull();
  });

  it('stops rather than reading past the buffer when the header overstates the table count', () => {
    const bytes = new Uint8Array(12);
    new DataView(bytes.buffer).setUint16(4, 500);
    const directory = readSfntTableDirectory(bytes)!;
    expect(directory.declaredTableCount).toBe(500);
    expect(directory.tables.size).toBe(0);
  });
});

describe('readSfntTag', () => {
  it('reads four bytes as the characters every specification spells a tag with', () => {
    expect(readSfntTag(new Uint8Array([0x67, 0x6c, 0x79, 0x66]), 0)).toBe('glyf');
  });

  it('preserves a significant trailing space', () => {
    // `CFF ` is four characters, the last one a space. Trimming it makes the tag miss its own table.
    expect(readSfntTag(new Uint8Array([0x43, 0x46, 0x46, 0x20]), 0)).toBe('CFF ');
  });

  it('reads from the given offset rather than the start', () => {
    expect(readSfntTag(new Uint8Array([0, 0, 0x68, 0x65, 0x61, 0x64]), 2)).toBe('head');
  });
});
