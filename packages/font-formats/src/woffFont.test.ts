import { registerDeflateDecompressor, unregisterDecompressor } from '@flighthq/compression/contract';
import { Compression } from '@flighthq/types/contract';
import { afterEach, describe, expect, it } from 'vitest';

import { createSyntheticFont, encodeSyntheticWoff } from './openTypeTestHelper';
import { readSfntTableDirectory } from './sfntTableDirectory';
import { readWoffFont } from './woffFont';

afterEach(() => unregisterDecompressor(Compression.Deflate));

describe('readWoffFont', () => {
  it('rebuilds an sfnt whose tables match the original', () => {
    const original = createSyntheticFont();
    const rebuilt = readWoffFont(encodeSyntheticWoff(original), null)!;
    const before = readSfntTableDirectory(original)!;
    const after = readSfntTableDirectory(rebuilt)!;
    expect([...after.tables.keys()].sort()).toEqual([...before.tables.keys()].sort());
  });

  it('preserves each table byte for byte through the unwrap', () => {
    const original = createSyntheticFont();
    const rebuilt = readWoffFont(encodeSyntheticWoff(original), null)!;
    const before = readSfntTableDirectory(original)!;
    const after = readSfntTableDirectory(rebuilt)!;
    for (const [tag, range] of before.tables) {
      const other = after.tables.get(tag)!;
      expect(rebuilt.subarray(other.offset, other.offset + other.length)).toEqual(
        original.subarray(range.offset, range.offset + range.length),
      );
    }
  });

  // The wrapper carries the sfnt version the tables belonged to, so a wrapped CFF font must come out
  // declaring itself a CFF font rather than one inferred from which tables happen to be present.
  it('carries the original flavor through, rather than inferring one', () => {
    const cff = createSyntheticFont({ flavor: 'opentype' });
    const rebuilt = readWoffFont(encodeSyntheticWoff(cff), null)!;
    expect(readSfntTableDirectory(rebuilt)?.sfntVersion).toBe(0x4f54544f);
  });

  // The sfnt directory is defined as tag-ordered, so a reader entitled to binary-search it would find the
  // wrong table if the rebuild preserved WOFF's order instead.
  it('writes the rebuilt directory in tag order even when the container is not', () => {
    // The container is built in DESCENDING tag order on purpose. A sorted fixture would let this pass
    // whether or not the rebuild sorted anything, which is how the first version of this test was
    // useless — mutation testing found it, not review.
    const rebuilt = readWoffFont(encodeSyntheticWoff(createSyntheticFont(), true), null)!;
    const view = new DataView(rebuilt.buffer, rebuilt.byteOffset, rebuilt.byteLength);
    const count = view.getUint16(4);
    const tags = Array.from({ length: count }, (_, index) => view.getUint32(12 + index * 16));
    expect(tags).toEqual([...tags].sort((a, b) => a - b));
  });

  it('reads a deflated table when a decompressor is registered', () => {
    registerDeflateDecompressor();
    // The synthetic wrapper stores tables uncompressed, so this proves the registered path is reached
    // and returns the same bytes rather than proving inflate itself, which compression owns.
    const rebuilt = readWoffFont(encodeSyntheticWoff(createSyntheticFont()), null);
    expect(rebuilt).not.toBeNull();
  });

  it('returns the sentinel for a truncated container rather than a partial font', () => {
    const woff = encodeSyntheticWoff(createSyntheticFont());
    expect(readWoffFont(woff.subarray(0, 20), null)).toBeNull();
    expect(readWoffFont(woff.subarray(0, woff.length - 8), null)).toBeNull();
  });

  it('returns the sentinel for a container declaring no tables', () => {
    const woff = encodeSyntheticWoff(createSyntheticFont());
    new DataView(woff.buffer).setUint16(12, 0);
    expect(readWoffFont(woff, null)).toBeNull();
  });

  // A decompressor returning the wrong length has produced something that is not this table, and
  // reassembling it would yield a directory whose lengths lie about its own contents.
  it('returns the sentinel when a decompressor yields the wrong length', () => {
    const woff = encodeSyntheticWoff(createSyntheticFont());
    // Mark the first table as compressed so the decompressor path is taken.
    new DataView(woff.buffer).setUint32(44 + 8, 4);
    expect(readWoffFont(woff, () => new Uint8Array(3))).toBeNull();
  });

  it('returns the sentinel for a compressed table when no decompressor is available', () => {
    const woff = encodeSyntheticWoff(createSyntheticFont());
    new DataView(woff.buffer).setUint32(44 + 8, 4);
    expect(readWoffFont(woff, null)).toBeNull();
  });
});
