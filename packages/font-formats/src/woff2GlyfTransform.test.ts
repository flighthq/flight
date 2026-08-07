import { describe, expect, it } from 'vitest';

import { readWoff2GlyfStreams, readWoff2Short } from './woff2GlyfTransform';

// Builds a transformed `glyf` header over seven streams of the given sizes, filled with a distinct byte
// each so a mis-ordered carve shows up as the wrong contents rather than only the wrong length.
function transformedGlyf(sizes: readonly number[], glyphCount = 3, indexFormat = 0): Uint8Array {
  const total = 36 + sizes.reduce((sum, size) => sum + size, 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint16(4, glyphCount);
  view.setUint16(6, indexFormat);
  sizes.forEach((size, index) => view.setUint32(8 + index * 4, size));
  let at = 36;
  sizes.forEach((size, index) => {
    out.fill(index + 1, at, at + size);
    at += size;
  });
  return out;
}

describe('readWoff2GlyfStreams', () => {
  it('carves the seven streams in their declared order', () => {
    // Distinct sizes AND distinct fills: equal sizes would let a wrongly-ordered carve pass.
    const streams = readWoff2GlyfStreams(transformedGlyf([6, 1, 2, 3, 4, 5, 7]))!;
    expect(streams.nContourStream.byteLength).toBe(6);
    expect(streams.nPointsStream.byteLength).toBe(1);
    expect(streams.flagStream.byteLength).toBe(2);
    expect(streams.glyphStream.byteLength).toBe(3);
    expect(streams.compositeStream.byteLength).toBe(4);
    expect(streams.bboxStream.byteLength).toBe(5);
    expect(streams.instructionStream.byteLength).toBe(7);
    // Each stream was filled with its own index, so this pins WHICH bytes each name got.
    expect([...streams.nContourStream]).toEqual([1, 1, 1, 1, 1, 1]);
    expect([...streams.instructionStream]).toEqual([7, 7, 7, 7, 7, 7, 7]);
  });

  it('carries the glyph count and loca width from the header', () => {
    const streams = readWoff2GlyfStreams(transformedGlyf([2, 1, 1, 1, 1, 1, 1], 41, 1))!;
    expect(streams.glyphCount).toBe(41);
    expect(streams.indexFormat).toBe(1);
  });

  it('returns the sentinel when the sizes do not account for the table exactly', () => {
    // A truncated stream still decodes into real-looking contour counts, so a partial carve would be
    // silently wrong rather than visibly broken.
    const short = transformedGlyf([4, 1, 1, 1, 1, 1, 1]).subarray(0, 40);
    expect(readWoff2GlyfStreams(short)).toBeNull();
  });

  it('returns the sentinel when the table carries bytes no stream claims', () => {
    const table = transformedGlyf([4, 1, 1, 1, 1, 1, 1]);
    const padded = new Uint8Array(table.byteLength + 3);
    padded.set(table);
    expect(readWoff2GlyfStreams(padded)).toBeNull();
  });

  it('returns the sentinel for a table shorter than its own header', () => {
    expect(readWoff2GlyfStreams(new Uint8Array(20))).toBeNull();
  });
});

describe('readWoff2Short', () => {
  it('reads a plain byte below the first escape code', () => {
    const cursor = { at: 0 };
    expect(readWoff2Short(Uint8Array.from([200]), cursor, 1)).toBe(200);
    expect(cursor.at).toBe(1);
  });

  it('reads the two-byte word form', () => {
    const cursor = { at: 0 };
    expect(readWoff2Short(Uint8Array.from([253, 0x12, 0x34]), cursor, 3)).toBe(0x1234);
    expect(cursor.at).toBe(3);
  });

  it('offsets the two one-more-byte forms by different amounts', () => {
    // 254 and 255 differ only in their offset, so a reader that swapped them would still return a
    // plausible small number. Pinning both against the same payload byte is what separates them.
    expect(readWoff2Short(Uint8Array.from([255, 10]), { at: 0 }, 2)).toBe(263);
    expect(readWoff2Short(Uint8Array.from([254, 10]), { at: 0 }, 2)).toBe(516);
  });

  it('returns the sentinel rather than a short value when the stream ends mid-escape', () => {
    expect(readWoff2Short(Uint8Array.from([253, 0x12]), { at: 0 }, 2)).toBe(-1);
    expect(readWoff2Short(Uint8Array.from([255]), { at: 0 }, 1)).toBe(-1);
    expect(readWoff2Short(Uint8Array.from([]), { at: 0 }, 0)).toBe(-1);
  });
});
