import { readSwfHeaderRectangle, readSwfHeaderUint32, SWF_HEADER_PREFIX_LENGTH } from './swfHeaderReader.ts';

describe('readSwfHeaderRectangle', () => {
  it('decodes a rectangle and reports where the next field starts', () => {
    const result = readSwfHeaderRectangle(createRectangle(0, 2000, 0, 1000), 0)!;
    expect(result.rect).toEqual({ height: 50, width: 100, x: 0, y: 0 });
    expect(result.nextPos).toBe(createRectangle(0, 2000, 0, 1000).length);
  });

  it('sign-extends negative extents rather than reading them as large positives', () => {
    expect(readSwfHeaderRectangle(createRectangle(-400, 400, -200, 200), 0)!.rect).toEqual({
      height: 20,
      width: 40,
      x: -20,
      y: -10,
    });
  });

  it('clamps an inverted extent to zero instead of returning a negative size', () => {
    expect(readSwfHeaderRectangle(createRectangle(2000, 0, 1000, 0), 0)!.rect).toEqual({
      height: 0,
      width: 0,
      x: 100,
      y: 50,
    });
  });

  it('returns null when the record runs past the end of the data', () => {
    expect(readSwfHeaderRectangle(new Uint8Array(), 0)).toBeNull();
    expect(readSwfHeaderRectangle(createRectangle(0, 2000, 0, 1000).subarray(0, 1), 0)).toBeNull();
  });
});

describe('readSwfHeaderUint32', () => {
  it('reads four bytes little-endian', () => {
    expect(readSwfHeaderUint32(new Uint8Array([0x78, 0x56, 0x34, 0x12]), 0)).toBe(0x12345678);
  });

  it('reads from the given offset', () => {
    expect(readSwfHeaderUint32(new Uint8Array([0, 0, 0x01, 0, 0, 0]), 2)).toBe(1);
  });
});

describe('SWF_HEADER_PREFIX_LENGTH', () => {
  it('is the signature, version and file-length prefix that precedes the stage rectangle', () => {
    expect(SWF_HEADER_PREFIX_LENGTH).toBe(8);
  });
});

function createRectangle(xMin: number, xMax: number, yMin: number, yMax: number): Uint8Array {
  const values = [xMin, xMax, yMin, yMax];
  let bits = 1;
  while (bits < 32 && !values.every((v) => v >= -(2 ** (bits - 1)) && v <= 2 ** (bits - 1) - 1)) bits++;
  const result = new Uint8Array(Math.ceil((5 + bits * 4) / 8));
  let bitPos = 0;
  const writeBits = (value: number, count: number): void => {
    for (let i = count - 1; i >= 0; i--) {
      if ((value >> i) & 1) result[bitPos >> 3] |= 1 << (7 - (bitPos & 7));
      bitPos++;
    }
  };
  writeBits(bits, 5);
  for (const value of values) writeBits(value & ((1 << bits) - 1), bits);
  return result;
}
