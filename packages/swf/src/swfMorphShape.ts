import { createMatrix } from '@flighthq/geometry/contract';
import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { createPathMorph } from '@flighthq/path/contract';
import {
  appendMorphShapeBeginFill,
  appendMorphShapeBeginGradientFill,
  appendMorphShapeBeginTextureFill,
  appendMorphShapeLineStyle,
  appendMorphShapePath,
  createMorphShape,
} from '@flighthq/shape/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';
import type { ImportDiagnostic } from '@flighthq/types/contract';
import type {
  CapsStyle,
  GradientType,
  JointStyle,
  Matrix,
  MorphShape,
  MorphShapeGradientEndpoint,
  Path,
  SpreadMethod,
  Texture2D,
} from '@flighthq/types/contract';

import { SwfReader } from './swfReader';
import { readSwfMorphShapePaths } from './swfShape';

// Decodes a DefineMorphShape/2 body into a MorphShape.
//
// A morph shape is the one SWF definition that stores its geometry twice: one style array, then a start
// and an end SHAPE whose edges the format guarantees run in step. So the styles are read once as pairs,
// each edge set is decoded against style indices alone, and an index carried by both endpoints becomes
// one path morph under the paint morph that index named. Both halves of a style — a fill's colour or
// gradient stops, a stroke's width and colour — are interpolated by the same progress that drives the
// geometry, which is what a placement's ratio sets.
//
// The reader must be positioned immediately after the character id and the bounds the caller already
// read. Returns null when the body does not decode, so an unreadable morph costs its own definition and
// nothing else.
export function createSwfMorphShape(
  reader: SwfReader,
  version: number,
  resolveBitmapFill: SwfMorphBitmapFillResolver | null = null,
  diagnostics?: ImportDiagnostic[],
): MorphShape | null {
  // MorphShape2 adds per-endpoint edge bounds and the scaling-stroke flags before the edge offset.
  if (version >= 2) {
    if (!skipSwfMorphRectangle(reader) || !skipSwfMorphRectangle(reader)) return null;
    reader.readUint8();
  }
  const endEdgesOffset = reader.readUint32();
  const endEdgesStart = reader.pos + endEdgesOffset;
  if (!reader.valid || endEdgesStart > reader.end || endEdgesOffset === 0) return null;

  const fills = readSwfMorphFillStyles(reader, version, resolveBitmapFill);
  if (fills === null) return null;
  const lines = readSwfMorphLineStyles(reader, version, resolveBitmapFill);
  if (lines === null) return null;

  // The offset bounds the start edges exactly, which is also what keeps a truncated first half from
  // being read as the second. Both sets are walked together: the end set names no styles of its own, and
  // the two record streams do not always line up one-for-one.
  const paths = readSwfMorphShapePaths(
    new SwfReader(reader.source, reader.pos, endEdgesStart),
    new SwfReader(reader.source, endEdgesStart, reader.end),
  );
  if (paths === null) return null;

  // A declined pair leaves a shape that still draws, so the count is the only thing that separates a
  // morph that decoded whole from one carrying fewer paths than it was authored with.
  const declined = { count: 0 };
  const node = createSwfMorphShapeNode(fills, lines, paths.fills, paths.lines, declined);
  if (declined.count > 0) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Drop,
      'swf.morph-path-pair-declined',
      'createSwfMorphShape',
      { lostPairs: declined.count },
    );
  }
  return node;
}

function createSwfMorphShapeNode(
  fills: readonly Readonly<SwfMorphFill>[],
  lines: readonly Readonly<SwfMorphLine>[],
  fillPaths: ReadonlyMap<number, { readonly end: Path; readonly start: Path }>,
  linePaths: ReadonlyMap<number, { readonly end: Path; readonly start: Path }>,
  declined: { count: number },
): MorphShape | null {
  const paired = pairSwfMorphPaths(fillPaths, declined);
  const pairedLines = pairSwfMorphPaths(linePaths, declined);
  if (paired.length === 0 && pairedLines.length === 0) return null;

  // The node is created around the first morph and every morph — including that one — is appended under
  // its own style, so the compound case and the single-fill case take exactly the same path.
  const shape = createMorphShape((paired[0] ?? pairedLines[0]).morph);

  for (const { index, morph } of paired) {
    const fill = fills[index - 1];
    if (fill === undefined) continue;
    if (!appendSwfMorphFillStyle(shape, fill)) continue;
    appendMorphShapePath(shape, morph);
  }

  for (const { index, morph } of pairedLines) {
    const line = lines[index - 1];
    if (line === undefined) continue;
    appendMorphShapeLineStyle(
      shape,
      { alpha: line.startAlpha, color: line.startColor, thickness: line.startWidth / TWIPS_PER_PIXEL },
      { alpha: line.endAlpha, color: line.endColor, thickness: line.endWidth / TWIPS_PER_PIXEL },
      line.pixelHinting,
      'normal',
      line.caps,
      line.joints,
      line.miterLimit,
    );
    appendMorphShapePath(shape, morph);
  }

  return shape.data.commands.length > 0 ? shape : null;
}

// Emits the paint half of one fill style. Returns false when the style has no expressible paint, so the
// caller leaves its geometry unappended rather than drawing it under whatever style preceded it.
function appendSwfMorphFillStyle(shape: MorphShape, fill: Readonly<SwfMorphFill>): boolean {
  if (fill.texture !== null) {
    appendMorphShapeBeginTextureFill(shape, fill.texture, fill.startTextureMatrix, fill.endTextureMatrix);
    return true;
  }
  if (fill.gradientType === null) {
    appendMorphShapeBeginFill(
      shape,
      { alpha: fill.startAlpha, color: fill.startColor },
      { alpha: fill.endAlpha, color: fill.endColor },
    );
    return true;
  }
  // A gradient whose endpoints disagree on stop count cannot interpolate; the append reports that rather
  // than emitting a fill that would sample wrongly.
  return appendMorphShapeBeginGradientFill(
    shape,
    fill.gradientType,
    fill.startGradient!,
    fill.endGradient!,
    fill.spreadMethod,
    'rgb',
  );
}

// One decoded MORPHFILLSTYLE. A solid fill uses the colour pair; a gradient uses the endpoint pair; a
// bitmap fill shares one texture and interpolates only its matrix.
interface SwfMorphFill {
  endAlpha: number;
  endColor: number;
  endGradient: MorphShapeGradientEndpoint | null;
  endTextureMatrix: Matrix;
  gradientType: GradientType | null;
  spreadMethod: SpreadMethod;
  startAlpha: number;
  startColor: number;
  startGradient: MorphShapeGradientEndpoint | null;
  startTextureMatrix: Matrix;
  texture: Texture2D | null;
}

interface SwfMorphLine {
  caps: CapsStyle;
  endAlpha: number;
  endColor: number;
  endWidth: number;
  joints: JointStyle;
  miterLimit: number;
  pixelHinting: boolean;
  startAlpha: number;
  startColor: number;
  startWidth: number;
}

interface SwfMorphPathPair {
  index: number;
  morph: ReturnType<typeof createPathMorph> & object;
}

// Prepares each style index's endpoint pair. The two paths already have identical structure, so the morph
// builder has nothing to reconcile; a pair it still declines is dropped, leaving the rest of the shape
// intact rather than failing the definition.
function pairSwfMorphPaths(
  paths: ReadonlyMap<number, { readonly end: Path; readonly start: Path }>,
  declined: { count: number },
): SwfMorphPathPair[] {
  const pairs: SwfMorphPathPair[] = [];
  for (const index of [...paths.keys()].sort(compareSwfMorphIndex)) {
    const pair = paths.get(index)!;
    const morph = createPathMorph(pair.start, pair.end);
    if (morph === null) declined.count++;
    else pairs.push({ index, morph });
  }
  return pairs;
}

function compareSwfMorphIndex(a: number, b: number): number {
  return a - b;
}

function readSwfMorphColor(reader: SwfReader): { alpha: number; color: number } {
  const red = reader.readUint8();
  const green = reader.readUint8();
  const blue = reader.readUint8();
  const alpha = reader.readUint8();
  return { alpha: alpha / 0xff, color: ((red << 24) | (green << 16) | (blue << 8) | 0xff) >>> 0 };
}

function readSwfMorphFillStyles(
  reader: SwfReader,
  version: number,
  resolveBitmapFill: SwfMorphBitmapFillResolver | null,
): SwfMorphFill[] | null {
  const count = readSwfMorphStyleCount(reader);
  if (count === null) return null;
  const fills: SwfMorphFill[] = [];
  for (let i = 0; i < count; i++) {
    const fill = readSwfMorphFillStyle(reader, version, resolveBitmapFill);
    if (fill === null) return null;
    fills.push(fill);
  }
  return fills;
}

function readSwfMorphFillStyle(
  reader: SwfReader,
  version: number,
  resolveBitmapFill: SwfMorphBitmapFillResolver | null,
): SwfMorphFill | null {
  const type = reader.readUint8();
  if (!reader.valid) return null;

  if (type === FILL_SOLID) {
    const start = readSwfMorphColor(reader);
    const end = readSwfMorphColor(reader);
    if (!reader.valid) return null;
    return createSwfMorphFill({
      endAlpha: end.alpha,
      endColor: end.color,
      startAlpha: start.alpha,
      startColor: start.color,
    });
  }

  if (type === FILL_LINEAR_GRADIENT || type === FILL_RADIAL_GRADIENT || type === FILL_FOCAL_GRADIENT) {
    const startMatrix = readSwfMorphMatrix(reader);
    const endMatrix = readSwfMorphMatrix(reader);
    // The whole byte is the stop count. Every morph gradient in the corpus is a version 1 morph, where
    // that is unambiguous; whether a version 2 morph instead packs spread and interpolation into the high
    // nibble the way a static gradient does is untested here, and is recorded as an open question rather
    // than guessed at.
    const stops = reader.readUint8();
    if (!reader.valid || stops === 0 || stops > MAX_GRADIENT_STOPS) return null;

    const startColors: number[] = [];
    const startAlphas: number[] = [];
    const startRatios: number[] = [];
    const endColors: number[] = [];
    const endAlphas: number[] = [];
    const endRatios: number[] = [];
    for (let i = 0; i < stops; i++) {
      startRatios.push(reader.readUint8() / 0xff);
      const start = readSwfMorphColor(reader);
      startColors.push(start.color);
      startAlphas.push(start.alpha);
      endRatios.push(reader.readUint8() / 0xff);
      const end = readSwfMorphColor(reader);
      endColors.push(end.color);
      endAlphas.push(end.alpha);
    }
    // A focal gradient carries its focus per endpoint, and only in the version 2 form.
    const startFocal = type === FILL_FOCAL_GRADIENT && version >= 2 ? readSwfMorphFixed8(reader) : 0;
    const endFocal = type === FILL_FOCAL_GRADIENT && version >= 2 ? readSwfMorphFixed8(reader) : 0;
    if (!reader.valid) return null;

    return createSwfMorphFill({
      endGradient: {
        alphas: endAlphas,
        colors: endColors,
        focalPointRatio: endFocal,
        matrix: endMatrix,
        ratios: endRatios,
      },
      gradientType: type === FILL_LINEAR_GRADIENT ? 'linear' : 'radial',
      startGradient: {
        alphas: startAlphas,
        colors: startColors,
        focalPointRatio: startFocal,
        matrix: startMatrix,
        ratios: startRatios,
      },
    });
  }

  if (
    type === FILL_REPEATING_BITMAP ||
    type === FILL_CLIPPED_BITMAP ||
    type === FILL_NON_SMOOTHED_REPEATING_BITMAP ||
    type === FILL_NON_SMOOTHED_CLIPPED_BITMAP
  ) {
    const characterId = reader.readUint16();
    const startMatrix = readSwfMorphMatrix(reader);
    const endMatrix = readSwfMorphMatrix(reader);
    if (!reader.valid) return null;
    const repeat = type === FILL_REPEATING_BITMAP || type === FILL_NON_SMOOTHED_REPEATING_BITMAP;
    const smoothed = type === FILL_REPEATING_BITMAP || type === FILL_CLIPPED_BITMAP;
    return createSwfMorphFill({
      endTextureMatrix: createSwfMorphTextureMatrix(endMatrix),
      startTextureMatrix: createSwfMorphTextureMatrix(startMatrix),
      texture: resolveBitmapFill?.(characterId, repeat, smoothed) ?? null,
    });
  }

  return null;
}

function readSwfMorphLineStyles(
  reader: SwfReader,
  version: number,
  resolveBitmapFill: SwfMorphBitmapFillResolver | null,
): SwfMorphLine[] | null {
  const count = readSwfMorphStyleCount(reader);
  if (count === null) return null;
  const lines: SwfMorphLine[] = [];
  for (let i = 0; i < count; i++) {
    const line = readSwfMorphLineStyle(reader, version, resolveBitmapFill);
    if (line === null) return null;
    lines.push(line);
  }
  return lines;
}

function readSwfMorphLineStyle(
  reader: SwfReader,
  version: number,
  resolveBitmapFill: SwfMorphBitmapFillResolver | null,
): SwfMorphLine | null {
  const startWidth = reader.readUint16();
  const endWidth = reader.readUint16();
  if (!reader.valid) return null;

  if (version < 2) {
    const start = readSwfMorphColor(reader);
    const end = readSwfMorphColor(reader);
    if (!reader.valid) return null;
    return {
      caps: 'round',
      endAlpha: end.alpha,
      endColor: end.color,
      endWidth,
      joints: 'round',
      miterLimit: 3,
      pixelHinting: false,
      startAlpha: start.alpha,
      startColor: start.color,
      startWidth,
    };
  }

  const startCaps = reader.readUnsignedBits(2);
  const joinStyle = reader.readUnsignedBits(2);
  const hasFill = reader.readUnsignedBits(1) !== 0;
  reader.readUnsignedBits(2);
  const pixelHinting = reader.readUnsignedBits(1) !== 0;
  reader.readUnsignedBits(5);
  reader.readUnsignedBits(1);
  reader.readUnsignedBits(2);
  const miterLimit = joinStyle === JOIN_MITER ? reader.readUint16() / FIXED_8_8_ONE : 3;
  if (!reader.valid) return null;

  // A version 2 stroke may carry a whole fill in place of its colour. Its geometry still strokes, so the
  // fill is read to keep the stream aligned and the stroke falls back to opaque black.
  if (hasFill) {
    const fill = readSwfMorphFillStyle(reader, version, resolveBitmapFill);
    if (fill === null) return null;
    return {
      caps: resolveSwfMorphCapsStyle(startCaps),
      endAlpha: fill.endAlpha,
      endColor: fill.endColor,
      endWidth,
      joints: resolveSwfMorphJointStyle(joinStyle),
      miterLimit,
      pixelHinting,
      startAlpha: fill.startAlpha,
      startColor: fill.startColor,
      startWidth,
    };
  }

  const start = readSwfMorphColor(reader);
  const end = readSwfMorphColor(reader);
  if (!reader.valid) return null;
  return {
    caps: resolveSwfMorphCapsStyle(startCaps),
    endAlpha: end.alpha,
    endColor: end.color,
    endWidth,
    joints: resolveSwfMorphJointStyle(joinStyle),
    miterLimit,
    pixelHinting,
    startAlpha: start.alpha,
    startColor: start.color,
    startWidth,
  };
}

function createSwfMorphFill(overrides: Partial<SwfMorphFill>): SwfMorphFill {
  return {
    endAlpha: 1,
    endColor: 0,
    endGradient: null,
    endTextureMatrix: createMatrix(),
    gradientType: null,
    spreadMethod: 'pad',
    startAlpha: 1,
    startColor: 0,
    startGradient: null,
    startTextureMatrix: createMatrix(),
    texture: null,
    ...overrides,
  };
}

// A bitmap fill's matrix maps the image's own pixel space onto a shape written in twips, so its linear
// part divides where a gradient's does not — the same asymmetry the static shape decoder documents.
function createSwfMorphTextureMatrix(matrix: Readonly<Matrix>): Matrix {
  return createMatrix(
    matrix.a / TWIPS_PER_PIXEL,
    matrix.b / TWIPS_PER_PIXEL,
    matrix.c / TWIPS_PER_PIXEL,
    matrix.d / TWIPS_PER_PIXEL,
    matrix.tx,
    matrix.ty,
  );
}

function readSwfMorphFixed8(reader: SwfReader): number {
  const value = reader.readUint16();
  return (value >= 0x8000 ? value - 0x10000 : value) / FIXED_8_8_ONE;
}

function readSwfMorphMatrix(reader: SwfReader): Matrix {
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
  return createMatrix(a, b, c, d, tx, ty);
}

function readSwfMorphStyleCount(reader: SwfReader): number | null {
  const count = reader.readUint8();
  const resolved = count === EXTENDED_STYLE_COUNT ? reader.readUint16() : count;
  return reader.valid && resolved <= MAX_MORPH_STYLES ? resolved : null;
}

function resolveSwfMorphCapsStyle(value: number): CapsStyle {
  if (value === CAP_NONE) return 'none';
  return value === CAP_SQUARE ? 'square' : 'round';
}

function resolveSwfMorphJointStyle(value: number): JointStyle {
  if (value === JOIN_BEVEL) return 'bevel';
  return value === JOIN_MITER ? 'miter' : 'round';
}

function skipSwfMorphRectangle(reader: SwfReader): boolean {
  const bits = reader.readUnsignedBits(5);
  for (let i = 0; i < 4; i++) reader.readSignedBits(bits);
  reader.alignToByte();
  return reader.valid;
}

const CAP_NONE = 1;
const CAP_SQUARE = 2;
const EXTENDED_STYLE_COUNT = 0xff;
const FILL_CLIPPED_BITMAP = 0x41;
const FILL_FOCAL_GRADIENT = 0x13;
const FILL_LINEAR_GRADIENT = 0x10;
const FILL_NON_SMOOTHED_CLIPPED_BITMAP = 0x43;
const FILL_NON_SMOOTHED_REPEATING_BITMAP = 0x42;
const FILL_RADIAL_GRADIENT = 0x12;
const FILL_REPEATING_BITMAP = 0x40;
const FILL_SOLID = 0x00;
const FIXED_8_8_ONE = 0x100;
const FIXED_16_ONE = 0x10000;
const JOIN_BEVEL = 1;
const JOIN_MITER = 2;
const MAX_GRADIENT_STOPS = 15;
const MAX_MORPH_STYLES = 0xffff;
const TWIPS_PER_PIXEL = 20;

// Resolves the texture a morph bitmap fill samples, by character id. Mirrors the static shape decoder's
// resolver; a morph bitmap fill interpolates only its matrix, so one texture serves both endpoints.
type SwfMorphBitmapFillResolver = (characterId: number, repeat: boolean, smoothed: boolean) => Texture2D | null;
