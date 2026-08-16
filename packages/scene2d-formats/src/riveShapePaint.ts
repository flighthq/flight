import { createGradientTransformMatrix } from '@flighthq/geometry/contract';
import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { createPath, dashPath, flattenPath, getPathLength } from '@flighthq/path/contract';
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
  ImportDiagnostic,
  JointStyle,
  Path,
  PathWinding,
  RiveArtboardGraph,
  RiveCoreObject,
  RivePathRecord,
  Shape,
} from '@flighthq/types/contract';
import { ImportDiagnosticSeverity, PathCommand } from '@flighthq/types/contract';

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
  diagnostics?: ImportDiagnostic[] | undefined,
): void {
  if (paths.length === 0) return;
  const paints = collectRivePaints(artboard, shapeIndex, diagnostics);
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
    let paintedPaths = [...paths];
    for (const effect of paint.effects) {
      paintedPaths =
        effect.kind === 'trim' ? trimRivePaths(paintedPaths, effect.trim) : dashRivePaths(paintedPaths, effect.dash);
    }
    appendRivePaths(shape, paintedPaths, null);
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
  appendShapeLineStyle(shape, stroke.thickness, 0x000000ff, 1, false, 'normal', stroke.caps, stroke.joints);
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

interface RiveDashLength {
  percentage: boolean;
  value: number;
}

interface RiveDash {
  lengths: RiveDashLength[];
  offset: RiveDashLength;
}

type RiveStrokeEffect = { dash: RiveDash; kind: 'dash' } | { kind: 'trim'; trim: RiveTrim };

interface RivePaint {
  alpha: number;
  color: number;
  effects: RiveStrokeEffect[];
  fillRule: PathWinding;
  gradient: RiveGradientPaint | null;
  stroke: { caps: CapsStyle; joints: JointStyle; thickness: number } | null;
  visible: boolean;
}

/**
 * Applies Rive's dash effect independently to every source path.
 *
 * This intentionally does not delegate offset handling to `dashPath`: Flight follows the SVG phase
 * convention, while Rive starts the alternating pattern at its offset and wraps path coordinates at
 * the contour end. The distinction is visible when the final dash crosses that boundary.
 */
function dashRivePaths(paths: readonly RivePathRecord[], dash: Readonly<RiveDash>): RivePathRecord[] {
  const results: RivePathRecord[] = [];
  for (const record of paths) {
    const commands: PathCommand[] = [];
    const data: number[] = [];
    for (const contour of flattenPath(toRivePath(record))) appendRiveDashContour(contour, dash, commands, data);
    if (commands.length === 0) continue;
    results.push({ commands, data, pathIndex: record.pathIndex, winding: record.winding });
  }
  return results;
}

function appendRiveDashContour(
  contour: readonly number[],
  dash: Readonly<RiveDash>,
  commands: PathCommand[],
  data: number[],
): void {
  const length = getRivePolylineLength(contour);
  if (length <= 0 || dash.lengths.length === 0) return;
  const pattern = dash.lengths.map((entry) => Math.min(length, Math.max(0, toRiveDashLength(entry, length))));
  if (!pattern.some((value) => value > 0)) return;

  let distance = wrapRiveDashOffset(toRiveDashLength(dash.offset, length), length);
  let travelled = 0;
  let index = 0;
  let draw = true;
  let zeroRun = 0;
  const closed =
    contour.length >= 4 && contour[0] === contour[contour.length - 2] && contour[1] === contour[contour.length - 1];
  while (travelled < length) {
    const amount = pattern[index++ % pattern.length];
    if (amount <= 0) {
      // Zero entries still flip on/off in Rive. A full zero cycle cannot advance, but the all-zero
      // case returned above, so this also bounds malformed mixtures without changing valid output.
      zeroRun++;
      draw = !draw;
      if (zeroRun >= pattern.length) return;
      continue;
    }
    zeroRun = 0;
    const end = distance + amount;
    if (draw) {
      if (end <= length) appendRiveDashInterval(contour, distance, end, true, commands, data);
      else {
        appendRiveDashInterval(contour, distance, length, true, commands, data);
        appendRiveDashInterval(contour, 0, end - length, !closed, commands, data);
      }
    }
    distance = end >= length ? end - length : end;
    travelled += amount;
    draw = !draw;
  }
}

function appendRiveDashInterval(
  contour: readonly number[],
  from: number,
  to: number,
  move: boolean,
  commands: PathCommand[],
  data: number[],
): void {
  if (to <= from) return;
  let travelled = 0;
  let started = false;
  for (let index = 2; index < contour.length; index += 2) {
    const x0 = contour[index - 2];
    const y0 = contour[index - 1];
    const x1 = contour[index];
    const y1 = contour[index + 1];
    const segment = Math.hypot(x1 - x0, y1 - y0);
    const segmentEnd = travelled + segment;
    if (segment > 0 && to > travelled && from < segmentEnd) {
      const localFrom = Math.max(from, travelled);
      const localTo = Math.min(to, segmentEnd);
      const startRatio = (localFrom - travelled) / segment;
      const endRatio = (localTo - travelled) / segment;
      const startX = x0 + (x1 - x0) * startRatio;
      const startY = y0 + (y1 - y0) * startRatio;
      if (!started) {
        if (move) commands.push(PathCommand.MOVE_TO);
        else if (data.length < 2 || data[data.length - 2] !== startX || data[data.length - 1] !== startY) {
          commands.push(PathCommand.LINE_TO);
        }
        if (move || data.length < 2) data.push(startX, startY);
        else if (data[data.length - 2] !== startX || data[data.length - 1] !== startY) data.push(startX, startY);
        started = true;
      }
      commands.push(PathCommand.LINE_TO);
      data.push(x0 + (x1 - x0) * endRatio, y0 + (y1 - y0) * endRatio);
    }
    travelled = segmentEnd;
    if (travelled >= to) break;
  }
}

function getRivePolylineLength(contour: readonly number[]): number {
  let length = 0;
  for (let index = 2; index < contour.length; index += 2) {
    length += Math.hypot(contour[index] - contour[index - 2], contour[index + 1] - contour[index - 1]);
  }
  return length;
}

function toRiveDashLength(length: Readonly<RiveDashLength>, contourLength: number): number {
  return length.percentage ? length.value * contourLength : length.value;
}

function wrapRiveDashOffset(offset: number, contourLength: number): number {
  return ((offset % contourLength) + contourLength) % contourLength;
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
    results.push({
      commands: trimmed.commands.slice(),
      data: trimmed.data.slice(),
      pathIndex: record.pathIndex,
      winding: trimmed.winding,
    });
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

// Trim and dash effects belong to a stroke and apply in the order its component children state.
function readRiveStrokeEffects(artboard: Readonly<RiveArtboardGraph>, paintIndex: number): RiveStrokeEffect[] {
  const effects: RiveStrokeEffect[] = [];
  for (let index = paintIndex + 1; index < artboard.objects.length; index++) {
    if (artboard.parentIndices[index] !== paintIndex) continue;
    const object = artboard.objects[index];
    if (object.typeKey === RIVE_TRIM_PATH) {
      effects.push({
        kind: 'trim',
        trim: {
          end: readRiveNumber(object, RIVE_TRIM_END, 0),
          offset: readRiveNumber(object, RIVE_TRIM_OFFSET, 0),
          sequential: readRiveNumber(object, RIVE_TRIM_MODE, 0) === RIVE_TRIM_SEQUENTIAL,
          start: readRiveNumber(object, RIVE_TRIM_START, 0),
        },
      });
      continue;
    }
    if (object.typeKey !== RIVE_DASH_PATH) continue;
    const lengths: RiveDashLength[] = [];
    for (let child = index + 1; child < artboard.objects.length; child++) {
      if (artboard.parentIndices[child] !== index) continue;
      const dash = artboard.objects[child];
      if (dash.typeKey !== RIVE_DASH) continue;
      lengths.push({
        percentage: readRiveFlag(dash, RIVE_DASH_LENGTH_IS_PERCENTAGE, false),
        value: readRiveNumber(dash, RIVE_DASH_LENGTH, 0),
      });
    }
    effects.push({
      dash: {
        lengths,
        offset: {
          percentage: readRiveFlag(object, RIVE_DASH_OFFSET_IS_PERCENTAGE, false),
          value: readRiveNumber(object, RIVE_DASH_OFFSET, 0),
        },
      },
      kind: 'dash',
    });
  }
  return effects;
}

function collectRivePaints(
  artboard: Readonly<RiveArtboardGraph>,
  shapeIndex: number,
  diagnostics: ImportDiagnostic[] | undefined,
): RivePaint[] {
  const paints: RivePaint[] = [];
  for (let index = shapeIndex + 1; index < artboard.objects.length; index++) {
    if (artboard.parentIndices[index] !== shapeIndex) continue;
    const object = artboard.objects[index];
    if (!isRiveCoreTypeDerivedFrom(object.typeKey, RIVE_SHAPE_PAINT)) continue;
    paints.push(createRivePaint(object, artboard, index, diagnostics));
  }
  return paints;
}

function createRivePaint(
  source: Readonly<RiveCoreObject>,
  artboard: Readonly<RiveArtboardGraph>,
  index: number,
  diagnostics: ImportDiagnostic[] | undefined,
): RivePaint {
  const stroke = isRiveCoreTypeDerivedFrom(source.typeKey, RIVE_STROKE)
    ? {
        caps: toRiveCaps(readRiveNumber(source, RIVE_STROKE_CAP, 0), diagnostics),
        joints: toRiveJoints(readRiveNumber(source, RIVE_STROKE_JOIN, 0), diagnostics),
        thickness: readRiveNumber(source, RIVE_STROKE_THICKNESS, 1),
      }
    : null;
  const paint: RivePaint = {
    alpha: 1,
    color: 0,
    effects: stroke === null ? [] : readRiveStrokeEffects(artboard, index),
    // Rive states a fill rule of 0 as non-zero and 1 as even-odd.
    fillRule: readRiveNumber(source, RIVE_FILL_RULE, 0) === 1 ? 'evenOdd' : 'nonZero',
    gradient: null,
    stroke,
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
      paint.color = (((packed & 0xffffff) << 8) | 0xff) >>> 0;
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
    gradient.colors.push((((packed & 0xffffff) << 8) | 0xff) >>> 0);
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

// Rive's butt cap and Flight's 'none' are the same cap, so a stated 0 is a mapping rather than a
// fallback — and an absent property reads as 0, which is Rive's own default. Only a value outside the
// stated three reaches the terminal arm, and that is a substitution: the stroke still draws, at full
// length, with a cap it was not authored with. No count and no existence check can see it.
function toRiveCaps(value: number, diagnostics: ImportDiagnostic[] | undefined): CapsStyle {
  if (value === RIVE_CAP_ROUND) return 'round';
  if (value === RIVE_CAP_SQUARE) return 'square';
  if (value !== RIVE_CAP_BUTT) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Recover, 'rive.stroke-cap-substituted', 'toRiveCaps', {
      capValue: value,
      substitutedAs: 'none',
    });
  }
  return 'none';
}

function toRiveJoints(value: number, diagnostics: ImportDiagnostic[] | undefined): JointStyle {
  if (value === RIVE_JOIN_ROUND) return 'round';
  if (value === RIVE_JOIN_BEVEL) return 'bevel';
  if (value !== RIVE_JOIN_MITER) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Recover,
      'rive.stroke-join-substituted',
      'toRiveJoints',
      { joinValue: value, substitutedAs: 'miter' },
    );
  }
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
const RIVE_DASH_PATH = 506;
const RIVE_DASH = 507;

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
const RIVE_CAP_BUTT = 0;
const RIVE_CAP_ROUND = 1;
const RIVE_CAP_SQUARE = 2;
const RIVE_JOIN_MITER = 0;
const RIVE_JOIN_ROUND = 1;
const RIVE_JOIN_BEVEL = 2;
const RIVE_DASH_OFFSET = 690;
const RIVE_DASH_OFFSET_IS_PERCENTAGE = 691;
const RIVE_DASH_LENGTH = 692;
const RIVE_DASH_LENGTH_IS_PERCENTAGE = 693;

// Rive's own stated defaults, which a file relies on by omitting the property.
const RIVE_DEFAULT_SOLID_COLOR = 0xff747474;
const RIVE_DEFAULT_STOP_COLOR = 0xffffffff;
