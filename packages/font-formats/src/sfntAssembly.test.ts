import { describe, expect, it } from 'vitest';

import {
  assembleSfntFont,
  computeSfntTableChecksum,
  encodeSfntCompositeGlyph,
  encodeSfntLoca,
  encodeSfntSimpleGlyph,
  packSfntTag,
} from './sfntAssembly';

describe('assembleSfntFont', () => {
  it('writes the directory in tag order whatever order it was given', () => {
    // Reversed on purpose. A pre-sorted input would pass whether or not anything sorted, which is how
    // the WOFF tag-order test was once vacuous.
    const font = assembleSfntFont(0x00010000, [
      { data: Uint8Array.from([9]), tag: packSfntTag('name') },
      { data: Uint8Array.from([7]), tag: packSfntTag('head') },
      { data: Uint8Array.from([8]), tag: packSfntTag('cmap') },
    ]);
    const view = new DataView(font.buffer);
    const tags = Array.from({ length: view.getUint16(4) }, (_, index) => view.getUint32(12 + index * 16));
    expect(tags).toEqual([packSfntTag('cmap'), packSfntTag('head'), packSfntTag('name')]);
  });

  it('starts every table on a four-byte boundary', () => {
    // Lengths chosen so that unpadded placement would land tables at odd offsets — without this the
    // assertion would hold whether or not any padding ran.
    const font = assembleSfntFont(0x00010000, [
      { data: Uint8Array.from([1]), tag: packSfntTag('aaaa') },
      { data: Uint8Array.from([2, 3, 4]), tag: packSfntTag('bbbb') },
      { data: Uint8Array.from([5, 6]), tag: packSfntTag('cccc') },
    ]);
    const view = new DataView(font.buffer);
    const count = view.getUint16(4);
    const offsets = Array.from({ length: count }, (_, index) => view.getUint32(12 + index * 16 + 8));
    expect(offsets.filter((offset) => offset % 4 !== 0)).toEqual([]);
  });

  it('preserves each table byte for byte at its declared offset and length', () => {
    const payload = Uint8Array.from([11, 22, 33, 44, 55]);
    const font = assembleSfntFont(0x4f54544f, [{ data: payload, tag: packSfntTag('CFF ') }]);
    const view = new DataView(font.buffer);
    const offset = view.getUint32(12 + 8);
    const length = view.getUint32(12 + 12);
    expect(length).toBe(payload.byteLength);
    expect([...font.subarray(offset, offset + length)]).toEqual([...payload]);
  });

  it('writes each table a real checksum rather than a zero', () => {
    const payload = Uint8Array.from([0, 0, 0, 7]);
    const font = assembleSfntFont(0x00010000, [{ data: payload, tag: packSfntTag('cmap') }]);
    const view = new DataView(font.buffer);
    expect(view.getUint32(12 + 4)).toBe(7);
    expect(view.getUint32(12 + 4)).toBe(computeSfntTableChecksum(payload));
  });

  it('carries the flavor it was given rather than inferring one', () => {
    const font = assembleSfntFont(0x4f54544f, [{ data: Uint8Array.from([0]), tag: packSfntTag('CFF ') }]);
    expect(new DataView(font.buffer).getUint32(0)).toBe(0x4f54544f);
  });
});

describe('computeSfntTableChecksum', () => {
  it('sums big-endian words', () => {
    expect(computeSfntTableChecksum(Uint8Array.from([0, 0, 0, 1, 0, 0, 0, 2]))).toBe(3);
  });

  it('pads a partial final word with zeros rather than dropping it', () => {
    // [0,0,1] is one short of a word. Dropping the tail would give 0; padding gives 0x100.
    expect(computeSfntTableChecksum(Uint8Array.from([0, 0, 1]))).toBe(0x100);
  });

  it('treats head checkSumAdjustment as zero, which is what stops every real font mismatching', () => {
    // Byte 8 begins checkSumAdjustment. The same bytes must sum differently for head than for any
    // other table, so the two calls below are what separates the exception from a no-op.
    const head = new Uint8Array(16);
    head[8] = 0xff;
    head[9] = 0xff;
    expect(computeSfntTableChecksum(head, false)).toBe(0xffff0000);
    expect(computeSfntTableChecksum(head, true)).toBe(0);
  });

  it('wraps modulo 2^32 rather than growing past a uint32', () => {
    const big = Uint8Array.from([0xff, 0xff, 0xff, 0xff, 0, 0, 0, 2]);
    expect(computeSfntTableChecksum(big)).toBe(1);
  });
});

describe('encodeSfntCompositeGlyph', () => {
  const box = { xMax: 9, xMin: 1, yMax: 8, yMin: 2 };
  const comps = Uint8Array.from([0x00, 0x20, 0x00, 0x03, 0x01, 0x02]);
  const none = new Uint8Array(0);

  it('marks the glyph composite with a negative contour count', () => {
    // Readers switch on the sign alone. A positive count here makes every reader parse the component
    // records as an endPtsOfContours array.
    const out = encodeSfntCompositeGlyph(comps, none, box, false);
    expect(new DataView(out.buffer, out.byteOffset, out.byteLength).getInt16(0)).toBeLessThan(0);
  });

  it('copies the component records unchanged', () => {
    const out = encodeSfntCompositeGlyph(comps, none, box, false);
    expect([...out.subarray(10, 16)]).toEqual([...comps]);
  });

  it('omits the instruction length entirely when no component asked for instructions', () => {
    // A zero length written unconditionally adds two bytes no reader expects, shifting every glyph
    // that follows.
    expect(encodeSfntCompositeGlyph(comps, none, box, false).byteLength).toBe(16);
  });

  it('writes the instruction length and bytes when a component did ask', () => {
    const out = encodeSfntCompositeGlyph(comps, Uint8Array.from([0xb0]), box, true);
    const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
    expect(out.byteLength).toBe(19);
    expect(view.getUint16(16)).toBe(1);
    expect(out[18]).toBe(0xb0);
  });

  it('carries the bounds it was given, since a composite cannot compute its own', () => {
    const out = encodeSfntCompositeGlyph(comps, none, box, false);
    const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
    expect([view.getInt16(2), view.getInt16(4), view.getInt16(6), view.getInt16(8)]).toEqual([1, 2, 9, 8]);
  });
});

describe('encodeSfntLoca', () => {
  it('writes one more offset than there are glyphs', () => {
    // The last entry is the end of the final glyph, which is how its length is expressed at all.
    expect(encodeSfntLoca([4, 6], 1)!.byteLength).toBe(12);
    expect(encodeSfntLoca([4, 6], 0)!.byteLength).toBe(6);
  });

  it('accumulates offsets in glyph order', () => {
    const out = encodeSfntLoca([4, 6, 2], 1)!;
    const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
    expect([0, 1, 2, 3].map((i) => view.getUint32(i * 4))).toEqual([0, 4, 10, 12]);
  });

  it('halves the offset in the short form', () => {
    const out = encodeSfntLoca([4, 6], 0)!;
    const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
    expect([0, 1, 2].map((i) => view.getUint16(i * 2))).toEqual([0, 2, 5]);
  });

  it('gives equal consecutive offsets for a blank glyph', () => {
    const out = encodeSfntLoca([4, 0, 4], 1)!;
    const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
    expect(view.getUint32(4)).toBe(view.getUint32(8));
  });

  it('refuses the short form for an odd offset rather than truncating it', () => {
    // Truncation here would point the reader one byte before the glyph, inside its predecessor.
    expect(encodeSfntLoca([5, 4], 0)).toBeNull();
    expect(encodeSfntLoca([5, 4], 1)).not.toBeNull();
  });

  it('refuses the short form when the font outgrows its reach', () => {
    expect(encodeSfntLoca([0x20000, 2], 0)).toBeNull();
  });
});

describe('encodeSfntSimpleGlyph', () => {
  const box = { xMax: 10, xMin: 0, yMax: 10, yMin: 0 };
  const none = new Uint8Array(0);

  it('writes the contour count and bounds as signed values', () => {
    const out = encodeSfntSimpleGlyph([0], [5], [5], [true], none, { xMax: 5, xMin: -5, yMax: 5, yMin: -5 });
    const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
    expect(view.getInt16(0)).toBe(1);
    // Negative bounds are ordinary: a glyph descending below the baseline has a negative yMin, and
    // reading these unsigned turns it into a huge positive box.
    expect(view.getInt16(2)).toBe(-5);
    expect(view.getInt16(4)).toBe(-5);
  });

  it('returns nothing at all for a glyph with no contours', () => {
    // Zero length is how the format spells a blank glyph. A ten-byte record with a zero contour count
    // would give every space character a bounding box.
    expect(encodeSfntSimpleGlyph([], [], [], [], none, box).byteLength).toBe(0);
  });

  it('spends no coordinate bytes on a point that does not move', () => {
    const moved = encodeSfntSimpleGlyph([1], [0, 7], [0, 0], [true, true], none, box);
    const still = encodeSfntSimpleGlyph([1], [0, 0], [0, 0], [true, true], none, box);
    expect(moved.byteLength - still.byteLength).toBe(1);
  });

  it('collapses a run of identical flags into one repeat group', () => {
    // Ten identical points cost one flag plus a count, not ten flags.
    const xs = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const packed = encodeSfntSimpleGlyph(
      [9],
      xs,
      xs,
      xs.map(() => true),
      none,
      box,
    );
    // 10 header + 2 endPts + 2 instructionLength + 2 flag bytes, and no coordinate bytes at all.
    expect(packed.byteLength).toBe(16);
  });

  it('carries the instructions and their length', () => {
    const out = encodeSfntSimpleGlyph([0], [0], [0], [true], Uint8Array.from([0xb0, 0x01]), box);
    const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
    expect(view.getUint16(12)).toBe(2);
    expect([...out.subarray(14, 16)]).toEqual([0xb0, 0x01]);
  });

  it('writes a delta beyond a byte as two bytes rather than truncating it', () => {
    const short = encodeSfntSimpleGlyph([0], [255], [0], [true], none, box);
    const long = encodeSfntSimpleGlyph([0], [256], [0], [true], none, box);
    expect(long.byteLength - short.byteLength).toBe(1);
  });
});

describe('packSfntTag', () => {
  it('packs four characters big-endian', () => {
    expect(packSfntTag('glyf')).toBe(0x676c7966);
  });

  it('pads a short tag with spaces, which is how the format spells its own', () => {
    expect(packSfntTag('cvt')).toBe(packSfntTag('cvt '));
    expect(packSfntTag('cvt')).toBe(0x63767420);
  });
});
