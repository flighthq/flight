// swf-alpha-transform — renders authored PlaceObject2 CXFORMWITHALPHA records rather than assigning
// Flight appearance fields directly. Four solid overlays sit on blue backdrops: opaque red, red with a
// half alpha multiplier, red with a zero multiplier plus a non-zero alpha add, and white transformed to
// green through RGB multipliers.
//
// The scene deliberately records current backend behavior while the representation of SWF alpha-add is
// under design. DOM and Canvas do honor the imported node-alpha multiplier. Every backend currently
// culls m=0 before the non-zero alpha add can contribute. WebGL and WebGPU fold the RGB transform into
// their tessellated solid-shape paths; Canvas and DOM leave that backend-specific fold unapplied. The
// WebGPU runtime mesh-data assertion is important: a green pixel alone would not prove the tessellated
// path owns the fold rather than silently falling back to rasterization.

import { getRenderProxy2D } from '@flighthq/render/contract';
import type { Bitmap, ColorScaleBias, MovieClip, Shape, WgpuShapeRendererData } from '@flighthq/sdk';
import {
  createScene2DFromSwf,
  getBitmapPixelRgb,
  getNodeChildren,
  logInfo,
  MovieClipKind,
  registerGlColorAdjustmentMaterialFeature,
  registerWgpuColorAdjustmentMaterialFeature,
  ShapeKind,
} from '@flighthq/sdk';
import { createFunctionalTarget, declareAntialiasingPolicy } from '@ft/render';

const WIDTH = 640;
const HEIGHT = 220;
const BACKGROUND = 0x000000ff;
const SQUARE = 100;
const Y = 60;
const SAMPLE_X = [40, 190, 340, 490] as const;

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

let backend: 'canvas' | 'dom' | 'webgl' | 'webgpu' = 'canvas';
let domHalfOpacity: string | null = null;
let targetWidth = WIDTH;
let wgpuMeshCount: number | null = null;
let wgpuRasterSurfaceAllocated: boolean | null = null;

export function assertRender(frame: Readonly<Bitmap>): void {
  const scale = frame.width / targetWidth;
  const at = (column: number): number =>
    getBitmapPixelRgb(frame, Math.round((SAMPLE_X[column] + SQUARE / 2) * scale), Math.round((Y + SQUARE / 2) * scale));

  const control = at(0);
  const halfMultiply = at(1);
  const zeroMultiplyWithAdd = at(2);
  const rgbTransform = at(3);
  logInfo(
    {
      backend,
      control: hex(control),
      halfMultiply: hex(halfMultiply),
      rgbTransform: hex(rgbTransform),
      wgpuMeshCount,
      wgpuRasterSurfaceAllocated,
      zeroMultiplyWithAdd: hex(zeroMultiplyWithAdd),
    },
    'test',
  );

  if (!isRed(control)) {
    throw new Error(`[swf-alpha-transform/${backend}] opaque control is not red — got #${hex(control)}`);
  }
  if (!isHalfRedOverBlue(halfMultiply)) {
    throw new Error(
      `[swf-alpha-transform/${backend}] alpha multiplier did not blend red halfway over blue — got #${hex(halfMultiply)}`,
    );
  }
  if (!isBlue(zeroMultiplyWithAdd)) {
    throw new Error(
      `[swf-alpha-transform/${backend}] m=0 plus non-zero alpha-add was not culled — got #${hex(zeroMultiplyWithAdd)}`,
    );
  }
  const expectsGreen = backend === 'webgl' || backend === 'webgpu';
  if (expectsGreen ? !isGreen(rgbTransform) : !isWhite(rgbTransform)) {
    const expected = expectsGreen ? 'green (folded RGB transform)' : 'white (no GPU adjustment fold)';
    throw new Error(`[swf-alpha-transform/${backend}] adjusted solid is not ${expected} — got #${hex(rgbTransform)}`);
  }
}

function createAlphaTransformSwf(): Uint8Array {
  const tags = [
    createTag(TAG_SET_BACKGROUND_COLOR, new Uint8Array([0, 0, 0])),
    createSolidShape(BLUE_SHAPE_ID, 0x0000ff),
    createSolidShape(RED_SHAPE_ID, 0xff0000),
    createSolidShape(WHITE_SHAPE_ID, 0xffffff),
    place(BLUE_SHAPE_ID, 1, SAMPLE_X[0], Y),
    place(RED_SHAPE_ID, 2, SAMPLE_X[0], Y),
    place(BLUE_SHAPE_ID, 3, SAMPLE_X[1], Y),
    placeWithColorTransform(RED_SHAPE_ID, 4, SAMPLE_X[1], Y, [256, 256, 256, 128], [0, 0, 0, 0]),
    place(BLUE_SHAPE_ID, 5, SAMPLE_X[2], Y),
    placeWithColorTransform(RED_SHAPE_ID, 6, SAMPLE_X[2], Y, [256, 256, 256, 0], [0, 0, 0, 128]),
    place(BLUE_SHAPE_ID, 7, SAMPLE_X[3], Y),
    placeWithColorTransform(WHITE_SHAPE_ID, 8, SAMPLE_X[3], Y, [0, 256, 0, 256], [0, 0, 0, 0]),
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

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 0xff;
}

function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}

function isBlue(rgb: number): boolean {
  return channel(rgb, 16) < 40 && channel(rgb, 8) < 40 && channel(rgb, 0) > 210;
}

function isGreen(rgb: number): boolean {
  return channel(rgb, 16) < 40 && channel(rgb, 8) > 210 && channel(rgb, 0) < 40;
}

function isHalfRedOverBlue(rgb: number): boolean {
  const red = channel(rgb, 16);
  const green = channel(rgb, 8);
  const blue = channel(rgb, 0);
  return red >= 105 && red <= 150 && green < 40 && blue >= 105 && blue <= 150;
}

function isRed(rgb: number): boolean {
  return channel(rgb, 16) > 210 && channel(rgb, 8) < 40 && channel(rgb, 0) < 40;
}

function isWhite(rgb: number): boolean {
  return channel(rgb, 16) > 210 && channel(rgb, 8) > 210 && channel(rgb, 0) > 210;
}

function isGreenTransform(value: Readonly<ColorScaleBias> | null): boolean {
  return (
    value !== null &&
    Math.abs(value.redScale) < 0.0001 &&
    Math.abs(value.greenScale - 1) < 0.0001 &&
    Math.abs(value.blueScale) < 0.0001 &&
    Math.abs(value.alphaScale - 1) < 0.0001 &&
    Math.abs(value.redBias) < 0.0001 &&
    Math.abs(value.greenBias) < 0.0001 &&
    Math.abs(value.blueBias) < 0.0001 &&
    Math.abs(value.alphaBias) < 0.0001
  );
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

const document = createScene2DFromSwf(createAlphaTransformSwf());
if (document === null || document.root.kind !== MovieClipKind) {
  throw new Error('[swf-alpha-transform] synthetic SWF did not import as a MovieClip document');
}
const root = document.root as MovieClip;
const children = getNodeChildren(root);
if (children.length !== 8 || children.some((child) => child.kind !== ShapeKind)) {
  throw new Error(`[swf-alpha-transform] expected eight imported solid shapes, got ${children.length}`);
}

const halfAlpha = children[3] as Shape;
const zeroAlphaAdd = children[5] as Shape;
const rgbAdjustedSolid = children[7] as Shape;
if (Math.abs(halfAlpha.alpha - 0.5) > 0.0001) {
  throw new Error(`[swf-alpha-transform] half-alpha CXFORM imported node alpha ${halfAlpha.alpha}, expected 0.5`);
}
if (zeroAlphaAdd.alpha !== 0) {
  throw new Error(`[swf-alpha-transform] zero-multiply CXFORM imported node alpha ${zeroAlphaAdd.alpha}, expected 0`);
}

declareAntialiasingPolicy('aa');

const target = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: document.backgroundColor ?? BACKGROUND,
  kinds: [ShapeKind],
  expectedImageDescription:
    'A 640x220 opaque black field with four 100x100 squares in a row at y 60-160, at x 40-140, 190-290, ' +
    '340-440 and 490-590, each sitting on a blue backdrop of its own size. Left to right: the first is ' +
    'flat opaque red; the second is red at half strength over blue, reading as a muted purple that is ' +
    'clearly neither pure red nor pure blue; the third is plain blue, because the overlay above it ' +
    'contributes nothing at all — any red or pink in the third square is a failure. The fourth is a single ' +
    'flat light colour: WHITE on Canvas and DOM, or GREEN on WebGL and WebGPU, and never red or blue. ' +
    'That bound is deliberate and is not uncertainty about what this scene draws — the RGB-fold ' +
    'divergence between the raster and GPU paths is an UNDECIDED DESIGN, not an error, and one file ' +
    'covers all four backends, so no single value is the right one to write here. Until it is decided, ' +
    'this cell cannot be blessed as a permanent reference: whichever value a capture happened to record ' +
    'would silently settle the question. The first three squares look the same on every backend. Nothing ' +
    'is drawn outside the four squares.',
});
backend = target.kind;
targetWidth = target.width;
if (target.kind === 'webgl') registerGlColorAdjustmentMaterialFeature(target.state);
if (target.kind === 'webgpu') registerWgpuColorAdjustmentMaterialFeature(target.state);
target.render(root);

const adjustedProxy = getRenderProxy2D(target.state, rgbAdjustedSolid);
if (adjustedProxy === undefined) {
  throw new Error(`[swf-alpha-transform/${backend}] adjusted solid has no render proxy`);
}
const realizesColorAdjustment = target.kind === 'webgl' || target.kind === 'webgpu';
if (realizesColorAdjustment) {
  if (!isGreenTransform(adjustedProxy.colorScaleBias)) {
    throw new Error(
      `[swf-alpha-transform/${backend}] imported RGB CXFORM did not reach the adjusted solid render proxy`,
    );
  }
} else if (adjustedProxy.colorScaleBias !== null) {
  throw new Error(`[swf-alpha-transform/${backend}] unsupported RGB CXFORM unexpectedly reached the render proxy`);
}
const halfAlphaProxy = getRenderProxy2D(target.state, halfAlpha);
if (halfAlphaProxy === undefined || Math.abs(halfAlphaProxy.alpha - 0.5) > 0.0001) {
  throw new Error('[swf-alpha-transform] imported alpha multiplier did not reach the half-alpha render proxy');
}
if (target.kind === 'dom') {
  const data = halfAlphaProxy.rendererData as unknown as { canvas: HTMLCanvasElement | null } | null;
  domHalfOpacity = data?.canvas?.style.opacity ?? null;
  if (domHalfOpacity !== '0.5') {
    throw new Error(`[swf-alpha-transform/dom] shape renderer did not apply opacity 0.5 — got ${domHalfOpacity}`);
  }
}
if (target.kind === 'webgpu') {
  const data = adjustedProxy.rendererData as unknown as WgpuShapeRendererData | null;
  wgpuMeshCount = data?.meshes?.length ?? 0;
  wgpuRasterSurfaceAllocated = data?.surface !== null && data?.surface !== undefined;
  if (wgpuMeshCount === 0 || wgpuRasterSurfaceAllocated) {
    throw new Error(
      `[swf-alpha-transform] imported adjusted solid did not use WebGPU mesh-only data ` +
        `(meshes ${wgpuMeshCount}, raster surface ${String(wgpuRasterSurfaceAllocated)})`,
    );
  }
}
logInfo(
  {
    backend,
    domHalfOpacity,
    importedHalfAlpha: halfAlpha.alpha,
    importedZeroAlpha: zeroAlphaAdd.alpha,
    wgpuMeshCount,
    wgpuRasterSurfaceAllocated,
  },
  'test',
);
