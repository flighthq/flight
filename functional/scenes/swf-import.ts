// swf-import — imports one synthetic two-frame FWS file instead of rebuilding its intended scene with
// Flight primitives. The file covers the render-bearing SWF surface that exists today: shape geometry,
// a linear gradient, a stroke, static text, and a lossless bitmap fill. Frame 2 moves the solid shape.
//
// The font pair is a deliberately disagreeing oracle. DefineFont stores a 512-unit square on a 1024-unit
// EM grid; DefineFont3 stores the same square as 10240 units on its twenty-times-finer grid. Both text
// records author the same height, so their rendered extents must match. A wrong SWF EM-square conversion
// makes the modern glyph twenty times too large instead of merely leaving a non-blank frame.
import type { Bitmap, MovieClip } from '@flighthq/sdk';
import {
  createScene2DFromSwf,
  getBitmapPixelRgb,
  getMovieClipTotalFrames,
  gotoAndStopMovieClip,
  MovieClipKind,
  registerDeflateDecompressor,
  ShapeKind,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const WIDTH = 800;
const HEIGHT = 600;
const BACKGROUND = 0x0c1024ff;

const SOLID_FRAME_1_X = 40;
const SOLID_FRAME_2_X = 680;
const SOLID_Y = 50;
const SOLID_SIZE = 80;

const GRADIENT_X = 60;
const GRADIENT_Y = 170;
const GRADIENT_WIDTH = 220;
const GRADIENT_HEIGHT = 100;

const STROKE_X = 320;
const STROKE_Y = 170;
const STROKE_WIDTH = 190;
const STROKE_HEIGHT = 110;

const BITMAP_X = 560;
const BITMAP_Y = 170;
const BITMAP_WIDTH = 180;
const BITMAP_HEIGHT = 120;
const BITMAP_CELL = 8;

const LEGACY_TEXT_X = 140;
const MODERN_TEXT_X = 360;
const TEXT_Y = 370;
const TEXT_SIZE = 100;
let targetWidth = WIDTH;

export function assertRender(frame: Readonly<Bitmap>): void {
  const scale = frame.width / targetWidth;
  const at = (x: number, y: number): number => getBitmapPixelRgb(frame, Math.round(x * scale), Math.round(y * scale));

  assertFrameTwoPlacement(at);
  assertGradient(at);
  assertStroke(at);
  assertBitmapFill(at);
  assertEquivalentFontGrids(at);
}

function assertBitmapFill(at: PixelReader): void {
  const first = at(BITMAP_X + BITMAP_CELL / 2, BITMAP_Y + BITMAP_CELL / 2);
  const second = at(BITMAP_X + BITMAP_CELL * 1.5, BITMAP_Y + BITMAP_CELL / 2);
  if (!isOrange(first) || !isCyan(second)) {
    throw new Error(
      `[swf-import] lossless checker did not preserve its two alternating cells — got #${hex(first)}, #${hex(second)}`,
    );
  }

  const repeated = at(BITMAP_X + BITMAP_CELL * 4.5, BITMAP_Y + BITMAP_CELL / 2);
  if (!isOrange(repeated)) {
    throw new Error(`[swf-import] lossless checker did not repeat at its authored pitch — got #${hex(repeated)}`);
  }
}

function assertEquivalentFontGrids(at: PixelReader): void {
  const legacy = findColorBounds(at, isMagenta, LEGACY_TEXT_X - 5, TEXT_Y - 5, TEXT_SIZE + 10, TEXT_SIZE + 10);
  const modern = findColorBounds(at, isGreen, MODERN_TEXT_X - 5, TEXT_Y - 5, TEXT_SIZE + 10, TEXT_SIZE + 10);
  if (legacy === null || modern === null) {
    throw new Error('[swf-import] one of the two imported static-text glyphs did not draw');
  }

  const legacyWidth = legacy.maxX - legacy.minX + 1;
  const legacyHeight = legacy.maxY - legacy.minY + 1;
  const modernWidth = modern.maxX - modern.minX + 1;
  const modernHeight = modern.maxY - modern.minY + 1;
  if (
    Math.abs(legacyWidth - modernWidth) > 2 ||
    Math.abs(legacyHeight - modernHeight) > 2 ||
    legacyWidth < TEXT_SIZE - 4 ||
    legacyHeight < TEXT_SIZE - 4
  ) {
    throw new Error(
      `[swf-import] DefineFont/DefineFont3 twins disagree — legacy ${legacyWidth}x${legacyHeight}, modern ${modernWidth}x${modernHeight}`,
    );
  }
}

function assertFrameTwoPlacement(at: PixelReader): void {
  const frameOne = at(SOLID_FRAME_1_X + SOLID_SIZE / 2, SOLID_Y + SOLID_SIZE / 2);
  const frameTwo = at(SOLID_FRAME_2_X + SOLID_SIZE / 2, SOLID_Y + SOLID_SIZE / 2);
  if (!isBackground(frameOne) || !isRed(frameTwo)) {
    throw new Error(`[swf-import] frame 2 did not move the solid shape — old #${hex(frameOne)}, new #${hex(frameTwo)}`);
  }
}

function assertGradient(at: PixelReader): void {
  const left = at(GRADIENT_X + 20, GRADIENT_Y + GRADIENT_HEIGHT / 2);
  const right = at(GRADIENT_X + GRADIENT_WIDTH - 20, GRADIENT_Y + GRADIENT_HEIGHT / 2);
  if (!isRedGradientEnd(left) || !isCyanGradientEnd(right)) {
    throw new Error(`[swf-import] linear gradient endpoints disagree — got #${hex(left)} to #${hex(right)}`);
  }
}

function assertStroke(at: PixelReader): void {
  const edge = at(STROKE_X + STROKE_WIDTH / 2, STROKE_Y + 1);
  const center = at(STROKE_X + STROKE_WIDTH / 2, STROKE_Y + STROKE_HEIGHT / 2);
  if (!isYellow(edge) || !isBackground(center)) {
    throw new Error(`[swf-import] stroke lost its hollow center — edge #${hex(edge)}, center #${hex(center)}`);
  }
}

function createBitmapShape(): Uint8Array {
  const writer = new ShapeWriter();
  writer.writeFillStyleCount(1);
  writer.writeBitmapFillStyle(0x42, BITMAP_CHARACTER_ID, 20);
  writer.writeLineStyleCount(0);
  writer.writeStyleBits(1, 0);
  writer.writeStyleChange({ fill1: 1, moveToX: 0, moveToY: 0 });
  writer.writeRectangle(BITMAP_WIDTH * TWIPS_PER_PIXEL, BITMAP_HEIGHT * TWIPS_PER_PIXEL);
  writer.writeEndShape();
  return defineShape(BITMAP_SHAPE_ID, BITMAP_WIDTH, BITMAP_HEIGHT, writer.toBytes());
}

function createFunctionalSwf(): Uint8Array {
  const tags = [
    createTag(TAG_SET_BACKGROUND_COLOR, new Uint8Array([0x0c, 0x10, 0x24])),
    createLosslessBitmap(),
    createSolidShape(),
    createGradientShape(),
    createStrokeShape(),
    createBitmapShape(),
    createLegacyFont(),
    createModernFont(),
    createStaticText(LEGACY_TEXT_ID, LEGACY_FONT_ID, 0xf72585),
    createStaticText(MODERN_TEXT_ID, MODERN_FONT_ID, 0x80ff72),
    place(SOLID_SHAPE_ID, 1, SOLID_FRAME_1_X, SOLID_Y),
    place(GRADIENT_SHAPE_ID, 2, GRADIENT_X, GRADIENT_Y),
    place(STROKE_SHAPE_ID, 3, STROKE_X, STROKE_Y),
    place(BITMAP_SHAPE_ID, 4, BITMAP_X, BITMAP_Y),
    place(LEGACY_TEXT_ID, 5, LEGACY_TEXT_X, TEXT_Y),
    place(MODERN_TEXT_ID, 6, MODERN_TEXT_X, TEXT_Y),
    createTag(TAG_SHOW_FRAME),
    move(1, SOLID_FRAME_2_X, SOLID_Y),
    createTag(TAG_SHOW_FRAME),
    createTag(TAG_END),
  ];
  const body = joinBytes(
    createRectangle(0, WIDTH * TWIPS_PER_PIXEL, 0, HEIGHT * TWIPS_PER_PIXEL),
    uint16(24 * 256),
    uint16(2),
    ...tags,
  );
  return joinBytes(new Uint8Array([0x46, 0x57, 0x53, 9]), uint32(SWF_PREFIX_LENGTH + body.length), body);
}

function createGradientShape(): Uint8Array {
  const writer = new ShapeWriter();
  writer.writeFillStyleCount(1);
  writer.writeByte(0x10);
  writer.writeMatrix(
    GRADIENT_WIDTH / GRADIENT_BOX_WIDTH,
    GRADIENT_HEIGHT / GRADIENT_BOX_WIDTH,
    (GRADIENT_WIDTH * TWIPS_PER_PIXEL) / 2,
    (GRADIENT_HEIGHT * TWIPS_PER_PIXEL) / 2,
  );
  writer.writeGradient([
    { color: 0xff004c, ratio: 0 },
    { color: 0x00f5d4, ratio: 255 },
  ]);
  writer.writeLineStyleCount(0);
  writer.writeStyleBits(1, 0);
  writer.writeStyleChange({ fill1: 1, moveToX: 0, moveToY: 0 });
  writer.writeRectangle(GRADIENT_WIDTH * TWIPS_PER_PIXEL, GRADIENT_HEIGHT * TWIPS_PER_PIXEL);
  writer.writeEndShape();
  return defineShape(GRADIENT_SHAPE_ID, GRADIENT_WIDTH, GRADIENT_HEIGHT, writer.toBytes());
}

function createLegacyFont(): Uint8Array {
  const glyph = createSquareGlyph(512);
  return createTag(TAG_DEFINE_FONT, joinBytes(uint16(LEGACY_FONT_ID), uint16(2), glyph));
}

function createLosslessBitmap(): Uint8Array {
  const pixels: number[] = [];
  for (let y = 0; y < BITMAP_SOURCE_SIZE; y++) {
    for (let x = 0; x < BITMAP_SOURCE_SIZE; x++) {
      const orange = (Math.floor(x / BITMAP_CELL) + Math.floor(y / BITMAP_CELL)) % 2 === 0;
      pixels.push(0, ...(orange ? ORANGE_RGB : CYAN_RGB));
    }
  }
  const payload = new Uint8Array([5, BITMAP_SOURCE_SIZE, 0, BITMAP_SOURCE_SIZE, 0, ...storedDeflate(pixels)]);
  return createTag(TAG_DEFINE_BITS_LOSSLESS, joinBytes(uint16(BITMAP_CHARACTER_ID), payload));
}

function createModernFont(): Uint8Array {
  const glyph = createSquareGlyph(512 * 20);
  const body = joinBytes(
    uint16(MODERN_FONT_ID),
    new Uint8Array([0, 0, 0]),
    uint16(1),
    uint16(4),
    uint16(4 + glyph.length),
    glyph,
    new Uint8Array([0x41]),
  );
  return createTag(TAG_DEFINE_FONT_3, body);
}

function createSolidShape(): Uint8Array {
  const writer = new ShapeWriter();
  writer.writeSolidFillStyles([0xff334f]);
  writer.writeLineStyleCount(0);
  writer.writeStyleBits(1, 0);
  writer.writeStyleChange({ fill1: 1, moveToX: 0, moveToY: 0 });
  writer.writeRectangle(SOLID_SIZE * TWIPS_PER_PIXEL, SOLID_SIZE * TWIPS_PER_PIXEL);
  writer.writeEndShape();
  return defineShape(SOLID_SHAPE_ID, SOLID_SIZE, SOLID_SIZE, writer.toBytes());
}

function createSquareGlyph(size: number): Uint8Array {
  const writer = new ShapeWriter();
  writer.writeStyleBits(1, 0);
  writer.writeStyleChange({ fill1: 1, moveToX: 0, moveToY: 0 });
  writer.writeRectangle(size, size);
  writer.writeEndShape();
  return writer.toBytes();
}

function createStaticText(characterId: number, fontId: number, color: number): Uint8Array {
  const flags = new BitWriter();
  flags.writeUnsigned(1, 1);
  flags.writeUnsigned(0, 3);
  flags.writeUnsigned(1, 1);
  flags.writeUnsigned(1, 1);
  flags.writeUnsigned(0, 1);
  flags.writeUnsigned(0, 1);
  const body = joinBytes(
    uint16(characterId),
    createRectangle(0, TEXT_SIZE * TWIPS_PER_PIXEL, 0, TEXT_SIZE * TWIPS_PER_PIXEL),
    createMatrix(1, 0, 0, 1, 0, 0),
    new Uint8Array([4, 8]),
    flags.toBytes(),
    uint16(fontId),
    new Uint8Array([(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff]),
    uint16(TEXT_SIZE * TWIPS_PER_PIXEL * 2),
    new Uint8Array([1, 0, 0, 0]),
  );
  return createTag(TAG_DEFINE_TEXT, body);
}

function createStrokeShape(): Uint8Array {
  const writer = new ShapeWriter();
  writer.writeFillStyleCount(0);
  writer.writeLineStyleCount(1);
  writer.writeUint16(6 * TWIPS_PER_PIXEL);
  writer.writeByte(0xff);
  writer.writeByte(0xd6);
  writer.writeByte(0x0a);
  writer.writeStyleBits(0, 1);
  writer.writeStyleChange({ line: 1, moveToX: 0, moveToY: 0 });
  writer.writeRectangle(STROKE_WIDTH * TWIPS_PER_PIXEL, STROKE_HEIGHT * TWIPS_PER_PIXEL);
  writer.writeEndShape();
  return defineShape(STROKE_SHAPE_ID, STROKE_WIDTH, STROKE_HEIGHT, writer.toBytes());
}

function createTag(code: number, body: Uint8Array = new Uint8Array()): Uint8Array {
  const shortLength = body.length < 0x3f ? body.length : 0x3f;
  const header = uint16((code << 6) | shortLength);
  return shortLength === 0x3f ? joinBytes(header, uint32(body.length), body) : joinBytes(header, body);
}

function defineShape(characterId: number, shapeWidth: number, shapeHeight: number, shape: Uint8Array): Uint8Array {
  return createTag(
    TAG_DEFINE_SHAPE,
    joinBytes(
      uint16(characterId),
      createRectangle(0, shapeWidth * TWIPS_PER_PIXEL, 0, shapeHeight * TWIPS_PER_PIXEL),
      shape,
    ),
  );
}

function findColorBounds(
  at: PixelReader,
  matches: (rgb: number) => boolean,
  x: number,
  y: number,
  regionWidth: number,
  regionHeight: number,
): PixelBounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let py = y; py < y + regionHeight; py++) {
    for (let px = x; px < x + regionWidth; px++) {
      if (!matches(at(px, py))) continue;
      minX = Math.min(minX, px);
      minY = Math.min(minY, py);
      maxX = Math.max(maxX, px);
      maxY = Math.max(maxY, py);
    }
  }
  return minX === Infinity ? null : { maxX, maxY, minX, minY };
}

function move(depth: number, x: number, y: number): Uint8Array {
  return createTag(
    TAG_PLACE_OBJECT_2,
    joinBytes(new Uint8Array([PLACE_MOVE | PLACE_HAS_MATRIX]), uint16(depth), createMatrix(1, 0, 0, 1, x * 20, y * 20)),
  );
}

function place(characterId: number, depth: number, x: number, y: number): Uint8Array {
  return createTag(
    TAG_PLACE_OBJECT_2,
    joinBytes(
      new Uint8Array([PLACE_HAS_CHARACTER | PLACE_HAS_MATRIX]),
      uint16(depth),
      uint16(characterId),
      createMatrix(1, 0, 0, 1, x * TWIPS_PER_PIXEL, y * TWIPS_PER_PIXEL),
    ),
  );
}

function createMatrix(a: number, b: number, c: number, d: number, tx: number, ty: number): Uint8Array {
  const writer = new BitWriter();
  const scales = [Math.round(a * FIXED_16_ONE), Math.round(d * FIXED_16_ONE)];
  const rotates = [Math.round(b * FIXED_16_ONE), Math.round(c * FIXED_16_ONE)];
  const scaleBits = signedBitCount(scales);
  const rotateBits = signedBitCount(rotates);
  const translateBits = signedBitCount([tx, ty]);
  writer.writeUnsigned(1, 1);
  writer.writeUnsigned(scaleBits, 5);
  for (const value of scales) writer.writeSigned(value, scaleBits);
  writer.writeUnsigned(1, 1);
  writer.writeUnsigned(rotateBits, 5);
  for (const value of rotates) writer.writeSigned(value, rotateBits);
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

function joinBytes(...parts: readonly Uint8Array[]): Uint8Array {
  let length = 0;
  for (const part of parts) length += part.length;
  const result = new Uint8Array(length);
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

function storedDeflate(bytes: readonly number[]): number[] {
  const length = bytes.length;
  return [0x78, 0x01, 0x01, length & 0xff, length >> 8, ~length & 0xff, (~length >> 8) & 0xff, ...bytes, 0, 0, 0, 0];
}

function uint16(value: number): Uint8Array {
  return new Uint8Array([value & 0xff, (value >> 8) & 0xff]);
}

function uint32(value: number): Uint8Array {
  return new Uint8Array([value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff]);
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 0xff;
}

function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}

function isBackground(rgb: number): boolean {
  return channel(rgb, 16) < 35 && channel(rgb, 8) < 40 && channel(rgb, 0) < 65;
}

function isCyan(rgb: number): boolean {
  return channel(rgb, 16) < 90 && channel(rgb, 8) > 150 && channel(rgb, 0) > 180;
}

function isCyanGradientEnd(rgb: number): boolean {
  return channel(rgb, 16) < 100 && channel(rgb, 8) > 150 && channel(rgb, 0) > 130;
}

function isGreen(rgb: number): boolean {
  return channel(rgb, 16) < 180 && channel(rgb, 8) > 180 && channel(rgb, 0) < 180;
}

function isMagenta(rgb: number): boolean {
  return channel(rgb, 16) > 180 && channel(rgb, 8) < 110 && channel(rgb, 0) > 80;
}

function isOrange(rgb: number): boolean {
  return channel(rgb, 16) > 180 && channel(rgb, 8) > 60 && channel(rgb, 8) < 180 && channel(rgb, 0) < 90;
}

function isRed(rgb: number): boolean {
  return channel(rgb, 16) > 190 && channel(rgb, 8) < 110 && channel(rgb, 0) < 130;
}

function isRedGradientEnd(rgb: number): boolean {
  return channel(rgb, 16) > 150 && channel(rgb, 8) < 110 && channel(rgb, 0) < 150;
}

function isYellow(rgb: number): boolean {
  return channel(rgb, 16) > 180 && channel(rgb, 8) > 150 && channel(rgb, 0) < 100;
}

class BitWriter {
  protected readonly bits: number[] = [];

  toBytes(): Uint8Array {
    const bytes = new Uint8Array(Math.ceil(this.bits.length / 8));
    for (let i = 0; i < this.bits.length; i++) {
      bytes[Math.floor(i / 8)] |= this.bits[i] << (7 - (i % 8));
    }
    return bytes;
  }

  writeSigned(value: number, count: number): void {
    this.writeUnsigned(value < 0 ? value + 2 ** count : value, count);
  }

  writeUnsigned(value: number, count: number): void {
    for (let i = count - 1; i >= 0; i--) this.bits.push(Math.floor(value / 2 ** i) & 1);
  }
}

class ShapeWriter extends BitWriter {
  writeBitmapFillStyle(type: number, characterId: number, scale: number): void {
    this.writeByte(type);
    this.writeUint16(characterId);
    this.writeMatrix(scale, scale, 0, 0);
  }

  writeByte(value: number): void {
    this.align();
    this.writeUnsigned(value, 8);
  }

  writeEndShape(): void {
    this.writeUnsigned(0, 1);
    this.writeUnsigned(0, 5);
    this.align();
  }

  writeFillStyleCount(count: number): void {
    this.writeByte(count);
  }

  writeGradient(records: readonly Readonly<{ color: number; ratio: number }>[]): void {
    this.align();
    this.writeUnsigned(0, 2);
    this.writeUnsigned(0, 2);
    this.writeUnsigned(records.length, 4);
    for (const record of records) {
      this.writeByte(record.ratio);
      this.writeByte((record.color >> 16) & 0xff);
      this.writeByte((record.color >> 8) & 0xff);
      this.writeByte(record.color & 0xff);
    }
  }

  writeLineStyleCount(count: number): void {
    this.writeByte(count);
  }

  writeMatrix(scaleX: number, scaleY: number, translateX: number, translateY: number): void {
    this.align();
    const scales = [Math.round(scaleX * FIXED_16_ONE), Math.round(scaleY * FIXED_16_ONE)];
    const scaleBits = signedBitCount(scales);
    this.writeUnsigned(1, 1);
    this.writeUnsigned(scaleBits, 5);
    this.writeSigned(scales[0], scaleBits);
    this.writeSigned(scales[1], scaleBits);
    this.writeUnsigned(0, 1);
    const translateBits = signedBitCount([translateX, translateY]);
    this.writeUnsigned(translateBits, 5);
    this.writeSigned(translateX, translateBits);
    this.writeSigned(translateY, translateBits);
    this.align();
  }

  writeRectangle(shapeWidth: number, shapeHeight: number): void {
    this.writeStraightEdge(shapeWidth, 0);
    this.writeStraightEdge(0, shapeHeight);
    this.writeStraightEdge(-shapeWidth, 0);
    this.writeStraightEdge(0, -shapeHeight);
  }

  writeSolidFillStyles(colors: readonly number[]): void {
    this.writeFillStyleCount(colors.length);
    for (const color of colors) {
      this.writeByte(0);
      this.writeByte((color >> 16) & 0xff);
      this.writeByte((color >> 8) & 0xff);
      this.writeByte(color & 0xff);
    }
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

  writeStyleChange(change: Readonly<{ fill1?: number; line?: number; moveToX?: number; moveToY?: number }>): void {
    const hasMove = change.moveToX !== undefined && change.moveToY !== undefined;
    this.writeUnsigned(0, 1);
    this.writeUnsigned(0, 1);
    this.writeUnsigned(change.line === undefined ? 0 : 1, 1);
    this.writeUnsigned(change.fill1 === undefined ? 0 : 1, 1);
    this.writeUnsigned(0, 1);
    this.writeUnsigned(hasMove ? 1 : 0, 1);
    if (hasMove) {
      const bits = signedBitCount([change.moveToX!, change.moveToY!]);
      this.writeUnsigned(bits, 5);
      this.writeSigned(change.moveToX!, bits);
      this.writeSigned(change.moveToY!, bits);
    }
    if (change.fill1 !== undefined) this.writeUnsigned(change.fill1, 1);
    if (change.line !== undefined) this.writeUnsigned(change.line, 1);
  }

  writeUint16(value: number): void {
    this.writeByte(value & 0xff);
    this.writeByte((value >> 8) & 0xff);
  }

  private align(): void {
    while (this.bits.length % 8 !== 0) this.bits.push(0);
  }
}

type PixelReader = (x: number, y: number) => number;

interface PixelBounds {
  maxX: number;
  maxY: number;
  minX: number;
  minY: number;
}

const BITMAP_CHARACTER_ID = 9;
const BITMAP_SHAPE_ID = 4;
const BITMAP_SOURCE_SIZE = BITMAP_CELL * 2;
const CYAN_RGB = [0x21, 0xd4, 0xfd] as const;
const FIXED_16_ONE = 0x10000;
const GRADIENT_BOX_WIDTH = 1638.4;
const GRADIENT_SHAPE_ID = 2;
const LEGACY_FONT_ID = 10;
const LEGACY_TEXT_ID = 12;
const MODERN_FONT_ID = 11;
const MODERN_TEXT_ID = 13;
const ORANGE_RGB = [0xff, 0x7a, 0x18] as const;
const PLACE_HAS_CHARACTER = 0x02;
const PLACE_HAS_MATRIX = 0x04;
const PLACE_MOVE = 0x01;
const SOLID_SHAPE_ID = 1;
const STROKE_SHAPE_ID = 3;
const SWF_PREFIX_LENGTH = 8;
const TAG_DEFINE_BITS_LOSSLESS = 20;
const TAG_DEFINE_FONT = 10;
const TAG_DEFINE_FONT_3 = 75;
const TAG_DEFINE_SHAPE = 2;
const TAG_DEFINE_TEXT = 11;
const TAG_END = 0;
const TAG_PLACE_OBJECT_2 = 26;
const TAG_SET_BACKGROUND_COLOR = 9;
const TAG_SHOW_FRAME = 1;
const TWIPS_PER_PIXEL = 20;

registerDeflateDecompressor();
const document = createScene2DFromSwf(createFunctionalSwf());
if (document === null || document.root.kind !== MovieClipKind) {
  throw new Error('[swf-import] synthetic SWF did not import as a MovieClip document');
}

const root = document.root as MovieClip;
if (getMovieClipTotalFrames(root) !== 2) {
  throw new Error(`[swf-import] expected a two-frame timeline, got ${getMovieClipTotalFrames(root)}`);
}
gotoAndStopMovieClip(root, 2);

const target = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: document.backgroundColor ?? BACKGROUND,
  kinds: [ShapeKind],
});
targetWidth = target.width;
target.render(root);
