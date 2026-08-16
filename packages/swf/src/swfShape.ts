import { createMatrix, inverseMatrix } from '@flighthq/geometry/contract';
import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { appendPathCurveTo, appendPathLineTo, appendPathMoveTo, createPath } from '@flighthq/path/contract';
import {
  appendShapeBeginFill,
  appendShapeBeginGradientFill,
  appendShapeBeginTextureFill,
  appendShapeCurveTo,
  appendShapeEndFill,
  appendShapeLineStyle,
  appendShapeLineTo,
  appendShapeMoveTo,
  createShape,
} from '@flighthq/shape/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';
import type {
  CapsStyle,
  GradientType,
  JointStyle,
  Matrix,
  Path,
  Shape,
  SpreadMethod,
  Texture2D,
} from '@flighthq/types/contract';
import type { ImportDiagnostic, SwfMorphShapePaths } from '@flighthq/types/contract';

import type { SwfReader } from './swfReader';

// Decodes a glyph outline. A glyph is a bare SHAPE rather than a SHAPEWITHSTYLE — a font's glyphs carry
// no styles of their own, because the colour belongs to whatever text record draws the glyph. So the
// decoder is handed a single implicit fill (the one every glyph edge references) and the emitted geometry
// is recoloured at composition time. Coordinates stay in the font's EM grid, scaled by each use.
export function createSwfGlyphShape(reader: SwfReader): Shape | null {
  return decodeSwfShapeBody(reader, 1, { fills: [createSwfShapeFill(0x000000ff, 1)], lines: [] });
}

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
//
// `resolveBitmapFill` turns a bitmap fill's character id and the two sampling flags its type encodes into
// the Texture that fill paints with. The decoder never sees pixels: the texture it is handed may still be
// waiting on its image resource, which is what lets shape decoding stay synchronous while decoding does
// not. Resolution belongs to the caller rather than to an out-parameter this function allocates into,
// because only the caller can hand back the texture it already made for that character and sampling.
export function createSwfShape(
  reader: SwfReader,
  version: number,
  resolveBitmapFill: SwfBitmapFillResolver | null = null,
  diagnostics?: ImportDiagnostic[],
): Shape | null {
  const styles = readSwfShapeStyles(reader, version, version >= 3, resolveBitmapFill, diagnostics);
  return styles === null ? null : decodeSwfShapeBody(reader, version, styles, resolveBitmapFill);
}

function decodeSwfShapeBody(
  reader: SwfReader,
  version: number,
  styles: SwfShapeStyles,
  resolveBitmapFill: SwfBitmapFillResolver | null = null,
): Shape | null {
  const hasAlpha = version >= 3;
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
      const replacement = readSwfShapeStyles(reader, version, hasAlpha, resolveBitmapFill);
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

// Decodes a morph shape's two edge sets together, into one start and one end Path per style index.
//
// The two sets describe the same drawing twice and the format does not repeat the styles in the second:
// an end style-change record carries a move and nothing else. Nor are the two record streams guaranteed
// to line up one-for-one — a start set may change style where the end set does not — so this walks both
// with independent cursors rather than decoding each alone and matching afterwards. Whenever both are at
// an edge, the pair is appended as a single edge carrying both endpoints; from there stitching and fill0
// reversal move the pair as a unit, so the two Paths a style index yields have identical structure and
// need no correspondence pass to morph against each other.
//
// Coordinates convert from twips, so both paths come out in pixels.
export function readSwfMorphShapePaths(startReader: SwfReader, endReader: SwfReader): SwfMorphShapePaths | null {
  const startRecords = readSwfShapeRecordList(startReader);
  const endRecords = readSwfShapeRecordList(endReader);
  if (startRecords === null || endRecords === null) return null;

  const state: SwfShapeState = {
    fill0: 0,
    fill0Segment: null,
    fill1: 0,
    fill1Segment: null,
    fillSegments: new Map<number, SwfShapeSegment[]>(),
    line: 0,
    lineSegment: null,
    lineSegments: new Map<number, SwfShapeSegment[]>(),
    styles: { fills: [], lines: [] },
    x: 0,
    y: 0,
  };
  let endX = 0;
  let endY = 0;
  let startIndex = 0;
  let endIndex = 0;

  for (;;) {
    const startRecord = startRecords[startIndex];
    const endRecord = endRecords[endIndex];
    if (startRecord === undefined || endRecord === undefined) break;

    // A style change on either side closes the runs open against the current styles. Only the start set
    // names styles; the end set contributes its pen position and nothing else.
    if (startRecord.kind === 'style') {
      flushSwfShapeSegments(state);
      if (startRecord.moveTo !== null) {
        state.x = startRecord.moveTo.x;
        state.y = startRecord.moveTo.y;
      }
      if (startRecord.fill0 !== null) state.fill0 = startRecord.fill0;
      if (startRecord.fill1 !== null) state.fill1 = startRecord.fill1;
      if (startRecord.line !== null) state.line = startRecord.line;
      startIndex++;
      if (endRecord.kind === 'style') {
        if (endRecord.moveTo !== null) {
          endX = endRecord.moveTo.x;
          endY = endRecord.moveTo.y;
        }
        endIndex++;
      }
      continue;
    }

    if (endRecord.kind === 'style') {
      flushSwfShapeSegments(state);
      if (endRecord.moveTo !== null) {
        endX = endRecord.moveTo.x;
        endY = endRecord.moveTo.y;
      }
      endIndex++;
      continue;
    }

    appendSwfMorphEdge(state, startRecord, endRecord, endX, endY);
    endX = endRecord.toX;
    endY = endRecord.toY;
    startIndex++;
    endIndex++;
  }

  flushSwfShapeSegments(state);
  return {
    fills: createSwfMorphSegmentPaths(state.fillSegments),
    lines: createSwfMorphSegmentPaths(state.lineSegments),
  };
}

// Appends one paired edge to whichever runs are open, opening them at the pen where the edge begins.
function appendSwfMorphEdge(
  state: SwfShapeState,
  startEdge: Readonly<SwfShapeEdgeRecord>,
  endEdge: Readonly<SwfShapeEdgeRecord>,
  endFromX: number,
  endFromY: number,
): void {
  const fromX = state.x;
  const fromY = state.y;
  const edge: SwfShapeEdge = {
    controlX: startEdge.controlX,
    controlY: startEdge.controlY,
    curved: startEdge.curved || endEdge.curved,
    endControlX: endEdge.curved ? endEdge.controlX : (endFromX + endEdge.toX) / 2,
    endControlY: endEdge.curved ? endEdge.controlY : (endFromY + endEdge.toY) / 2,
    endToX: endEdge.toX,
    endToY: endEdge.toY,
    toX: startEdge.toX,
    toY: startEdge.toY,
  };
  // One side curving and the other not still has to pair, so the straight side contributes its midpoint
  // as a control point: the same line, expressed as the quadratic its partner needs to morph against.
  if (edge.curved && !startEdge.curved) {
    edge.controlX = (fromX + startEdge.toX) / 2;
    edge.controlY = (fromY + startEdge.toY) / 2;
  }

  if (state.fill0 !== 0) {
    state.fill0Segment ??= createSwfMorphSegment(fromX, fromY, endFromX, endFromY);
    state.fill0Segment.edges.push(edge);
  }
  if (state.fill1 !== 0) {
    state.fill1Segment ??= createSwfMorphSegment(fromX, fromY, endFromX, endFromY);
    state.fill1Segment.edges.push(edge);
  }
  if (state.line !== 0) {
    state.lineSegment ??= createSwfMorphSegment(fromX, fromY, endFromX, endFromY);
    state.lineSegment.edges.push(edge);
  }
  state.x = startEdge.toX;
  state.y = startEdge.toY;
}

function createSwfMorphSegment(x: number, y: number, endX: number, endY: number): SwfShapeSegment {
  return { edges: [], endStartX: endX, endStartY: endY, startX: x, startY: y };
}

function createSwfMorphSegmentPaths(
  segments: ReadonlyMap<number, SwfShapeSegment[]>,
): Map<number, { end: Path; start: Path }> {
  const paths = new Map<number, { end: Path; start: Path }>();
  for (const [index, collected] of segments) {
    const startPath = createPath('nonZero');
    const endPath = createPath('nonZero');
    for (const contour of stitchSwfShapeSegments(collected)) {
      appendPathMoveTo(startPath, contour.startX / TWIPS_PER_PIXEL, contour.startY / TWIPS_PER_PIXEL);
      appendPathMoveTo(endPath, (contour.endStartX ?? 0) / TWIPS_PER_PIXEL, (contour.endStartY ?? 0) / TWIPS_PER_PIXEL);
      for (const edge of contour.edges) {
        if (edge.curved) {
          appendPathCurveTo(
            startPath,
            edge.controlX / TWIPS_PER_PIXEL,
            edge.controlY / TWIPS_PER_PIXEL,
            edge.toX / TWIPS_PER_PIXEL,
            edge.toY / TWIPS_PER_PIXEL,
          );
          appendPathCurveTo(
            endPath,
            (edge.endControlX ?? 0) / TWIPS_PER_PIXEL,
            (edge.endControlY ?? 0) / TWIPS_PER_PIXEL,
            (edge.endToX ?? 0) / TWIPS_PER_PIXEL,
            (edge.endToY ?? 0) / TWIPS_PER_PIXEL,
          );
        } else {
          appendPathLineTo(startPath, edge.toX / TWIPS_PER_PIXEL, edge.toY / TWIPS_PER_PIXEL);
          appendPathLineTo(endPath, (edge.endToX ?? 0) / TWIPS_PER_PIXEL, (edge.endToY ?? 0) / TWIPS_PER_PIXEL);
        }
      }
    }
    if (startPath.commands.length > 0) paths.set(index, { end: endPath, start: startPath });
  }
  return paths;
}

// Reads one bare SHAPE into absolute-coordinate records. A morph endpoint never introduces styles, so a
// record carrying the new-styles bit rejects the whole set rather than being read past.
function readSwfShapeRecordList(reader: SwfReader): SwfShapeRecord[] | null {
  const fillBits = reader.readUnsignedBits(4);
  const lineBits = reader.readUnsignedBits(4);
  if (!reader.valid) return null;

  const records: SwfShapeRecord[] = [];
  const pen = { x: 0, y: 0 };

  for (let count = 0; count <= MAX_SHAPE_RECORDS; count++) {
    if (count === MAX_SHAPE_RECORDS) return null;
    if (reader.readUnsignedBits(1) !== 0) {
      const record = readSwfShapeEdgeRecord(reader, pen);
      if (record === null) return null;
      records.push(record);
      continue;
    }

    const flags = reader.readUnsignedBits(5);
    if (!reader.valid) return null;
    if (flags === 0) return records;
    if ((flags & STATE_NEW_STYLES) !== 0) return null;

    let moveTo: { x: number; y: number } | null = null;
    if ((flags & STATE_MOVE_TO) !== 0) {
      const moveBits = reader.readUnsignedBits(5);
      pen.x = reader.readSignedBits(moveBits);
      pen.y = reader.readSignedBits(moveBits);
      moveTo = { x: pen.x, y: pen.y };
    }
    const fill0 = (flags & STATE_FILL_STYLE_0) !== 0 ? reader.readUnsignedBits(fillBits) : null;
    const fill1 = (flags & STATE_FILL_STYLE_1) !== 0 ? reader.readUnsignedBits(fillBits) : null;
    const line = (flags & STATE_LINE_STYLE) !== 0 ? reader.readUnsignedBits(lineBits) : null;
    if (!reader.valid) return null;
    records.push({ fill0, fill1, kind: 'style', line, moveTo });
  }
  return null;
}

interface SwfShapeEdgeRecord {
  controlX: number;
  controlY: number;
  curved: boolean;
  kind: 'edge';
  toX: number;
  toY: number;
}

interface SwfShapeStyleRecord {
  fill0: number | null;
  fill1: number | null;
  kind: 'style';
  line: number | null;
  moveTo: { x: number; y: number } | null;
}

type SwfShapeRecord = SwfShapeEdgeRecord | SwfShapeStyleRecord;

interface SwfShapeEdge {
  controlX: number;
  controlY: number;
  curved: boolean;
  toX: number;
  toY: number;
  // A morph edge carries its end endpoint alongside its start one. Absent for an ordinary shape, so the
  // stitcher and the reverser — which read only the start coordinates and reorder whole edges — need no
  // morph branch, and a contour's two endpoints stay in correspondence by construction rather than by a
  // later matching pass.
  endControlX?: number;
  endControlY?: number;
  endToX?: number;
  endToY?: number;
}

// An unbroken run of edges collected against one style. A shape's fill is assembled from these, not read
// from the file, so a segment is an intermediate: it is only a contour once stitching has joined it to
// every other segment that continues it.
interface SwfShapeSegment {
  edges: SwfShapeEdge[];
  startX: number;
  startY: number;
  endStartX?: number;
  endStartY?: number;
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
  // A bitmap fill points at a texture whose pixels arrive later. The geometry is emitted regardless —
  // dropping it would lose the artwork's shape as well as its paint, which is the whole picture for a file
  // whose art is bitmap-filled. Null when the fill is not a bitmap, or when the resolver declined the
  // character, in which case the contour is still drawn and simply carries no paint.
  texture: Texture2D | null;
  textureMatrix: Matrix | null;
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
    if (fill === undefined || segments === undefined) continue;
    if (fill.texture !== null) {
      appendShapeBeginTextureFill(shape, fill.texture, fill.textureMatrix);
    } else if (fill.gradientType === null) {
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
  return { color: ((red << 24) | (green << 16) | (blue << 8) | 0xff) >>> 0, opacity: alpha / 0xff };
}

// Reads one edge off the wire, from the pen position the caller supplies. The pen moves to the edge's
// end, which is what the next edge is relative to.
function readSwfShapeEdgeRecord(reader: SwfReader, pen: { x: number; y: number }): SwfShapeEdgeRecord | null {
  const fromX = pen.x;
  const fromY = pen.y;
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
      pen.x += reader.readSignedBits(bits);
      pen.y += reader.readSignedBits(bits);
    } else {
      const isVerticalLine = reader.readUnsignedBits(1) !== 0;
      if (isVerticalLine) pen.y += reader.readSignedBits(bits);
      else pen.x += reader.readSignedBits(bits);
    }
  } else {
    curved = true;
    controlX = fromX + reader.readSignedBits(bits);
    controlY = fromY + reader.readSignedBits(bits);
    pen.x = controlX + reader.readSignedBits(bits);
    pen.y = controlY + reader.readSignedBits(bits);
  }
  if (!reader.valid) return null;
  return { controlX, controlY, curved, kind: 'edge', toX: pen.x, toY: pen.y };
}

function readSwfShapeEdge(reader: SwfReader, state: SwfShapeState): boolean {
  // Where the pen stands before this edge is where a run that starts with it begins.
  const fromX = state.x;
  const fromY = state.y;
  const record = readSwfShapeEdgeRecord(reader, state);
  if (record === null) return false;

  const edge: SwfShapeEdge = {
    controlX: record.controlX,
    controlY: record.controlY,
    curved: record.curved,
    toX: record.toX,
    toY: record.toY,
  };
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

function readSwfShapeFillStyle(
  reader: SwfReader,
  version: number,
  hasAlpha: boolean,
  resolveBitmapFill: SwfBitmapFillResolver | null,
  diagnostics?: ImportDiagnostic[],
): SwfShapeFill | null {
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
      ratios,
      spreadMethod: resolveSwfShapeSpreadMethod(spread),
      texture: null,
      textureMatrix: null,
    };
  }

  if (
    type === FILL_REPEATING_BITMAP ||
    type === FILL_CLIPPED_BITMAP ||
    type === FILL_NON_SMOOTHED_REPEATING_BITMAP ||
    type === FILL_NON_SMOOTHED_CLIPPED_BITMAP
  ) {
    const characterId = reader.readUint16();
    const matrix = readSwfShapeMatrix(reader);
    if (!reader.valid) return null;
    const repeat = type === FILL_REPEATING_BITMAP || type === FILL_NON_SMOOTHED_REPEATING_BITMAP;
    const smoothed = type === FILL_REPEATING_BITMAP || type === FILL_CLIPPED_BITMAP;
    const fill = createSwfShapeFill(0, 1);
    fill.texture = resolveBitmapFill?.(characterId, repeat, smoothed) ?? null;
    // A bitmap fill's matrix maps the image's PIXEL space into shape space, but SWF writes shape space in
    // twips, so an unscaled 1:1 fill arrives as a scale of 20. readSwfShapeMatrix already converted the
    // translation; the linear part converts here, leaving a pixel-to-pixel matrix.
    const textureMatrix = createMatrix(
      matrix.a / TWIPS_PER_PIXEL,
      matrix.b / TWIPS_PER_PIXEL,
      matrix.c / TWIPS_PER_PIXEL,
      matrix.d / TWIPS_PER_PIXEL,
      matrix.tx,
      matrix.ty,
    );
    // A bitmap fill's matrix comes from the file, so it can be singular — a zero scale is what an
    // authoring tool writes for a collapsed fill. Validated HERE, where it enters, because the renderer
    // that eventually inverts it gets a defined-but-wrong matrix rather than NaN (a/b/c/d zeroed,
    // tx/ty negated) and paints wrong pixels with no error raised. Dropping it to `null` is the same
    // untransformed path a fill with no matrix already takes, rather than a new state.
    if (inverseMatrix(_textureMatrixScratch, textureMatrix)) {
      fill.textureMatrix = textureMatrix;
    } else {
      reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Recover, 'swf.fill-matrix-singular', 'parseSwf', {
        character: characterId,
      });
    }
    return fill;
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
    ratios: [],
    spreadMethod: 'pad',
    texture: null,
    textureMatrix: null,
  };
}

function readSwfShapeLineStyle(
  reader: SwfReader,
  version: number,
  hasAlpha: boolean,
  resolveBitmapFill: SwfBitmapFillResolver | null,
): SwfShapeLine | null {
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
    // No diagnostics sink threaded here on purpose: a fill-backed stroke keeps only the fill's colour and
    // opacity and discards its texture matrix, so a singular one has nothing to affect and reporting it
    // would name a defect the reader cannot observe.
    const fill = readSwfShapeFillStyle(reader, version, hasAlpha, resolveBitmapFill);
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

// A fill MATRIX's translation is always twips and always converts. Its LINEAR part does not, and the two
// fill kinds differ — which is why callers finish the conversion themselves rather than this reader doing
// it for them.
//
// A gradient's matrix maps SWF's gradient square, 32768 twips across, onto the shape. Flight's gradient box
// is the same physical extent expressed in pixels (±819.2), so the unit difference cancels and the linear
// part passes through untouched. A bitmap's matrix maps the image's own PIXEL space onto a shape written in
// twips, so nothing cancels and its linear part must be divided — an unscaled 1:1 fill is authored as scale
// 20. Applying the gradient rule to a bitmap draws it twenty times too large.
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

function readSwfShapeStyles(
  reader: SwfReader,
  version: number,
  hasAlpha: boolean,
  resolveBitmapFill: SwfBitmapFillResolver | null,
  diagnostics?: ImportDiagnostic[],
): SwfShapeStyles | null {
  const fillCount = readSwfShapeStyleCount(reader, version);
  if (!reader.valid || fillCount > MAX_SHAPE_STYLES) return null;
  const fills: SwfShapeFill[] = [];
  for (let i = 0; i < fillCount; i++) {
    const fill = readSwfShapeFillStyle(reader, version, hasAlpha, resolveBitmapFill, diagnostics);
    if (fill === null) return null;
    fills.push(fill);
  }

  const lineCount = readSwfShapeStyleCount(reader, version);
  if (!reader.valid || lineCount > MAX_SHAPE_STYLES) return null;
  const lines: SwfShapeLine[] = [];
  for (let i = 0; i < lineCount; i++) {
    const line = readSwfShapeLineStyle(reader, version, hasAlpha, resolveBitmapFill);
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
  reversed.endStartX = last.endToX;
  reversed.endStartY = last.endToY;
  for (let i = segment.edges.length - 1; i >= 0; i--) {
    const edge = segment.edges[i];
    const previous = i === 0 ? segment : segment.edges[i - 1];
    reversed.edges.push({
      controlX: edge.controlX,
      controlY: edge.controlY,
      curved: edge.curved,
      endControlX: edge.endControlX,
      endControlY: edge.endControlY,
      endToX: i === 0 ? segment.endStartX : (previous as SwfShapeEdge).endToX,
      endToY: i === 0 ? segment.endStartY : (previous as SwfShapeEdge).endToY,
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
    appendSwfShapeEdges(contour.edges, segments[i].edges);

    for (;;) {
      const tail = contour.edges[contour.edges.length - 1];
      if (tail.toX === contour.startX && tail.toY === contour.startY) break;
      const candidates = starts.get(createSwfShapePointKey(tail.toX, tail.toY));
      if (candidates === undefined) break;
      const next = candidates.find((index) => !used[index]);
      if (next === undefined) break;
      used[next] = true;
      appendSwfShapeEdges(contour.edges, segments[next].edges);
    }
    contours.push(contour);
  }
  return contours;
}

// Appends element by element rather than by spreading into push. A contour's edge count comes from the
// authored artwork, and a spread passes one argument per edge, so a large enough path overflows the
// engine's argument limit before it ever reaches the shape.
function appendSwfShapeEdges(out: SwfShapeEdge[], source: readonly SwfShapeEdge[]): void {
  for (let i = 0; i < source.length; i++) out.push(source[i]);
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

// Hands the shape decoder the Texture a bitmap fill paints with, given the fill's character id and the two
// sampling flags SWF encodes in the fill type: whether the image repeats past its edges, and whether it is
// sampled smoothly. Those two axes are the sampler's, not the image's, so one character can back both a
// tiled non-smoothed fill and a clamped smooth one over the same pixels.
type SwfBitmapFillResolver = (characterId: number, repeat: boolean, smoothed: boolean) => Texture2D | null;

const _textureMatrixScratch = createMatrix();
