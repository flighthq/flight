import { describe, expect, it } from 'vitest';

import {
  decodeWoff2Triplet,
  getWoff2BboxBitmapByteLength,
  hasWoff2GlyphBbox,
  isWoff2PointOnCurve,
  measureWoff2CompositeGlyph,
  readWoff2GlyfStreams,
  readWoff2Short,
  reverseWoff2GlyfTransform,
} from './woff2GlyfTransform';

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

describe('decodeWoff2Triplet', () => {
  const bytes = Uint8Array.from([0x12, 0x34, 0x56, 0x78]);

  it('moves on one axis only for the two single-axis blocks', () => {
    // Codes 0-9 move in y alone, 10-19 in x alone; the other axis is not merely small, it is zero.
    expect(decodeWoff2Triplet(0, bytes, 0)).toEqual({ dx: 0, dy: -0x12, used: 1 });
    expect(decodeWoff2Triplet(10, bytes, 0)).toEqual({ dx: -0x12, dy: 0, used: 1 });
  });

  it('steps the single-axis base by 256 every two codes', () => {
    expect(decodeWoff2Triplet(2, bytes, 0)!.dy).toBe(-(256 + 0x12));
    expect(decodeWoff2Triplet(9, bytes, 0)!.dy).toBe(1024 + 0x12);
  });

  it('reads the X sign from bit 0 of the group and Y from bit 1, not the reverse', () => {
    // The group order is (-,-) (+,-) (-,+) (+,+). Swapping the two bits mirrors every diagonal delta
    // and still draws a glyph, so this is the assertion that catches it.
    expect(decodeWoff2Triplet(20, bytes, 0)).toEqual({ dx: -(1 + 0x1), dy: -(1 + 0x2), used: 1 });
    expect(decodeWoff2Triplet(21, bytes, 0)).toEqual({ dx: 1 + 0x1, dy: -(1 + 0x2), used: 1 });
    expect(decodeWoff2Triplet(22, bytes, 0)).toEqual({ dx: -(1 + 0x1), dy: 1 + 0x2, used: 1 });
    expect(decodeWoff2Triplet(23, bytes, 0)).toEqual({ dx: 1 + 0x1, dy: 1 + 0x2, used: 1 });
  });

  it('bases the four-bit block at 1, 17, 33 and 49 across its sixteen-code spans', () => {
    expect(decodeWoff2Triplet(23, bytes, 0)!.dx).toBe(1 + 0x1);
    expect(decodeWoff2Triplet(39, bytes, 0)!.dx).toBe(17 + 0x1);
    expect(decodeWoff2Triplet(55, bytes, 0)!.dx).toBe(33 + 0x1);
    expect(decodeWoff2Triplet(71, bytes, 0)!.dx).toBe(49 + 0x1);
  });

  it('takes two bytes for the eight-bit block, based at 1, 257 and 513', () => {
    expect(decodeWoff2Triplet(87, bytes, 0)).toEqual({ dx: 1 + 0x12, dy: 1 + 0x34, used: 2 });
    expect(decodeWoff2Triplet(99, bytes, 0)!.dx).toBe(257 + 0x12);
    expect(decodeWoff2Triplet(111, bytes, 0)!.dx).toBe(513 + 0x12);
  });

  it('adds NO base to the twelve- and sixteen-bit blocks, unlike every narrower one', () => {
    // An off-by-one here shifts only the largest deltas, so most glyphs would still look right.
    expect(decodeWoff2Triplet(123, bytes, 0)).toEqual({ dx: 0x123, dy: 0x456, used: 3 });
    expect(decodeWoff2Triplet(127, bytes, 0)).toEqual({ dx: 0x1234, dy: 0x5678, used: 4 });
  });

  it('returns the sentinel rather than a short read when the stream ends mid-point', () => {
    expect(decodeWoff2Triplet(127, bytes, 1)).toBeNull();
    expect(decodeWoff2Triplet(0, bytes, 4)).toBeNull();
  });
});

describe('getWoff2BboxBitmapByteLength', () => {
  it('pads to a 32-bit boundary, not to a byte', () => {
    // The distinction is invisible for a count that lands on the same 4-byte cell either way, so a
    // byte-rounded reading is correct for some fonts and wrong for others. 1754 rounds to 220 under
    // both rules and can never tell them apart; 1741 rounds to 218 by byte and 220 by word.
    expect(getWoff2BboxBitmapByteLength(1754)).toBe(220);
    expect(getWoff2BboxBitmapByteLength(1741)).toBe(220);
    expect(getWoff2BboxBitmapByteLength(1)).toBe(4);
    expect(getWoff2BboxBitmapByteLength(32)).toBe(4);
    expect(getWoff2BboxBitmapByteLength(33)).toBe(8);
  });

  it('is zero only for a font with no glyphs', () => {
    expect(getWoff2BboxBitmapByteLength(0)).toBe(0);
  });
});

describe('hasWoff2GlyphBbox', () => {
  it('reads glyph zero as the HIGH bit of the first byte', () => {
    // Least-significant-first recovers a scattered subset of the boxes and mis-assigns the rest, which
    // is worse than being plainly wrong: it is the reading that looks partly right.
    expect(hasWoff2GlyphBbox(Uint8Array.from([0x80]), 0)).toBe(true);
    expect(hasWoff2GlyphBbox(Uint8Array.from([0x01]), 0)).toBe(false);
    expect(hasWoff2GlyphBbox(Uint8Array.from([0x01]), 7)).toBe(true);
  });

  it('walks into later bytes by glyph index', () => {
    const bitmap = Uint8Array.from([0x00, 0x40, 0x00, 0x02]);
    expect(hasWoff2GlyphBbox(bitmap, 9)).toBe(true);
    expect(hasWoff2GlyphBbox(bitmap, 30)).toBe(true);
    expect(hasWoff2GlyphBbox(bitmap, 8)).toBe(false);
  });

  it('reports absent rather than throwing past the end of the bitmap', () => {
    expect(hasWoff2GlyphBbox(Uint8Array.from([0xff]), 64)).toBe(false);
  });
});

describe('isWoff2PointOnCurve', () => {
  it('reads the high bit as OFF-curve, the opposite of the glyf convention', () => {
    // Carrying the glyf convention across inverts every point in the font, and an inverted outline is
    // still a closed outline that draws as a glyph — so this assertion is the only thing standing
    // between the two readings.
    expect(isWoff2PointOnCurve(0x00)).toBe(true);
    expect(isWoff2PointOnCurve(0x80)).toBe(false);
  });

  it('ignores the triplet code in the low seven bits', () => {
    // The same code must read the same either way, or the sense would depend on the coordinate size.
    expect(isWoff2PointOnCurve(0x7f)).toBe(true);
    expect(isWoff2PointOnCurve(0xff)).toBe(false);
    expect(isWoff2PointOnCurve(0x2a)).toBe(true);
    expect(isWoff2PointOnCurve(0xaa)).toBe(false);
  });
});

describe('measureWoff2CompositeGlyph', () => {
  it('sizes a single component from its argument width', () => {
    // Flags and glyph index are four bytes, then the placement arguments: two bytes as signed bytes, or
    // four when ARG_1_AND_2_ARE_WORDS is set.
    expect(measureWoff2CompositeGlyph(composite([{ flags: 0 }]), 0)).toEqual({
      byteLength: 6,
      hasInstructions: false,
    });
    expect(measureWoff2CompositeGlyph(composite([{ flags: 0x0001 }]), 0)!.byteLength).toBe(8);
  });

  it('sizes each of the three transform forms', () => {
    expect(measureWoff2CompositeGlyph(composite([{ flags: 0x0008 }]), 0)!.byteLength).toBe(8);
    expect(measureWoff2CompositeGlyph(composite([{ flags: 0x0040 }]), 0)!.byteLength).toBe(10);
    expect(measureWoff2CompositeGlyph(composite([{ flags: 0x0080 }]), 0)!.byteLength).toBe(14);
  });

  it('treats the transform forms as exclusive rather than cumulative', () => {
    // A record cannot carry two transforms. Adding the widths instead of choosing the widest set bit
    // would read 2 + 4 + 8 here and overshoot every transformed component in the font.
    expect(measureWoff2CompositeGlyph(composite([{ flags: 0x0008 | 0x0040 | 0x0080 }]), 0)!.byteLength).toBe(8);
  });

  it('walks every component while MORE_COMPONENTS is set', () => {
    const stream = composite([{ flags: 0x0020 }, { flags: 0 }]);
    expect(measureWoff2CompositeGlyph(stream, 0)!.byteLength).toBe(12);
  });

  it('reports instructions requested by a component other than the first', () => {
    // The bit is per-component, and a caller that inspected only the first record would miss this one —
    // which is the shape that desynchronises the glyph stream for every simple glyph that follows.
    const stream = composite([{ flags: 0x0020 }, { flags: 0x0100 }]);
    expect(measureWoff2CompositeGlyph(stream, 0)).toEqual({ byteLength: 12, hasInstructions: true });
  });

  it('measures from the offset it is given rather than the start of the stream', () => {
    const stream = composite([{ flags: 0x0080 }, { flags: 0 }]);
    expect(measureWoff2CompositeGlyph(stream, 14)).toEqual({ byteLength: 6, hasInstructions: false });
  });

  it('returns the sentinel when the records run past the end of the stream', () => {
    // MORE_COMPONENTS set with nothing following it: a clamped read here would report a plausible size
    // for a record that is not there.
    expect(measureWoff2CompositeGlyph(composite([{ flags: 0x0020 }]), 0)).toBeNull();
    expect(measureWoff2CompositeGlyph(composite([{ flags: 0 }]).subarray(0, 5), 0)).toBeNull();
  });
});

// Component records as the `glyf` format writes them: uint16 flags, uint16 glyph index, then the
// argument and transform bytes the flags call for. The bodies are left zero — only the sizes are read.
function composite(components: readonly { flags: number }[]): Uint8Array {
  const parts: number[] = [];
  for (const { flags } of components) {
    parts.push(flags >> 8, flags & 0xff, 0, 0);
    for (let index = 0; index < ((flags & 0x0001) !== 0 ? 4 : 2); index += 1) parts.push(0);
    const transform = (flags & 0x0008) !== 0 ? 2 : (flags & 0x0040) !== 0 ? 4 : (flags & 0x0080) !== 0 ? 8 : 0;
    for (let index = 0; index < transform; index += 1) parts.push(0);
  }
  return new Uint8Array(parts);
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

describe('reverseWoff2GlyfTransform', () => {
  it('returns the sentinel rather than a partial table when a stream runs short', () => {
    // A truncated walk produces real-looking glyphs for every index before the break, so a partial
    // result is the silent failure and a refusal is the visible one.
    const streams = readWoff2GlyfStreams(transformedGlyf([2, 1, 1, 1, 0, 0, 0], 3))!;
    expect(reverseWoff2GlyfTransform(streams)).toBeNull();
  });

  it('emits a zero-length record for a glyph with no contours, and a loca that says so', () => {
    // Three blank glyphs: loca must hold four equal offsets, which is how a blank glyph is expressed.
    const streams = readWoff2GlyfStreams(transformedGlyf([6, 0, 0, 0, 0, 0, 0], 3))!;
    streams.nContourStream.fill(0);
    const out = reverseWoff2GlyfTransform(streams)!;
    expect(out.glyf.byteLength).toBe(0);
    const view = new DataView(out.loca.buffer, out.loca.byteOffset, out.loca.byteLength);
    expect([0, 1, 2, 3].map((index) => view.getUint16(index * 2))).toEqual([0, 0, 0, 0]);
  });
});
