// swf-mirrored-placement — render coverage for a SWF PlaceObject2 matrix that MIRRORS (negative
// determinant). Flipped symbols are ordinary in authored Flash content, and swfDocument hands each
// placement matrix straight to setNodeLocalMatrix, which decomposes it into the node's transform
// fields. When that decomposition carried a reflection on scaleY while deriving skewX as though scaleY
// were positive, a scale(-1, 1) placement came back out as (-1, 0, 0, -1) — a 180° ROTATION — and every
// mirrored symbol rendered wrong. Nothing caught it: no scene authored a mirrored placement.
//
// THE ASYMMETRY THAT MAKES THIS A GATE IS IN THE PLACEMENT, NOT THE GLYPH. A mirror and a 180° rotation
// both negate X, so a left/right feature cannot tell them apart — only the Y behaviour separates them.
// A SWF shape is drawn from its own origin, so a plain square already sits entirely below-and-right of
// the point its matrix places, and that is enough: under the correct mirror the square hangs BELOW the
// placement row, under the defect it hangs ABOVE it. The scene assertion samples both sides, so it fails in
// either direction rather than merely proving the square is somewhere.
//
// SCOPE, STATED NARROWLY: one mirrored PlaceObject2 matrix against an unmirrored control, on solid
// shapes. It says nothing about rotation or skew in a placement, nested sprite placements, or mirrored
// bitmaps and text. Read a pass as "a mirrored placement survives import and renders mirrored," never
// as "SWF transforms are covered."
//
// The scene assertion gates canvas, webgl and webgpu — not dom. The DOM verifier has no pixels to read back and
// returns after checking the target element has children, before any scene assertion runs (functionalVerify.ts).
import type { Bitmap, MovieClip } from '@flighthq/sdk';
import { createScene2DFromSwf, getBitmapPixelRgb, getNodeChildren, MovieClipKind, ShapeKind } from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const WIDTH = 640;
const HEIGHT = 300;
const BACKGROUND = 0x000000ff;
const SQUARE = 100;

// Both placements put their origin on this row, so "above" and "below" mean the same thing for each.
const ROW_Y = 100;
const CONTROL_X = 60;
// The mirrored placement's origin. Local +x runs LEFT from here, so the square lands at x = 320..420.
const MIRROR_X = 420;

const CONTROL_SHAPE_ID = 1;
const MIRROR_SHAPE_ID = 2;
const CONTROL_COLOR = 0x33ccff;
const MIRROR_COLOR = 0x33ff66;

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

// Assigned by the module-init block at the bottom of the file. The SWF writers below are classes, and
// class declarations are not hoisted — building the document up here would read them from the temporal
// dead zone and fail at import.
let targetWidth = WIDTH;

export function assertRender(frame: Readonly<Bitmap>): void {
  const scale = frame.width / targetWidth;
  const at = (x: number, y: number): number => getBitmapPixelRgb(frame, Math.round(x * scale), Math.round(y * scale));

  // The unmirrored control hangs below-and-right of its placement origin.
  const control = at(CONTROL_X + SQUARE / 2, ROW_Y + SQUARE / 2);
  if (!isControlColor(control)) {
    throw new Error(`[swf-mirrored-placement] the unmirrored control square is missing — got #${hex(control)}`);
  }

  // The mirrored square must hang below-and-LEFT of its origin. Under the defect's 180° rotation it
  // hangs above instead, so these two samples separate a mirror from a rotation.
  const below = at(MIRROR_X - SQUARE / 2, ROW_Y + SQUARE / 2);
  const above = at(MIRROR_X - SQUARE / 2, ROW_Y - SQUARE / 2);
  if (!isMirrorColor(below)) {
    throw new Error(
      `[swf-mirrored-placement] reflection lost: the mirrored square is not below its placement row — ` +
        `got #${hex(below)}. A scale(-1,1) placement matrix decomposed to a 180° rotation instead of a mirror.`,
    );
  }
  if (isMirrorColor(above)) {
    throw new Error(
      `[swf-mirrored-placement] the mirrored square sits ABOVE its placement row — got #${hex(above)}. ` +
        `That is the 180°-rotation rendering, not a mirror.`,
    );
  }

  // A mirror runs leftward from its origin; nothing may spill to the right of it.
  const spill = at(MIRROR_X + SQUARE / 2, ROW_Y + SQUARE / 2);
  if (isMirrorColor(spill)) {
    throw new Error(`[swf-mirrored-placement] the mirrored square extends right of its origin — got #${hex(spill)}`);
  }
}

function createMirroredPlacementSwf(): Uint8Array {
  const tags = [
    createTag(TAG_SET_BACKGROUND_COLOR, new Uint8Array([0, 0, 0])),
    createSolidShape(CONTROL_SHAPE_ID, CONTROL_COLOR),
    createSolidShape(MIRROR_SHAPE_ID, MIRROR_COLOR),
    place(CONTROL_SHAPE_ID, 1, 1, 1, CONTROL_X, ROW_Y),
    // The mirror: scaleX = -1 against scaleY = +1 gives the placement a determinant of -1.
    place(MIRROR_SHAPE_ID, 2, -1, 1, MIRROR_X, ROW_Y),
    createTag(TAG_SHOW_FRAME),
    createTag(TAG_END),
  ];
  const body = joinBytes(
    createRectangle(0, WIDTH * TWIPS_PER_PIXEL, 0, HEIGHT * TWIPS_PER_PIXEL),
    uint16(24 * 256),
    uint16(1),
    ...tags,
  );
  return joinBytes(new Uint8Array([0x46, 0x57, 0x53, 9]), uint32(SWF_PREFIX_LENGTH + body.length), body);
}

function createSolidShape(characterId: number, color: number): Uint8Array {
  const writer = new ShapeWriter();
  writer.writeSolidFillStyle(color);
  writer.writeLineStyleCount(0);
  writer.writeStyleBits(1, 0);
  writer.writeStyleChange(1, 0, 0);
  writer.writeRectangle(SQUARE * TWIPS_PER_PIXEL, SQUARE * TWIPS_PER_PIXEL);
  writer.writeEndShape();
  return createTag(
    TAG_DEFINE_SHAPE,
    joinBytes(
      uint16(characterId),
      createRectangle(0, SQUARE * TWIPS_PER_PIXEL, 0, SQUARE * TWIPS_PER_PIXEL),
      writer.toBytes(),
    ),
  );
}

function place(characterId: number, depth: number, scaleX: number, scaleY: number, x: number, y: number): Uint8Array {
  return createTag(
    TAG_PLACE_OBJECT_2,
    joinBytes(
      new Uint8Array([PLACE_HAS_CHARACTER | PLACE_HAS_MATRIX]),
      uint16(depth),
      uint16(characterId),
      createMatrix(scaleX, scaleY, x * TWIPS_PER_PIXEL, y * TWIPS_PER_PIXEL),
    ),
  );
}

function createMatrix(scaleX: number, scaleY: number, tx: number, ty: number): Uint8Array {
  const writer = new BitWriter();
  const scales = [Math.round(scaleX * FIXED_16_ONE), Math.round(scaleY * FIXED_16_ONE)];
  const scaleBits = signedBitCount(scales);
  writer.writeUnsigned(1, 1);
  writer.writeUnsigned(scaleBits, 5);
  writer.writeSigned(scales[0], scaleBits);
  writer.writeSigned(scales[1], scaleBits);
  // No rotate/skew: the reflection lives entirely in the scale pair, which is how authoring tools emit
  // a flipped symbol and is the shape the decomposition mishandled.
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

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 0xff;
}

function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}

function isControlColor(rgb: number): boolean {
  return channel(rgb, 16) < 120 && channel(rgb, 8) > 130 && channel(rgb, 0) > 180;
}

function isMirrorColor(rgb: number): boolean {
  return channel(rgb, 16) < 120 && channel(rgb, 8) > 180 && channel(rgb, 0) < 160;
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

const document = createScene2DFromSwf(createMirroredPlacementSwf());
if (document === null || document.root.kind !== MovieClipKind) {
  throw new Error('[swf-mirrored-placement] synthetic SWF did not import as a MovieClip document');
}
const root = document.root as MovieClip;
const children = getNodeChildren(root);
if (children.length !== 2 || children.some((child) => child.kind !== ShapeKind)) {
  throw new Error(`[swf-mirrored-placement] expected two imported solid shapes, got ${children.length}`);
}

const target = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: document.backgroundColor ?? BACKGROUND,
  kinds: [ShapeKind],
  expectedImageDescription:
    'A 640x300 opaque black field with two flat 100x100 squares, both with their tops on y 100 and both ' +
    'hanging BELOW it to y 200. The cyan one lies to the right of its placement point, spanning x 60-160; ' +
    'the green one lies to the LEFT of its placement point, spanning x 320-420. Hanging below is the whole ' +
    'claim: the mirrored square must fall on the same side of that line as the unmirrored one, so a green ' +
    'square sitting ABOVE the line in y 0-100 — what a half turn produces instead of a mirror — is the ' +
    'failure being watched for. Both colours are flat, with no gradient or blending, and the rest of the ' +
    'field is pure black.',
});
targetWidth = target.width;
target.render(root);
