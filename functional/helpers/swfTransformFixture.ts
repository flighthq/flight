import type { MovieClip } from '@flighthq/sdk';
import { createScene2DFromSwf, MovieClipKind } from '@flighthq/sdk';

const BLUE_SHAPE_ID = 1;
const RED_SHAPE_ID = 2;
const WHITE_SHAPE_ID = 3;
const TWIPS_PER_PIXEL = 20;
const FIXED_16_ONE = 0x10000;
const SWF_PREFIX_LENGTH = 8;

const TAG_DEFINE_SHAPE = 2;
const TAG_END = 0;
const TAG_PLACE_OBJECT_2 = 26;
const TAG_SET_BACKGROUND_COLOR = 9;
const TAG_SHOW_FRAME = 1;
const PLACE_HAS_CHARACTER = 0x02;
const PLACE_HAS_MATRIX = 0x04;
const PLACE_HAS_COLOR_TRANSFORM = 0x08;

export function createSwfAlphaTransformMovieClip(): MovieClip {
  const tags = [
    createTag(TAG_SET_BACKGROUND_COLOR, new Uint8Array([0, 0, 0])),
    createSolidShape(BLUE_SHAPE_ID, 0x0000ff),
    createSolidShape(RED_SHAPE_ID, 0xff0000),
    place(BLUE_SHAPE_ID, 1, 40, 60),
    place(RED_SHAPE_ID, 2, 40, 60),
    place(BLUE_SHAPE_ID, 3, 190, 60),
    placeWithColorTransform(RED_SHAPE_ID, 4, 190, 60, [256, 256, 256, 128], [0, 0, 0, 0]),
    place(BLUE_SHAPE_ID, 5, 340, 60),
    placeWithColorTransform(RED_SHAPE_ID, 6, 340, 60, [256, 256, 256, 0], [0, 0, 0, 128]),
    createTag(TAG_SHOW_FRAME),
    createTag(TAG_END),
  ];
  return createSwfTransformMovieClip(490, 220, tags);
}

export function createSwfColorTransformMovieClip(): MovieClip {
  const tags = [
    createTag(TAG_SET_BACKGROUND_COLOR, new Uint8Array([0, 0, 0])),
    createSolidShape(BLUE_SHAPE_ID, 0x0000ff),
    createSolidShape(WHITE_SHAPE_ID, 0xffffff),
    place(BLUE_SHAPE_ID, 1, 60, 60),
    placeWithColorTransform(WHITE_SHAPE_ID, 2, 60, 60, [0, 256, 0, 256], [0, 0, 0, 0]),
    createTag(TAG_SHOW_FRAME),
    createTag(TAG_END),
  ];
  return createSwfTransformMovieClip(220, 220, tags);
}

function createSwfTransformMovieClip(width: number, height: number, tags: readonly Uint8Array[]): MovieClip {
  const body = joinBytes(
    createRectangle(0, width * TWIPS_PER_PIXEL, 0, height * TWIPS_PER_PIXEL),
    uint16(24 * 256),
    uint16(1),
    ...tags,
  );
  const bytes = joinBytes(new Uint8Array([0x46, 0x57, 0x53, 9]), uint32(SWF_PREFIX_LENGTH + body.length), body);
  const document = createScene2DFromSwf(bytes);
  if (document === null || document.root.kind !== MovieClipKind) {
    throw new Error('[swf-transform-fixture] synthetic SWF did not import as a MovieClip document');
  }
  return document.root as MovieClip;
}

function createSolidShape(characterId: number, color: number): Uint8Array {
  const writer = new ShapeWriter();
  writer.writeSolidFillStyle(color);
  writer.writeLineStyleCount(0);
  writer.writeStyleBits(1, 0);
  writer.writeStyleChange(1, 0, 0);
  writer.writeRectangle(100 * TWIPS_PER_PIXEL, 100 * TWIPS_PER_PIXEL);
  writer.writeEndShape();
  return createTag(
    TAG_DEFINE_SHAPE,
    joinBytes(
      uint16(characterId),
      createRectangle(0, 100 * TWIPS_PER_PIXEL, 0, 100 * TWIPS_PER_PIXEL),
      writer.toBytes(),
    ),
  );
}

function place(characterId: number, depth: number, x: number, y: number): Uint8Array {
  return createTag(
    TAG_PLACE_OBJECT_2,
    joinBytes(
      new Uint8Array([PLACE_HAS_CHARACTER | PLACE_HAS_MATRIX]),
      uint16(depth),
      uint16(characterId),
      createMatrix(x * TWIPS_PER_PIXEL, y * TWIPS_PER_PIXEL),
    ),
  );
}

function placeWithColorTransform(
  characterId: number,
  depth: number,
  x: number,
  y: number,
  multiply: readonly number[],
  add: readonly number[],
): Uint8Array {
  return createTag(
    TAG_PLACE_OBJECT_2,
    joinBytes(
      new Uint8Array([PLACE_HAS_COLOR_TRANSFORM | PLACE_HAS_CHARACTER | PLACE_HAS_MATRIX]),
      uint16(depth),
      uint16(characterId),
      createMatrix(x * TWIPS_PER_PIXEL, y * TWIPS_PER_PIXEL),
      createColorTransform(multiply, add),
    ),
  );
}

function createColorTransform(multiply: readonly number[], add: readonly number[]): Uint8Array {
  const writer = new BitWriter();
  const bits = signedBitCount([...multiply, ...add]);
  writer.writeUnsigned(1, 1);
  writer.writeUnsigned(1, 1);
  writer.writeUnsigned(bits, 4);
  for (const value of multiply) writer.writeSigned(value, bits);
  for (const value of add) writer.writeSigned(value, bits);
  return writer.toBytes();
}

function createMatrix(tx: number, ty: number): Uint8Array {
  const writer = new BitWriter();
  const scaleBits = signedBitCount([FIXED_16_ONE]);
  writer.writeUnsigned(1, 1);
  writer.writeUnsigned(scaleBits, 5);
  writer.writeSigned(FIXED_16_ONE, scaleBits);
  writer.writeSigned(FIXED_16_ONE, scaleBits);
  writer.writeUnsigned(0, 1);
  const translateBits = signedBitCount([tx, ty]);
  writer.writeUnsigned(translateBits, 5);
  writer.writeSigned(tx, translateBits);
  writer.writeSigned(ty, translateBits);
  return writer.toBytes();
}

function createRectangle(xMin: number, xMax: number, yMin: number, yMax: number): Uint8Array {
  const writer = new BitWriter();
  const values = [xMin, xMax, yMin, yMax];
  const bits = signedBitCount(values);
  writer.writeUnsigned(bits, 5);
  for (const value of values) writer.writeSigned(value, bits);
  return writer.toBytes();
}

function createTag(code: number, body: Uint8Array = new Uint8Array()): Uint8Array {
  const shortLength = body.length < 0x3f ? body.length : 0x3f;
  const header = uint16((code << 6) | shortLength);
  return shortLength === 0x3f ? joinBytes(header, uint32(body.length), body) : joinBytes(header, body);
}

function joinBytes(...parts: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function signedBitCount(values: readonly number[]): number {
  for (let bits = 2; bits < 32; bits++) {
    const minimum = -(2 ** (bits - 1));
    const maximum = 2 ** (bits - 1) - 1;
    if (values.every((value) => value >= minimum && value <= maximum)) return bits;
  }
  return 32;
}

function uint16(value: number): Uint8Array {
  return new Uint8Array([value & 0xff, (value >> 8) & 0xff]);
}

function uint32(value: number): Uint8Array {
  return new Uint8Array([value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff]);
}

class BitWriter {
  protected readonly bits: number[] = [];

  toBytes(): Uint8Array {
    const bytes = new Uint8Array(Math.ceil(this.bits.length / 8));
    for (let index = 0; index < this.bits.length; index++) {
      bytes[Math.floor(index / 8)] |= this.bits[index] << (7 - (index % 8));
    }
    return bytes;
  }

  writeSigned(value: number, count: number): void {
    this.writeUnsigned(value < 0 ? value + 2 ** count : value, count);
  }

  writeUnsigned(value: number, count: number): void {
    for (let index = count - 1; index >= 0; index--) this.bits.push(Math.floor(value / 2 ** index) & 1);
  }
}

class ShapeWriter extends BitWriter {
  writeByte(value: number): void {
    this.align();
    this.writeUnsigned(value, 8);
  }

  writeEndShape(): void {
    this.writeUnsigned(0, 1);
    this.writeUnsigned(0, 5);
    this.align();
  }

  writeLineStyleCount(count: number): void {
    this.writeByte(count);
  }

  writeRectangle(width: number, height: number): void {
    this.writeStraightEdge(width, 0);
    this.writeStraightEdge(0, height);
    this.writeStraightEdge(-width, 0);
    this.writeStraightEdge(0, -height);
  }

  writeSolidFillStyle(color: number): void {
    this.writeByte(1);
    this.writeByte(0);
    this.writeByte((color >> 16) & 0xff);
    this.writeByte((color >> 8) & 0xff);
    this.writeByte(color & 0xff);
  }

  writeStraightEdge(deltaX: number, deltaY: number): void {
    const bits = signedBitCount([deltaX, deltaY]);
    this.writeUnsigned(1, 1);
    this.writeUnsigned(1, 1);
    this.writeUnsigned(bits - 2, 4);
    this.writeUnsigned(1, 1);
    this.writeSigned(deltaX, bits);
    this.writeSigned(deltaY, bits);
  }

  writeStyleBits(fillBits: number, lineBits: number): void {
    this.align();
    this.writeUnsigned(fillBits, 4);
    this.writeUnsigned(lineBits, 4);
  }

  writeStyleChange(fill1: number, moveToX: number, moveToY: number): void {
    this.writeUnsigned(0, 1);
    this.writeUnsigned(0, 1);
    this.writeUnsigned(0, 1);
    this.writeUnsigned(1, 1);
    this.writeUnsigned(0, 1);
    this.writeUnsigned(1, 1);
    const bits = signedBitCount([moveToX, moveToY]);
    this.writeUnsigned(bits, 5);
    this.writeSigned(moveToX, bits);
    this.writeSigned(moveToY, bits);
    this.writeUnsigned(fill1, 1);
  }

  private align(): void {
    while (this.bits.length % 8 !== 0) this.bits.push(0);
  }
}
