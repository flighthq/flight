import { createGradientTransformMatrix } from '@flighthq/geometry/contract';
import { createPath, dashPath, getPathLength } from '@flighthq/path/contract';
import {
  appendShapeBeginFill,
  appendShapeBeginGradientFill,
  appendShapeEndFill,
  appendShapeLineGradientStyle,
  appendShapeLineStyle,
  appendShapePath,
} from '@flighthq/shape/contract';
import type {
  CapsStyle,
  JointStyle,
  Path,
  PathWinding,
  RiveArtboardGraph,
  RiveCoreObject,
  RivePathRecord,
  Shape,
} from '@flighthq/types/contract';

import { isRiveCoreTypeDerivedFrom } from './riveCoreTypes';

/**
 * Reads a Rive shape's paint and draws its paths under each one.
 *
 * A shape states a **list** of paints, not one of each kind, and every paint covers all of that
 * shape's paths. So each paint restates the whole path set in the order the file lists them, which
 * is what lets a second fill sit above the first instead of replacing it.
 */
export function appendRiveShapePaint(
  shape: Shape,
  artboard: Readonly<RiveArtboardGraph>,
  shapeIndex: number,
  paths: readonly RivePathRecord[],
): void {
  if (paths.length === 0) return;
  const paints = collectRivePaints(artboard, shapeIndex);
  if (paints.length === 0) {
    appendRivePaths(shape, paths, null);
    return;
  }
  for (const paint of paints) {
    if (!paint.visible) continue;
    if (paint.stroke === null) {
      appendRiveFillStyle(shape, paint);
      appendRivePaths(shape, paths, paint.fillRule);
      appendShapeEndFill(shape);
      continue;
    }
    appendRiveStrokeStyle(shape, paint);
    appendRivePaths(shape, paint.trim === null ? paths : trimRivePaths(paths, paint.trim), null);
  }
}

function appendRivePaths(shape: Shape, paths: readonly RivePathRecord[], winding: 'evenOdd' | 'nonZero' | null): void {
  for (const path of paths) appendShapePath(shape, path.commands.slice(), path.data.slice(), winding ?? path.winding);
}

function appendRiveFillStyle(shape: Shape, paint: Readonly<RivePaint>): void {
  if (paint.gradient === null) {
    appendShapeBeginFill(shape, paint.color, paint.alpha);
    return;
  }
  appendShapeBeginGradientFill(
    shape,
    paint.gradient.radial ? 'radial' : 'linear',
    paint.gradient.colors,
    paint.gradient.alphas,
    paint.gradient.ratios,
    createRiveGradientMatrix(paint.gradient),
  );
}

function appendRiveStrokeStyle(shape: Shape, paint: Readonly<RivePaint>): void {
  const stroke = paint.stroke!;
  if (paint.gradient === null) {
    appendShapeLineStyle(
      shape,
      stroke.thickness,
      paint.color,
      paint.alpha,
      false,
      'normal',
      stroke.caps,
      stroke.joints,
    );
    return;
  }
  appendShapeLineStyle(shape, stroke.thickness, 0, 1, false, 'normal', stroke.caps, stroke.joints);
  appendShapeLineGradientStyle(
    shape,
    paint.gradient.radial ? 'radial' : 'linear',
    paint.gradient.colors,
    paint.gradient.alphas,
    paint.gradient.ratios,
    createRiveGradientMatrix(paint.gradient),
  );
}

interface RiveGradientPaint {
  alphas: number[];
  colors: number[];
  endX: number;
  endY: number;
  radial: boolean;
  ratios: number[];
  startX: number;
  startY: number;
}

interface RiveTrim {
  end: number;
  offset: number;
  /** Sequential treats the shape's paths as one continuous run; synchronized trims each alike. */
  sequential: boolean;
  start: number;
}

interface RivePaint {
  alpha: number;
  color: number;
  fillRule: PathWinding;
  gradient: RiveGradientPaint | null;
  stroke: { caps: CapsStyle; joints: JointStyle; thickness: number } | null;
  trim: RiveTrim | null;
  visible: boolean;
}

/**
 * Trims a stroke's paths to the span its trim states, as fractions of length.
 *
 * The two modes differ in what the fractions measure. Synchronized measures each path against its
 * own length, so every path keeps the same proportion. Sequential measures against the paths' total
 * length as if they were one continuous run, so the visible span can start inside one path and end
 * inside another — which is why the sequential branch tracks a cumulative offset rather than
 * treating each path alone.
 */
function trimRivePaths(paths: readonly RivePathRecord[], trim: Readonly<RiveTrim>): RivePathRecord[] {
  const visible = toRiveVisibleFraction(trim);
  if (visible >= 1) return [...paths];
  if (visible <= 0) return [];

  // The visible span as one or two windows over 0..1. A span that runs off the end wraps to the
  // front, which is how a trim animates continuously around a closed shape.
  const begin = (((trim.start + trim.offset) % 1) + 1) % 1;
  const windows: Array<readonly [number, number]> =
    begin + visible <= 1
      ? [[begin, begin + visible]]
      : [
          [begin, 1],
          [0, begin + visible - 1],
        ];

  if (!trim.sequential) {
    // Each path is measured against its own length, so every path sees the same windows.
    return paths.flatMap((path) => trimRivePathToWindows(path, 0, 1, windows));
  }

  const lengths = paths.map((path) => getPathLength(toRivePath(path)));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  if (total <= 0) return [];
  const results: RivePathRecord[] = [];
  let travelled = 0;
  for (let index = 0; index < paths.length; index++) {
    const from = travelled / total;
    travelled += lengths[index];
    results.push(...trimRivePathToWindows(paths[index], from, travelled / total, windows));
  }
  return results;
}

// Emits the parts of one path that fall inside the windows, with the path occupying [from, to] of
// whatever space those windows are measured in.
function trimRivePathToWindows(
  record: RivePathRecord,
  from: number,
  to: number,
  windows: ReadonlyArray<readonly [number, number]>,
): RivePathRecord[] {
  const span = to - from;
  if (span <= 0) return [];
  const path = toRivePath(record);
  const length = getPathLength(path);
  if (length <= 0) return [];

  const results: RivePathRecord[] = [];
  for (const [windowStart, windowEnd] of windows) {
    const start = Math.max(0, (windowStart - from) / span);
    const end = Math.min(1, (windowEnd - from) / span);
    if (end <= start) continue;
    const trimmed = createPath(record.winding);
    dashPath(path, [(end - start) * length, (1 - (end - start)) * length], start * length, trimmed);
    results.push({ commands: trimmed.commands.slice(), data: trimmed.data.slice(), winding: trimmed.winding });
  }
  return results;
}

function toRiveVisibleFraction(trim: Readonly<RiveTrim>): number {
  const span = trim.end - trim.start;
  if (Math.abs(span) >= 1) return 1;
  return ((span % 1) + 1) % 1;
}

function toRivePath(record: RivePathRecord): Path {
  const path = createPath(record.winding);
  for (const command of record.commands) path.commands.push(command);
  for (const value of record.data) path.data.push(value);
  return path;
}

// A trim belongs to the stroke it is a child of, not to the shape.
function readRiveTrim(artboard: Readonly<RiveArtboardGraph>, paintIndex: number): RiveTrim | null {
  for (let index = paintIndex + 1; index < artboard.objects.length; index++) {
    if (artboard.parentIndices[index] !== paintIndex) continue;
    const object = artboard.objects[index];
    if (object.typeKey !== RIVE_TRIM_PATH) continue;
    return {
      end: readRiveNumber(object, RIVE_TRIM_END, 0),
      offset: readRiveNumber(object, RIVE_TRIM_OFFSET, 0),
      sequential: readRiveNumber(object, RIVE_TRIM_MODE, 0) === RIVE_TRIM_SEQUENTIAL,
      start: readRiveNumber(object, RIVE_TRIM_START, 0),
    };
  }
  return null;
}

function collectRivePaints(artboard: Readonly<RiveArtboardGraph>, shapeIndex: number): RivePaint[] {
  const paints: RivePaint[] = [];
  for (let index = shapeIndex + 1; index < artboard.objects.length; index++) {
    if (artboard.parentIndices[index] !== shapeIndex) continue;
    const object = artboard.objects[index];
    if (!isRiveCoreTypeDerivedFrom(object.typeKey, RIVE_SHAPE_PAINT)) continue;
    paints.push(createRivePaint(object, artboard, index));
  }
  return paints;
}

function createRivePaint(
  source: Readonly<RiveCoreObject>,
  artboard: Readonly<RiveArtboardGraph>,
  index: number,
): RivePaint {
  const stroke = isRiveCoreTypeDerivedFrom(source.typeKey, RIVE_STROKE)
    ? {
        caps: toRiveCaps(readRiveNumber(source, RIVE_STROKE_CAP, 0)),
        joints: toRiveJoints(readRiveNumber(source, RIVE_STROKE_JOIN, 0)),
        thickness: readRiveNumber(source, RIVE_STROKE_THICKNESS, 1),
      }
    : null;
  const paint: RivePaint = {
    alpha: 1,
    color: 0,
    // Rive states a fill rule of 0 as non-zero and 1 as even-odd.
    fillRule: readRiveNumber(source, RIVE_FILL_RULE, 0) === 1 ? 'evenOdd' : 'nonZero',
    gradient: null,
    stroke,
    trim: stroke === null ? null : readRiveTrim(artboard, index),
    visible: readRiveFlag(source, RIVE_PAINT_IS_VISIBLE, true),
  };
  applyRivePaintMutator(paint, artboard, index);
  return paint;
}

// The colour or gradient lives in a child of the paint rather than on the paint itself.
function applyRivePaintMutator(paint: RivePaint, artboard: Readonly<RiveArtboardGraph>, paintIndex: number): void {
  for (let index = paintIndex + 1; index < artboard.objects.length; index++) {
    if (artboard.parentIndices[index] !== paintIndex) continue;
    const object = artboard.objects[index];
    if (isRiveCoreTypeDerivedFrom(object.typeKey, RIVE_SOLID_COLOR)) {
      const packed = readRiveNumber(object, RIVE_SOLID_COLOR_VALUE, RIVE_DEFAULT_SOLID_COLOR);
      paint.color = packed & 0xffffff;
      paint.alpha = ((packed >>> 24) & 0xff) / 255;
      return;
    }
    if (isRiveCoreTypeDerivedFrom(object.typeKey, RIVE_LINEAR_GRADIENT)) {
      paint.gradient = createRiveGradient(object, artboard, index);
      return;
    }
  }
}

function createRiveGradient(
  source: Readonly<RiveCoreObject>,
  artboard: Readonly<RiveArtboardGraph>,
  index: number,
): RiveGradientPaint {
  const opacity = readRiveNumber(source, RIVE_GRADIENT_OPACITY, 1);
  const gradient: RiveGradientPaint = {
    alphas: [],
    colors: [],
    endX: readRiveNumber(source, RIVE_GRADIENT_END_X, 0),
    endY: readRiveNumber(source, RIVE_GRADIENT_END_Y, 0),
    // A radial gradient extends the linear one, so it carries the same endpoint properties.
    radial: isRiveCoreTypeDerivedFrom(source.typeKey, RIVE_RADIAL_GRADIENT),
    ratios: [],
    startX: readRiveNumber(source, RIVE_GRADIENT_START_X, 0),
    startY: readRiveNumber(source, RIVE_GRADIENT_START_Y, 0),
  };
  for (let stop = index + 1; stop < artboard.objects.length; stop++) {
    if (artboard.parentIndices[stop] !== index) continue;
    const object = artboard.objects[stop];
    if (!isRiveCoreTypeDerivedFrom(object.typeKey, RIVE_GRADIENT_STOP)) continue;
    const packed = readRiveNumber(object, RIVE_GRADIENT_STOP_COLOR, RIVE_DEFAULT_STOP_COLOR);
    gradient.colors.push(packed & 0xffffff);
    gradient.alphas.push((((packed >>> 24) & 0xff) / 255) * opacity);
    // Flight states a gradient stop's position as a 0-255 ratio; Rive states it as a fraction.
    gradient.ratios.push(Math.round(clampRiveUnit(readRiveNumber(object, RIVE_GRADIENT_STOP_POSITION, 0)) * 255));
  }
  return gradient;
}

function createRiveGradientMatrix(gradient: Readonly<RiveGradientPaint>) {
  const dx = gradient.endX - gradient.startX;
  const dy = gradient.endY - gradient.startY;
  const span = Math.hypot(dx, dy) * 2;
  return createGradientTransformMatrix(span, span, Math.atan2(dy, dx), gradient.startX, gradient.startY);
}

function toRiveCaps(value: number): CapsStyle {
  if (value === 1) return 'round';
  if (value === 2) return 'square';
  return 'none';
}

function toRiveJoints(value: number): JointStyle {
  if (value === 1) return 'round';
  if (value === 2) return 'bevel';
  return 'miter';
}

function clampRiveUnit(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function readRiveNumber(source: Readonly<RiveCoreObject>, key: number, fallback: number): number {
  const property = source.properties.find((candidate) => candidate.key === key);
  return property === undefined || typeof property.value !== 'number' ? fallback : property.value;
}

function readRiveFlag(source: Readonly<RiveCoreObject>, key: number, fallback: boolean): boolean {
  const property = source.properties.find((candidate) => candidate.key === key);
  return property === undefined || typeof property.value !== 'number' ? fallback : property.value !== 0;
}

const RIVE_RADIAL_GRADIENT = 17;
const RIVE_SOLID_COLOR = 18;
const RIVE_GRADIENT_STOP = 19;
const RIVE_SHAPE_PAINT = 21;
const RIVE_LINEAR_GRADIENT = 22;
const RIVE_STROKE = 24;
const RIVE_TRIM_PATH = 47;

const RIVE_GRADIENT_STOP_COLOR = 38;
const RIVE_GRADIENT_STOP_POSITION = 39;
const RIVE_FILL_RULE = 40;
const RIVE_PAINT_IS_VISIBLE = 41;
const RIVE_SOLID_COLOR_VALUE = 37;
const RIVE_GRADIENT_START_Y = 33;
const RIVE_GRADIENT_END_X = 34;
const RIVE_GRADIENT_END_Y = 35;
const RIVE_GRADIENT_START_X = 42;
const RIVE_GRADIENT_OPACITY = 46;
const RIVE_STROKE_THICKNESS = 47;
const RIVE_STROKE_CAP = 48;
const RIVE_STROKE_JOIN = 49;
const RIVE_TRIM_START = 114;
const RIVE_TRIM_END = 115;
const RIVE_TRIM_OFFSET = 116;
const RIVE_TRIM_MODE = 117;
const RIVE_TRIM_SEQUENTIAL = 1;

// Rive's own stated defaults, which a file relies on by omitting the property.
const RIVE_DEFAULT_SOLID_COLOR = 0xff747474;
const RIVE_DEFAULT_STOP_COLOR = 0xffffffff;
