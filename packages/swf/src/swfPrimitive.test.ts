import {
  createSwfDimensionBounds,
  mergeSwfRectangles,
  readBigEndianUint16,
  readBigEndianUint32,
  readSwfMatrix,
  readSwfRectangle,
  transformSwfRectangle,
} from './swfPrimitive';
import { SwfReader } from './swfReader';
import { BitWriter, createRectangle } from './swfTagStreamTestHelper';

describe('createSwfDimensionBounds', () => {
  it('returns a box at the origin for a declared size', () => {
    expect(createSwfDimensionBounds(8, 4)).toEqual({ height: 4, width: 8, x: 0, y: 0 });
  });

  // A zero extent is not a box of zero area — it is a character with no declared size at all, which
  // instantiation has to tell apart so it does not pin a node to an empty authored extent.
  it('returns the sentinel when either dimension is zero', () => {
    expect(createSwfDimensionBounds(0, 4)).toBeNull();
    expect(createSwfDimensionBounds(8, 0)).toBeNull();
  });
});

describe('mergeSwfRectangles', () => {
  it('produces the union of two disjoint boxes', () => {
    const merged = mergeSwfRectangles({ height: 2, width: 2, x: 0, y: 0 }, { height: 2, width: 2, x: 10, y: 20 });
    expect(merged).toEqual({ height: 22, width: 12, x: 0, y: 0 });
  });

  it('keeps the outer box when one contains the other', () => {
    const outer = { height: 10, width: 10, x: -5, y: -5 };
    expect(mergeSwfRectangles({ ...outer }, { height: 1, width: 1, x: 0, y: 0 })).toEqual(outer);
  });

  // Negative origins are ordinary in SWF: a character's RECT is centred on its own registration point.
  it('unions across the origin', () => {
    expect(mergeSwfRectangles({ height: 4, width: 4, x: -4, y: -4 }, { height: 4, width: 4, x: 0, y: 0 })).toEqual({
      height: 8,
      width: 8,
      x: -4,
      y: -4,
    });
  });
});

describe('readBigEndianUint16', () => {
  it('reads the high byte first, unlike the container', () => {
    // Every SWF integer is little-endian; the JPEG segments a bitmap definition carries are not, which is
    // the whole reason this pair exists beside the reader.
    expect(readBigEndianUint16(new Uint8Array([0x12, 0x34]), 0)).toBe(0x1234);
  });

  it('reads from the given offset', () => {
    expect(readBigEndianUint16(new Uint8Array([0, 0, 0xff, 0x01]), 2)).toBe(0xff01);
  });
});

describe('readBigEndianUint32', () => {
  it('reads four bytes high to low', () => {
    expect(readBigEndianUint32(new Uint8Array([0x12, 0x34, 0x56, 0x78]), 0)).toBe(0x12345678);
  });

  // 0x80000000 and up are where a signed 32-bit shift would wrap to a negative length.
  it('stays positive above the signed 32-bit boundary', () => {
    expect(readBigEndianUint32(new Uint8Array([0xff, 0xff, 0xff, 0xff]), 0)).toBe(4_294_967_295);
  });
});

describe('readSwfMatrix', () => {
  it('returns identity for a record that declares neither scale nor rotation nor translation', () => {
    const writer = new BitWriter();
    writer.writeUnsigned(0, 1);
    writer.writeUnsigned(0, 1);
    writer.writeUnsigned(0, 5);
    expect(readSwfMatrix(reader(writer.toBytes()))).toEqual({ a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 });
  });

  it('reads scale as 16.16 fixed point and translation in twips', () => {
    const writer = new BitWriter();
    writer.writeUnsigned(1, 1);
    writer.writeUnsigned(20, 5);
    writer.writeSigned(2 * 0x10000, 20);
    writer.writeSigned(3 * 0x10000, 20);
    writer.writeUnsigned(0, 1);
    writer.writeUnsigned(12, 5);
    // 40 and -60 twips are 2 and -3 pixels.
    writer.writeSigned(40, 12);
    writer.writeSigned(-60, 12);
    expect(readSwfMatrix(reader(writer.toBytes()))).toEqual({ a: 2, b: 0, c: 0, d: 3, tx: 2, ty: -3 });
  });

  it('reads the rotation terms into b and c', () => {
    const writer = new BitWriter();
    writer.writeUnsigned(0, 1);
    writer.writeUnsigned(1, 1);
    writer.writeUnsigned(18, 5);
    writer.writeSigned(0x10000, 18);
    writer.writeSigned(-0x10000, 18);
    writer.writeUnsigned(0, 5);
    expect(readSwfMatrix(reader(writer.toBytes()))).toMatchObject({ a: 1, b: 1, c: -1, d: 1 });
  });
});

describe('readSwfRectangle', () => {
  it('converts twips to pixels', () => {
    expect(readSwfRectangle(reader(createRectangle(0, 2000, 0, 1000)))).toEqual({
      height: 50,
      width: 100,
      x: 0,
      y: 0,
    });
  });

  // Real authoring tools emit degenerate bounds for characters that occupy no space, and a RECT is an
  // advisory extent rather than the geometry. Reading one as an empty box is what keeps a single odd
  // character from discarding the whole file.
  it('clamps an inverted extent to empty rather than refusing it', () => {
    expect(readSwfRectangle(reader(createRectangle(2000, 0, 1000, 0)))).toEqual({
      height: 0,
      width: 0,
      x: 100,
      y: 50,
    });
  });

  it('returns the sentinel when the record runs past the end of the reader', () => {
    const full = createRectangle(0, 2000, 0, 1000);
    expect(readSwfRectangle(reader(full.subarray(0, 1)))).toBeNull();
  });
});

describe('transformSwfRectangle', () => {
  it('translates a box', () => {
    expect(transformSwfRectangle({ height: 2, width: 4, x: 1, y: 1 }, matrix({ tx: 10, ty: 20 }))).toEqual({
      height: 2,
      width: 4,
      x: 11,
      y: 21,
    });
  });

  // A rotated box is not a box, so the result is the axis-aligned extent of the transformed corners —
  // which is why all four are computed rather than just the origin and the far corner.
  it('returns the axis-aligned extent of a rotated box', () => {
    const rotated = transformSwfRectangle({ height: 2, width: 4, x: 0, y: 0 }, matrix({ a: 0, b: 1, c: -1, d: 0 }));
    expect(rotated).toEqual({ height: 4, width: 2, x: -2, y: 0 });
  });

  it('keeps a mirrored box positive in extent', () => {
    expect(transformSwfRectangle({ height: 2, width: 4, x: 0, y: 0 }, matrix({ a: -1 }))).toEqual({
      height: 2,
      width: 4,
      x: -4,
      y: 0,
    });
  });
});

function matrix(overrides: Partial<{ a: number; b: number; c: number; d: number; tx: number; ty: number }>) {
  return { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0, ...overrides };
}

function reader(bytes: Uint8Array): SwfReader {
  return new SwfReader(bytes, 0, bytes.length);
}
