import type { Decompressor } from '@flighthq/types/contract';
import { Compression, CompressionFraming } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { createSyntheticFont, encodeSyntheticWoff2 } from './openTypeTestHelper';
import { readSfntTableDirectory } from './sfntTableDirectory';
import { readWoff2Font, readWoff2TableDirectory, WOFF2_COMPRESSION } from './woff2Font';

// The synthetic container stores its stream uncompressed, so the whole container path is reachable with
// an identity decompressor and no Brotli implementation anywhere near the suite.
const identity: Decompressor = (compressed, _uncompressedLength, framing) => {
  expect(framing).toBe(CompressionFraming.Raw);
  return compressed as Uint8Array;
};

describe('readWoff2Font', () => {
  it('rebuilds an sfnt carrying the same tables as the original', () => {
    const original = createSyntheticFont();
    const rebuilt = readWoff2Font(encodeSyntheticWoff2(original), identity, null)!;
    const before = readSfntTableDirectory(original)!;
    const after = readSfntTableDirectory(rebuilt)!;
    expect([...after.tables.keys()].sort()).toEqual([...before.tables.keys()].sort());
  });

  it('preserves each table byte for byte through the unwrap', () => {
    const original = createSyntheticFont();
    const rebuilt = readWoff2Font(encodeSyntheticWoff2(original), identity, null)!;
    const before = readSfntTableDirectory(original)!;
    const after = readSfntTableDirectory(rebuilt)!;
    for (const [tag, table] of before.tables) {
      const mirror = after.tables.get(tag)!;
      expect([...rebuilt.subarray(mirror.offset, mirror.offset + mirror.length)]).toEqual([
        ...original.subarray(table.offset, table.offset + table.length),
      ]);
    }
  });

  it('carries the original flavor through, rather than inferring one', () => {
    const original = createSyntheticFont({ flavor: 'opentype' });
    const rebuilt = readWoff2Font(encodeSyntheticWoff2(original), identity, null)!;
    expect(new DataView(rebuilt.buffer).getUint32(0)).toBe(0x4f54544f);
  });

  it('returns the sentinel when no decompressor is available', () => {
    expect(readWoff2Font(encodeSyntheticWoff2(createSyntheticFont()), null, null)).toBeNull();
  });

  it('returns the sentinel for a transformed table when no transform reversal is supplied', () => {
    // Refusing is the point: emitting the transformed bytes under the table's own tag would produce a
    // font whose directory says `glyf` over something that is not one.
    const wrapped = encodeSyntheticWoff2(createSyntheticFont(), ['glyf']);
    expect(readWoff2Font(wrapped, identity, null)).toBeNull();
  });

  it('hands a transformed table to the reversal and uses what it returns', () => {
    const replacement = Uint8Array.from([1, 2, 3, 4]);
    const seen: string[] = [];
    const wrapped = encodeSyntheticWoff2(createSyntheticFont(), ['glyf']);
    const rebuilt = readWoff2Font(wrapped, identity, (tag) => {
      seen.push(tag);
      return replacement;
    })!;
    expect(seen).toEqual(['glyf']);
    const glyf = readSfntTableDirectory(rebuilt)!.tables.get('glyf')!;
    expect([...rebuilt.subarray(glyf.offset, glyf.offset + glyf.length)]).toEqual([...replacement]);
  });

  it('returns the sentinel when the transform reversal declines', () => {
    const wrapped = encodeSyntheticWoff2(createSyntheticFont(), ['glyf']);
    expect(readWoff2Font(wrapped, identity, () => null)).toBeNull();
  });

  it('returns the sentinel for a truncated container rather than a partial font', () => {
    const wrapped = encodeSyntheticWoff2(createSyntheticFont());
    expect(readWoff2Font(wrapped.subarray(0, 40), identity, null)).toBeNull();
  });
});

describe('readWoff2TableDirectory', () => {
  it('resolves tags carried as an index into the known-tag table', () => {
    const directory = readWoff2TableDirectory(encodeSyntheticWoff2(createSyntheticFont()))!;
    expect(directory.entries.map((entry) => entry.tag)).toContain('glyf');
    expect(directory.entries.map((entry) => entry.tag)).toContain('cmap');
  });

  it('points streamStart past the directory rather than at a guess from the end', () => {
    const wrapped = encodeSyntheticWoff2(createSyntheticFont());
    const directory = readWoff2TableDirectory(wrapped)!;
    expect(directory.streamStart).toBeGreaterThan(48);
    // The stream runs from there to the end of the file, so the two must agree exactly. Deriving the
    // start by subtracting instead lands in the format's trailing padding.
    expect(directory.streamStart + directory.totalUncompressedLength).toBe(wrapped.byteLength);
  });

  it('reads the transform flag with the sense inverted for the glyph pair', () => {
    // `glyf` is marked transformed here and `cmap` is not. Both are encoded with the version whose
    // meaning is opposite between them, so a reader applying one rule to both gets both answers wrong.
    const directory = readWoff2TableDirectory(encodeSyntheticWoff2(createSyntheticFont(), ['glyf']))!;
    const glyf = directory.entries.find((entry) => entry.tag === 'glyf')!;
    const cmap = directory.entries.find((entry) => entry.tag === 'cmap')!;
    expect(glyf.transformed).toBe(true);
    expect(glyf.transformVersion).toBe(0);
    expect(cmap.transformed).toBe(false);
    expect(cmap.transformVersion).toBe(0);
  });

  it('treats the glyph pair as untransformed only at version three', () => {
    const directory = readWoff2TableDirectory(encodeSyntheticWoff2(createSyntheticFont()))!;
    const glyf = directory.entries.find((entry) => entry.tag === 'glyf')!;
    expect(glyf.transformVersion).toBe(3);
    expect(glyf.transformed).toBe(false);
  });

  it('returns the sentinel for a container declaring no tables', () => {
    const wrapped = encodeSyntheticWoff2(createSyntheticFont());
    new DataView(wrapped.buffer).setUint16(12, 0);
    expect(readWoff2TableDirectory(wrapped)).toBeNull();
  });

  it('returns the sentinel when the directory runs past the buffer', () => {
    expect(readWoff2TableDirectory(encodeSyntheticWoff2(createSyntheticFont()).subarray(0, 50))).toBeNull();
  });
});

describe('WOFF2_COMPRESSION', () => {
  it('names Brotli through the shared vocabulary so a caller registers what this asks for', () => {
    expect(WOFF2_COMPRESSION).toBe(Compression.Brotli);
  });
});
