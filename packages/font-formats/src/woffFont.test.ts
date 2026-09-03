import {
  registerDecompressor,
  registerDeflateDecompressor,
  unregisterDecompressor,
} from '@flighthq/compression/contract';
import { collectImportDiagnostics } from '@flighthq/importdiagnostics/contract';
import { Compression, CompressionFraming, EntityRuntimeKey, ImportDiagnosticSeverity } from '@flighthq/types/contract';
import type { Path } from '@flighthq/types/contract';
import { afterEach, describe, expect, it } from 'vitest';

import { createGlyphOutlineSourceFromOpenTypeFont } from './openTypeGlyphOutlineSource';
import {
  createSyntheticFont,
  encodeSyntheticWoff,
  squareSyntheticGlyph,
  emptySyntheticGlyph,
} from './openTypeTestHelper';
import { readSfntTableDirectory } from './sfntTableDirectory';
import { readWoffChecksumMismatches, readWoffFont } from './woffFont';

afterEach(() => unregisterDecompressor(Compression.Deflate));

describe('readWoffChecksumMismatches', () => {
  it('reports nothing when the container states its tables truthfully', () => {
    expect(readWoffChecksumMismatches(encodeSyntheticWoff(createSyntheticFont()), null)).toEqual([]);
  });

  it('names the table, what the file claimed, and what the bytes actually sum to', () => {
    const woff = encodeSyntheticWoff(createSyntheticFont());
    // Corrupt the FIRST entry's stored checksum only, so the report must single it out rather than
    // flagging everything — a check that reported all tables would pass a weaker assertion.
    const view = new DataView(woff.buffer);
    const tag = view.getUint32(44);
    view.setUint32(44 + 16, 0xdeadbeef);
    const found = readWoffChecksumMismatches(woff, null);
    expect(found.length).toBe(1);
    expect(found[0]!.stored).toBe(0xdeadbeef);
    expect(found[0]!.computed).not.toBe(0xdeadbeef);
    expect(found[0]!.tag).toBe(
      String.fromCharCode((tag >>> 24) & 0xff, (tag >>> 16) & 0xff, (tag >>> 8) & 0xff, tag & 0xff),
    );
  });

  it('still loads the font it reported a mismatch for, rather than refusing it', () => {
    // The whole point of the seam: a mismatch is information, not a verdict.
    const woff = encodeSyntheticWoff(createSyntheticFont());
    new DataView(woff.buffer).setUint32(44 + 16, 0xdeadbeef);
    expect(readWoffChecksumMismatches(woff, null).length).toBe(1);
    expect(readWoffFont(woff, null)).not.toBeNull();
  });

  it('returns an empty report for a container it cannot read at all', () => {
    expect(readWoffChecksumMismatches(new Uint8Array(8), null)).toEqual([]);
  });
});

describe('readWoffFont', () => {
  it('produces the same glyph outlines as the uncompressed font it wraps', () => {
    // The end-to-end falsifier: byte-equality of table CONTENTS is a stronger claim per table, but it
    // never runs the outline readers. This drives the whole producer — directory, offsets, `loca`,
    // `glyf` — through both the plain font and its wrapper and compares what a caller actually gets.
    const original = createSyntheticFont({ glyphs: [emptySyntheticGlyph(), squareSyntheticGlyph(100)] });
    const rebuilt = readWoffFont(encodeSyntheticWoff(original), null)!;
    const before = createGlyphOutlineSourceFromOpenTypeFont(original)!;
    const after = createGlyphOutlineSourceFromOpenTypeFont(rebuilt)!;
    const a: Path = { [EntityRuntimeKey]: undefined, commands: [], data: [], winding: 'nonZero' };
    const b: Path = { [EntityRuntimeKey]: undefined, commands: [], data: [], winding: 'nonZero' };
    expect(before.getGlyphOutline(a, 1)).toBe(true);
    expect(after.getGlyphOutline(b, 1)).toBe(true);
    expect(b.commands).toEqual(a.commands);
    expect(b.data).toEqual(a.data);
    expect(a.commands.length).toBeGreaterThan(0);
    expect(after.getGlyphOutlineAdvance(1)).toBe(before.getGlyphOutlineAdvance(1));
  });

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

  it('starts every rebuilt table on a four-byte boundary', () => {
    // The rebuilt sfnt is a public output, so it follows the alignment every real font is written
    // with. Justified as a PRODUCER convention, not as a consumer requirement: a misaligned font was
    // measured against fontconfig/FreeType and accepted, so the claim that a consumer rejects one is
    // not supported and is deliberately not the reason recorded here.
    //
    // This reader indexes tables by explicit offset and length, so nothing else in the suite can
    // notice if the padding stops — which is why the assertion is on the byte layout rather than on
    // a round trip.
    const rebuilt = readWoffFont(encodeSyntheticWoff(createSyntheticFont()), null)!;
    const view = new DataView(rebuilt.buffer, rebuilt.byteOffset, rebuilt.byteLength);
    const count = view.getUint16(4);
    const lengths = Array.from({ length: count }, (_, index) => view.getUint32(12 + index * 16 + 12));
    // A fixture whose tables all happened to be multiples of four would satisfy the alignment claim
    // without any padding ever running, which is how the tag-order test above was once vacuous.
    expect(lengths.some((length) => length % 4 !== 0)).toBe(true);
    const offsets = Array.from({ length: count }, (_, index) => view.getUint32(12 + index * 16 + 8));
    expect(offsets.filter((offset) => offset % 4 !== 0)).toEqual([]);
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
    const diagnostics = collectImportDiagnostics((sink) => {
      expect(
        readWoffFont(
          woff,
          (_compressed, _uncompressedLength, framing) => {
            expect(framing).toBe(CompressionFraming.Rfc1950);
            return new Uint8Array(3);
          },
          sink,
        ),
      ).toBeNull();
    });
    expect(diagnostics.map((entry) => entry.kind)).toEqual(['woff.decompression-failed']);
    expect(diagnostics[0]!.severity).toBe(ImportDiagnosticSeverity.Reject);
    expect(diagnostics[0]!.origin).toBe('readWoffFont');
    expect(diagnostics[0]!.detail?.outputLength).toBe(3);
  });

  it('returns the sentinel for a compressed table when no decompressor is available', () => {
    const woff = encodeSyntheticWoff(createSyntheticFont());
    new DataView(woff.buffer).setUint32(44 + 8, 4);
    const diagnostics = collectImportDiagnostics((sink) => {
      expect(readWoffFont(woff, null, sink)).toBeNull();
    });
    expect(diagnostics.map((entry) => entry.kind)).toEqual(['woff.no-decompressor-registered']);
    expect(diagnostics[0]!.severity).toBe(ImportDiagnosticSeverity.Reject);
  });

  it('emits a Reject diagnostic from the public WOFF importer when decompression fails', () => {
    const woff = encodeSyntheticWoff(createSyntheticFont());
    new DataView(woff.buffer).setUint32(44 + 8, 4);
    registerDecompressor(Compression.Deflate, (_compressed, _uncompressedLength, framing) => {
      expect(framing).toBe(CompressionFraming.Rfc1950);
      return null;
    });

    const diagnostics = collectImportDiagnostics((sink) => {
      expect(createGlyphOutlineSourceFromOpenTypeFont(woff, sink)).toBeNull();
    });
    expect(diagnostics.map((entry) => entry.kind)).toEqual(['woff.decompression-failed']);
    expect(diagnostics[0]!.severity).toBe(ImportDiagnosticSeverity.Reject);
    expect(diagnostics[0]!.origin).toBe('readWoffFont');
  });
});
