import { createMatrix } from '@flighthq/geometry/contract';
import {
  appendShapeBeginFill,
  appendShapeBeginGradientFill,
  appendShapeCurveTo,
  appendShapeEndFill,
  appendShapeLineStyle,
  appendShapeLineTo,
  appendShapeMoveTo,
  createShape,
} from '@flighthq/shape/contract';
import type { CapsStyle, GradientType, JointStyle, Matrix, Shape, SpreadMethod } from '@flighthq/types/contract';

import type { SwfReader } from './swfReader';

// Decodes a SHAPEWITHSTYLE body into a Shape whose command stream draws it, or null when the body does
// not parse. `version` is the DefineShape generation (1 through 4), which selects RGB versus RGBA colors,
// the extended style-count encoding, and the LINESTYLE2 and focal-gradient records that only Shape 4
// carries. The reader must be positioned immediately after the definition's bounds.
//
// SWF does not record contours. It records edges, each naming the fill on its left (`fill1`) and right
// (`fill0`) and the stroke it belongs to, in whatever order the authoring tool emitted them. A fill is
// therefore recovered rather than read: edges are collected per style, reversed for the right-hand side so
// every edge of a fill runs the same way around it, and then stitched end-to-start into closed contours.
// Reversal is what makes the nonzero winding of the resulting command stream match the fill SWF meant,
// holes included.
export function createSwfShape(reader: SwfReader, version: number): Shape | null {
  const hasAlpha = version >= 3;
  const styles = readSwfShapeStyles(reader, version, hasAlpha);
  if (styles === null) return null;

  const shape = createShape();
  const state: SwfShapeState = {
    fill0: 0,
    fill0Segment: null,
    fill1: 0,
    fill1Segment: null,
    fillSegments: new Map<number, SwfShapeSegment[]>(),
    line: 0,
    lineSegment: null,
    lineSegments: new Map<number, SwfShapeSegment[]>(),
    styles,
    x: 0,
    y: 0,
  };

  let fillBits = reader.readUnsignedBits(4);
  let lineBits = reader.readUnsignedBits(4);
  if (!reader.valid) return null;

  let records = 0;
  for (;;) {
    if (++records > MAX_SHAPE_RECORDS) return null;
    if (reader.readUnsignedBits(1) !== 0) {
      if (!readSwfShapeEdge(reader, state)) return null;
      continue;
    }

    const flags = reader.readUnsignedBits(5);
    if (!reader.valid) return null;
    if (flags === 0) break;

    flushSwfShapeSegments(state);
    if ((flags & STATE_MOVE_TO) !== 0) {
      const moveBits = reader.readUnsignedBits(5);
      state.x = reader.readSignedBits(moveBits);
      state.y = reader.readSignedBits(moveBits);
    }
    if ((flags & STATE_FILL_STYLE_0) !== 0) state.fill0 = reader.readUnsignedBits(fillBits);
    if ((flags & STATE_FILL_STYLE_1) !== 0) state.fill1 = reader.readUnsignedBits(fillBits);
    if ((flags & STATE_LINE_STYLE) !== 0) state.line = reader.readUnsignedBits(lineBits);
    if (!reader.valid) return null;

    if ((flags & STATE_NEW_STYLES) !== 0) {
      // New styles restart the index space, so everything collected against the old arrays has to be
      // drawn before they are replaced.
      appendSwfShapeStyleLayer(shape, state);
      const replacement = readSwfShapeStyles(reader, version, hasAlpha);
      if (replacement === null) return null;
      state.styles = replacement;
      state.fill0 = 0;
      state.fill1 = 0;
      state.line = 0;
      fillBits = reader.readUnsignedBits(4);
      lineBits = reader.readUnsignedBits(4);
      if (!reader.valid) return null;
    }
  }

  flushSwfShapeSegments(state);
  appendSwfShapeStyleLayer(shape, state);
  return reader.valid ? shape : null;
}

interface SwfShapeEdge {
  controlX: number;
  controlY: number;
  curved: boolean;
  toX: number;
  toY: number;
}

// An unbroken run of edges collected against one style. A shape's fill is assembled from these, not read
// from the file, so a segment is an intermediate: it is only a contour once stitching has joined it to
// every other segment that continues it.
interface SwfShapeSegment {
  edges: SwfShapeEdge[];
  startX: number;
  startY: number;
}

interface SwfShapeFill {
  alphas: number[];
  color: number;
  colors: number[];
  focalPoint: number;
  gradientType: GradientType | null;
  matrix: Matrix | null;
  opacity: number;
  ratios: number[];
  // A bitmap fill names a character this decoder cannot resolve to pixels, so the style is retained as
  // unpaintable rather than guessed at: its edges still shape the geometry, but nothing is filled.
  paintable: boolean;
  spreadMethod: SpreadMethod;
}

interface SwfShapeLine {
  alpha: number;
  caps: CapsStyle;
  color: number;
  joints: JointStyle;
  miterLimit: number;
  pixelHinting: boolean;
  width: number;
}

interface SwfShapeStyles {
  fills: SwfShapeFill[];
  lines: SwfShapeLine[];
}

interface SwfShapeState {
  fill0: number;
  fill0Segment: SwfShapeSegment | null;
  fill1: number;
  fill1Segment: SwfShapeSegment | null;
  fillSegments: Map<number, SwfShapeSegment[]>;
  line: number;
  lineSegment: SwfShapeSegment | null;
  lineSegments: Map<number, SwfShapeSegment[]>;
  styles: SwfShapeStyles;
  x: number;
  y: number;
}

function appendSwfShapeContours(shape: Shape, segments: readonly Readonly<SwfShapeSegment>[]): void {
  for (const contour of stitchSwfShapeSegments(segments)) {
    appendShapeMoveTo(shape, contour.startX / TWIPS_PER_PIXEL, contour.startY / TWIPS_PER_PIXEL);
    for (const edge of contour.edges) {
      if (edge.curved) {
        appendShapeCurveTo(
          shape,
          edge.controlX / TWIPS_PER_PIXEL,
          edge.controlY / TWIPS_PER_PIXEL,
          edge.toX / TWIPS_PER_PIXEL,
          edge.toY / TWIPS_PER_PIXEL,
        );
      } else {
        appendShapeLineTo(shape, edge.toX / TWIPS_PER_PIXEL, edge.toY / TWIPS_PER_PIXEL);
      }
    }
  }
}

// Draws everything collected against the current style arrays, then clears the accumulators. Fills are
// emitted before strokes so a shape's outlines sit above its own fills, which is the order SWF composites
// a shape's own styles in.
function appendSwfShapeStyleLayer(shape: Shape, state: SwfShapeState): void {
  for (const index of [...state.fillSegments.keys()].sort(compareSwfShapeStyleIndex)) {
    const fill = state.styles.fills[index - 1];
    const segments = state.fillSegments.get(index);
    if (fill === undefined || segments === undefined || !fill.paintable) continue;
    if (fill.gradientType === null) {
      appendShapeBeginFill(shape, fill.color, fill.opacity);
    } else {
      appendShapeBeginGradientFill(
        shape,
        fill.gradientType,
        fill.colors,
        fill.alphas,
        fill.ratios,
        fill.matrix,
        fill.spreadMethod,
        'rgb',
        fill.focalPoint,
      );
    }
    appendSwfShapeContours(shape, segments);
    appendShapeEndFill(shape);
  }

  for (const index of [...state.lineSegments.keys()].sort(compareSwfShapeStyleIndex)) {
    const line = state.styles.lines[index - 1];
    const segments = state.lineSegments.get(index);
    if (line === undefined || segments === undefined) continue;
    appendShapeLineStyle(
      shape,
      line.width / TWIPS_PER_PIXEL,
      line.color,
      line.alpha,
      line.pixelHinting,
      'normal',
      line.caps,
      line.joints,
      line.miterLimit,
    );
    appendSwfShapeContours(shape, segments);
  }

  state.fillSegments.clear();
  state.lineSegments.clear();
}

function compareSwfShapeStyleIndex(a: number, b: number): number {
  return a - b;
}

function createSwfShapeSegment(x: number, y: number): SwfShapeSegment {
  return { edges: [], startX: x, startY: y };
}

// Closes the runs open against the current styles. A fill named by `fill0` lies on the right of its edges,
// so its run is reversed here: after reversal every fill's edges run the same way around it and stitching
// can treat both sides identically.
function flushSwfShapeSegments(state: SwfShapeState): void {
  pushSwfShapeSegment(state.fillSegments, state.fill1, state.fill1Segment);
  pushSwfShapeSegment(state.fillSegments, state.fill0, reverseSwfShapeSegment(state.fill0Segment));
  pushSwfShapeSegment(state.lineSegments, state.line, state.lineSegment);
  state.fill0Segment = null;
  state.fill1Segment = null;
  state.lineSegment = null;
}

function pushSwfShapeSegment(
  target: Map<number, SwfShapeSegment[]>,
  index: number,
  segment: SwfShapeSegment | null,
): void {
  if (index === 0 || segment === null || segment.edges.length === 0) return;
  const existing = target.get(index);
  if (existing === undefined) target.set(index, [segment]);
  else existing.push(segment);
}

function readSwfShapeColor(reader: SwfReader, hasAlpha: boolean): { color: number; opacity: number } {
  const red = reader.readUint8();
  const green = reader.readUint8();
  const blue = reader.readUint8();
  const alpha = hasAlpha ? reader.readUint8() : 0xff;
  return { color: red * 0x10000 + green * 0x100 + blue, opacity: alpha / 0xff };
}

function readSwfShapeEdge(reader: SwfReader, state: SwfShapeState): boolean {
  // Where the pen stands before this edge is where a run that starts with it begins.
  const fromX = state.x;
  const fromY = state.y;
  const straight = reader.readUnsignedBits(1) !== 0;
  const bits = reader.readUnsignedBits(4) + 2;
  let controlX = 0;
  let controlY = 0;
  let curved = false;

  if (straight) {
    // A straight edge spends no bits on the axis it does not move along: GeneralLineFlag says both
    // deltas follow, and when it is clear VertLineFlag picks which single delta does.
    const isGeneralLine = reader.readUnsignedBits(1) !== 0;
    if (isGeneralLine) {
      state.x += reader.readSignedBits(bits);
      state.y += reader.readSignedBits(bits);
    } else {
      const isVerticalLine = reader.readUnsignedBits(1) !== 0;
      if (isVerticalLine) state.y += reader.readSignedBits(bits);
      else state.x += reader.readSignedBits(bits);
    }
  } else {
    curved = true;
    controlX = fromX + reader.readSignedBits(bits);
    controlY = fromY + reader.readSignedBits(bits);
    state.x = controlX + reader.readSignedBits(bits);
    state.y = controlY + reader.readSignedBits(bits);
  }
  if (!reader.valid) return false;

  const edge: SwfShapeEdge = { controlX, controlY, curved, toX: state.x, toY: state.y };
  if (state.fill1 !== 0) {
    state.fill1Segment ??= createSwfShapeSegment(fromX, fromY);
    state.fill1Segment.edges.push(edge);
  }
  if (state.fill0 !== 0) {
    state.fill0Segment ??= createSwfShapeSegment(fromX, fromY);
    state.fill0Segment.edges.push(edge);
  }
  if (state.line !== 0) {
    state.lineSegment ??= createSwfShapeSegment(fromX, fromY);
    state.lineSegment.edges.push(edge);
  }
  return true;
}

function readSwfShapeFillStyle(reader: SwfReader, version: number, hasAlpha: boolean): SwfShapeFill | null {
  const type = reader.readUint8();
  if (type === FILL_SOLID) {
    const solid = readSwfShapeColor(reader, hasAlpha);
    return createSwfShapeFill(solid.color, solid.opacity);
  }

  if (type === FILL_LINEAR_GRADIENT || type === FILL_RADIAL_GRADIENT || type === FILL_FOCAL_GRADIENT) {
    if (type === FILL_FOCAL_GRADIENT && version < 4) return null;
    const matrix = readSwfShapeMatrix(reader);
    const spread = reader.readUnsignedBits(2);
    reader.readUnsignedBits(2);
    const count = reader.readUnsignedBits(4);
    reader.alignToByte();
    if (!reader.valid || count === 0 || count > MAX_GRADIENT_RECORDS) return null;

    const colors: number[] = [];
    const alphas: number[] = [];
    const ratios: number[] = [];
    for (let i = 0; i < count; i++) {
      const ratio = reader.readUint8();
      const record = readSwfShapeColor(reader, hasAlpha);
      ratios.push(ratio);
      colors.push(record.color);
      alphas.push(record.opacity);
    }
    const focalPoint = type === FILL_FOCAL_GRADIENT ? reader.readFixed8() : 0;
    if (!reader.valid) return null;

    return {
      alphas,
      color: 0,
      colors,
      focalPoint,
      gradientType: type === FILL_LINEAR_GRADIENT ? 'linear' : 'radial',
      matrix,
      opacity: 1,
      paintable: true,
      ratios,
      spreadMethod: resolveSwfShapeSpreadMethod(spread),
    };
  }

  if (
    type === FILL_REPEATING_BITMAP ||
    type === FILL_CLIPPED_BITMAP ||
    type === FILL_NON_SMOOTHED_REPEATING_BITMAP ||
    type === FILL_NON_SMOOTHED_CLIPPED_BITMAP
  ) {
    reader.readUint16();
    readSwfShapeMatrix(reader);
    if (!reader.valid) return null;
    const unpaintable = createSwfShapeFill(0, 1);
    unpaintable.paintable = false;
    return unpaintable;
  }
  return null;
}

function createSwfShapeFill(color: number, opacity: number): SwfShapeFill {
  return {
    alphas: [],
    color,
    colors: [],
    focalPoint: 0,
    gradientType: null,
    matrix: null,
    opacity,
    paintable: true,
    ratios: [],
    spreadMethod: 'pad',
  };
}

function readSwfShapeLineStyle(reader: SwfReader, version: number, hasAlpha: boolean): SwfShapeLine | null {
  const width = reader.readUint16();
  if (version < 4) {
    const color = readSwfShapeColor(reader, hasAlpha);
    if (!reader.valid) return null;
    return {
      alpha: color.opacity,
      caps: 'round',
      color: color.color,
      joints: 'round',
      miterLimit: 3,
      pixelHinting: false,
      width,
    };
  }

  const startCap = reader.readUnsignedBits(2);
  const join = reader.readUnsignedBits(2);
  const hasFill = reader.readUnsignedBits(1) !== 0;
  reader.readUnsignedBits(1);
  reader.readUnsignedBits(1);
  const pixelHinting = reader.readUnsignedBits(1) !== 0;
  reader.readUnsignedBits(5);
  reader.readUnsignedBits(1);
  reader.readUnsignedBits(2);
  const miterLimit = join === JOIN_MITER ? reader.readFixed8() : 3;
  if (!reader.valid) return null;

  // A fill-backed stroke carries a whole FILLSTYLE where its color would be. The style is consumed so the
  // record stays aligned, and the stroke falls back to opaque black rather than being dropped.
  if (hasFill) {
    const fill = readSwfShapeFillStyle(reader, version, hasAlpha);
    if (fill === null) return null;
    return {
      alpha: fill.opacity,
      caps: resolveSwfShapeCapsStyle(startCap),
      color: fill.color,
      joints: resolveSwfShapeJointStyle(join),
      miterLimit,
      pixelHinting,
      width,
    };
  }

  const color = readSwfShapeColor(reader, hasAlpha);
  if (!reader.valid) return null;
  return {
    alpha: color.opacity,
    caps: resolveSwfShapeCapsStyle(startCap),
    color: color.color,
    joints: resolveSwfShapeJointStyle(join),
    miterLimit,
    pixelHinting,
    width,
  };
}

// A gradient MATRIX maps SWF's gradient square, which spans 32768 twips, onto the shape. Flight's gradient
// box uses the same square in pixels, so only the translation converts.
function readSwfShapeMatrix(reader: SwfReader): Matrix {
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

function readSwfShapeStyleCount(reader: SwfReader, version: number): number {
  const count = reader.readUint8();
  return count === EXTENDED_STYLE_COUNT && version >= 2 ? reader.readUint16() : count;
}

function readSwfShapeStyles(reader: SwfReader, version: number, hasAlpha: boolean): SwfShapeStyles | null {
  const fillCount = readSwfShapeStyleCount(reader, version);
  if (!reader.valid || fillCount > MAX_SHAPE_STYLES) return null;
  const fills: SwfShapeFill[] = [];
  for (let i = 0; i < fillCount; i++) {
    const fill = readSwfShapeFillStyle(reader, version, hasAlpha);
    if (fill === null) return null;
    fills.push(fill);
  }

  const lineCount = readSwfShapeStyleCount(reader, version);
  if (!reader.valid || lineCount > MAX_SHAPE_STYLES) return null;
  const lines: SwfShapeLine[] = [];
  for (let i = 0; i < lineCount; i++) {
    const line = readSwfShapeLineStyle(reader, version, hasAlpha);
    if (line === null) return null;
    lines.push(line);
  }
  return reader.valid ? { fills, lines } : null;
}

function resolveSwfShapeCapsStyle(value: number): CapsStyle {
  if (value === CAP_NONE) return 'none';
  return value === CAP_SQUARE ? 'square' : 'round';
}

function resolveSwfShapeJointStyle(value: number): JointStyle {
  if (value === JOIN_BEVEL) return 'bevel';
  return value === JOIN_MITER ? 'miter' : 'round';
}

function resolveSwfShapeSpreadMethod(value: number): SpreadMethod {
  if (value === SPREAD_REFLECT) return 'reflect';
  return value === SPREAD_REPEAT ? 'repeat' : 'pad';
}

function reverseSwfShapeSegment(segment: SwfShapeSegment | null): SwfShapeSegment | null {
  if (segment === null || segment.edges.length === 0) return null;
  const last = segment.edges[segment.edges.length - 1];
  const reversed = createSwfShapeSegment(last.toX, last.toY);
  for (let i = segment.edges.length - 1; i >= 0; i--) {
    const edge = segment.edges[i];
    const previous = i === 0 ? segment : segment.edges[i - 1];
    reversed.edges.push({
      controlX: edge.controlX,
      controlY: edge.controlY,
      curved: edge.curved,
      toX: i === 0 ? segment.startX : (previous as SwfShapeEdge).toX,
      toY: i === 0 ? segment.startY : (previous as SwfShapeEdge).toY,
    });
  }
  return reversed;
}

// Joins segments end-to-start into the closed contours SWF never wrote down. Coordinates are whole twips,
// so endpoints match exactly and no tolerance is needed. A run that never closes is still emitted: an
// unclosed contour draws what the file described rather than being discarded.
function stitchSwfShapeSegments(segments: readonly Readonly<SwfShapeSegment>[]): SwfShapeSegment[] {
  const starts = new Map<string, number[]>();
  for (let i = 0; i < segments.length; i++) {
    const key = createSwfShapePointKey(segments[i].startX, segments[i].startY);
    const existing = starts.get(key);
    if (existing === undefined) starts.set(key, [i]);
    else existing.push(i);
  }

  const used = new Array<boolean>(segments.length).fill(false);
  const contours: SwfShapeSegment[] = [];
  for (let i = 0; i < segments.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const contour = createSwfShapeSegment(segments[i].startX, segments[i].startY);
    contour.edges.push(...segments[i].edges);

    for (;;) {
      const tail = contour.edges[contour.edges.length - 1];
      if (tail.toX === contour.startX && tail.toY === contour.startY) break;
      const candidates = starts.get(createSwfShapePointKey(tail.toX, tail.toY));
      if (candidates === undefined) break;
      const next = candidates.find((index) => !used[index]);
      if (next === undefined) break;
      used[next] = true;
      contour.edges.push(...segments[next].edges);
    }
    contours.push(contour);
  }
  return contours;
}

function createSwfShapePointKey(x: number, y: number): string {
  return `${x},${y}`;
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
const FIXED_16_ONE = 0x10000;
const JOIN_BEVEL = 1;
const JOIN_MITER = 2;
const MAX_GRADIENT_RECORDS = 15;
const MAX_SHAPE_RECORDS = 200_000;
const MAX_SHAPE_STYLES = 0xffff;
const SPREAD_REFLECT = 1;
const SPREAD_REPEAT = 2;
const STATE_FILL_STYLE_0 = 0x02;
const STATE_FILL_STYLE_1 = 0x04;
const STATE_LINE_STYLE = 0x08;
const STATE_MOVE_TO = 0x01;
const STATE_NEW_STYLES = 0x10;
const TWIPS_PER_PIXEL = 20;
