import type { SwfTagMatrix, SwfTagReader, SwfTagRectangle } from '@flighthq/types/contract';

// The byte-level structures every SWF tag is written out of: the RECT and MATRIX records, and the
// rectangle arithmetic their consumers do on the results. Nothing here knows what a tag means, which is
// why a tag family can read its own bodies without reaching into the importer that dispatched it.

export function createSwfDimensionBounds(width: number, height: number): SwfTagRectangle | null {
  return width === 0 || height === 0 ? null : { height, width, x: 0, y: 0 };
}

export function mergeSwfRectangles(a: SwfTagRectangle, b: Readonly<SwfTagRectangle>): SwfTagRectangle {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const maxX = Math.max(a.x + a.width, b.x + b.width);
  const maxY = Math.max(a.y + a.height, b.y + b.height);
  return { height: maxY - y, width: maxX - x, x, y };
}

export function readBigEndianUint16(source: Uint8Array, offset: number): number {
  return source[offset] * 0x100 + source[offset + 1];
}

export function readBigEndianUint32(source: Uint8Array, offset: number): number {
  return source[offset] * 0x1000000 + source[offset + 1] * 0x10000 + source[offset + 2] * 0x100 + source[offset + 3];
}

export function readSwfMatrix(reader: SwfTagReader): SwfTagMatrix {
  let a = 1;
  let d = 1;
  if (reader.readUnsignedBits(1) !== 0) {
    const scaleBits = reader.readUnsignedBits(5);
    a = reader.readSignedBits(scaleBits) / FIXED_16_ONE;
    d = reader.readSignedBits(scaleBits) / FIXED_16_ONE;
  }

  let b = 0;
  let c = 0;
  if (reader.readUnsignedBits(1) !== 0) {
    const rotateBits = reader.readUnsignedBits(5);
    b = reader.readSignedBits(rotateBits) / FIXED_16_ONE;
    c = reader.readSignedBits(rotateBits) / FIXED_16_ONE;
  }

  const translateBits = reader.readUnsignedBits(5);
  const tx = reader.readSignedBits(translateBits) / TWIPS_PER_PIXEL;
  const ty = reader.readSignedBits(translateBits) / TWIPS_PER_PIXEL;
  reader.alignToByte();
  return { a, b, c, d, tx, ty };
}

export function readSwfRectangle(reader: SwfTagReader): SwfTagRectangle | null {
  const bits = reader.readUnsignedBits(5);
  const xMin = reader.readSignedBits(bits);
  const xMax = reader.readSignedBits(bits);
  const yMin = reader.readSignedBits(bits);
  const yMax = reader.readSignedBits(bits);
  reader.alignToByte();
  // Only a reader that ran out of bits is a failure. An inverted extent is not: real authoring tools
  // emit degenerate bounds for characters that occupy no space, and a RECT is an advisory extent rather
  // than the geometry itself — the shape body carries that. Reading one as an empty box keeps a single
  // odd character from discarding the whole file.
  if (!reader.valid) return null;
  return {
    height: Math.max(0, yMax - yMin) / TWIPS_PER_PIXEL,
    width: Math.max(0, xMax - xMin) / TWIPS_PER_PIXEL,
    x: xMin / TWIPS_PER_PIXEL,
    y: yMin / TWIPS_PER_PIXEL,
  };
}

export function transformSwfRectangle(
  bounds: Readonly<SwfTagRectangle>,
  matrix: Readonly<SwfTagMatrix>,
): SwfTagRectangle {
  const x0 = matrix.a * bounds.x + matrix.c * bounds.y + matrix.tx;
  const y0 = matrix.b * bounds.x + matrix.d * bounds.y + matrix.ty;
  const x1 = matrix.a * (bounds.x + bounds.width) + matrix.c * bounds.y + matrix.tx;
  const y1 = matrix.b * (bounds.x + bounds.width) + matrix.d * bounds.y + matrix.ty;
  const x2 = matrix.a * bounds.x + matrix.c * (bounds.y + bounds.height) + matrix.tx;
  const y2 = matrix.b * bounds.x + matrix.d * (bounds.y + bounds.height) + matrix.ty;
  const x3 = matrix.a * (bounds.x + bounds.width) + matrix.c * (bounds.y + bounds.height) + matrix.tx;
  const y3 = matrix.b * (bounds.x + bounds.width) + matrix.d * (bounds.y + bounds.height) + matrix.ty;
  const x = Math.min(x0, x1, x2, x3);
  const y = Math.min(y0, y1, y2, y3);
  const maxX = Math.max(x0, x1, x2, x3);
  const maxY = Math.max(y0, y1, y2, y3);
  return { height: maxY - y, width: maxX - x, x, y };
}

export const IDENTITY_MATRIX: SwfTagMatrix = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };

const FIXED_16_ONE = 0x10000;

const TWIPS_PER_PIXEL = 20;

// FIXED8: the 8.8 fixed-point divisor the header frame rate and every placement ratio are written in.
export const FIXED_8_8_ONE = 0x100;
