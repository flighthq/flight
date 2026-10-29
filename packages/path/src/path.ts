// Generated from crates/flight-path/src/path.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { allocateEntity } from '@flighthq/entity/contract';
import type { EntityRaw } from '@flighthq/entity/contract';

/**
 * Path command verb codes stored in the commands array. The byte values are the TS `PathCommand`
 * wire codes exactly, so a serialized `Path.commands` stream is interchangeable with TS. Each verb
 * consumes a fixed number of `data` values: MOVE_TO/LINE_TO 2, QUADRATIC_CURVE_TO 4, CUBIC_CURVE_TO
 * 6, WIDE_MOVE_TO/WIDE_LINE_TO 4 (a dummy pair, then the real point), CLOSE and NO_OP 0. Readers skip
 * NO_OP (and any unrecognized byte) without consuming data, as in TS.
 */
export enum PathCommand {
  NO_OP = 0,
  MOVE_TO = 1,
  LINE_TO = 2,
  QUADRATIC_CURVE_TO = 3,
  WIDE_MOVE_TO = 4,
  WIDE_LINE_TO = 5,
  CUBIC_CURVE_TO = 6,
  CLOSE = 7,
}

/**
 * Path winding rule.
 */
export type PathWinding = 'nonZero' | 'evenOdd';

/**
 * Stroke line cap style.
 */
export type StrokeCap = 'butt' | 'round' | 'square';

/**
 * Stroke line join style.
 */
export type StrokeJoin = 'miter' | 'bevel' | 'round';

/**
 * Reason a path morph could not be created.
 */
export type PathMorphCreationReason =
  | 'ok'
  | 'winding-mismatch'
  | 'contour-count-mismatch'
  | 'contour-closedness-mismatch'
  | 'contour-orientation-mismatch';

/**
 * Reason a stroke path tessellation failed.
 */
export type StrokePathTessellationReason =
  | 'ok'
  | 'invalid-style'
  | 'invalid-path'
  | 'self-intersecting-centerline'
  | 'reversing-join'
  | 'self-intersecting-outline';

/**
 * Decoded path segment for iteration.
 */
export type PathSegment =
  | { readonly kind: 'moveTo'; readonly x: number; readonly y: number }
  | { readonly kind: 'lineTo'; readonly x: number; readonly y: number }
  | {
      readonly kind: 'quadraticCurveTo';
      readonly controlX: number;
      readonly controlY: number;
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly kind: 'cubicCurveTo';
      readonly controlX1: number;
      readonly controlY1: number;
      readonly controlX2: number;
      readonly controlY2: number;
      readonly x: number;
      readonly y: number;
    }
  | { readonly kind: 'close' };

/**
 * A 2D vector path: a command stream paired with a flat coordinate data array.
 * Commands encode the verb (move, line, curve, close); data holds the coordinate
 * pairs consumed by each verb. Winding rule determines fill behavior.
 */
export interface PathRaw extends EntityRaw {
  commands: number[];
  data: number[];
  winding: PathWinding;
}

/**
 * A triangulated fill in typed arrays for zero-copy GPU upload (TS `PathMeshTyped`): x,y vertex pairs
 * as `Float32Array` and triangle indices as `Uint32Array`. Plain data.
 */
export interface PathMeshTyped {
  vertices: Float32Array;
  indices: Uint32Array;
}

/**
 * A triangulated mesh: flat (x,y) vertex pairs and triangle index triples.
 */
export interface PathMesh {
  vertices: number[];
  indices: number[];
}

/**
 * Stroke style parameters. Every field is optional; stroking applies the defaults `width` 1,
 * `cap` butt, `join` miter, `miterLimit` 4, no `dash`, and `dashOffset` 0.
 */
export interface StrokeStyle {
  width?: number;
  cap?: StrokeCap;
  join?: StrokeJoin;
  miterLimit?: number;
  dash?: number[];
  dashOffset?: number;
}

/**
 * Prepared interpolation between two paths for morphing.
 */
export interface PathMorphRaw extends EntityRaw {
  readonly commands: number[];
  readonly startData: number[];
  readonly endData: number[];
  readonly winding: PathWinding;
}

/**
 * Explanation of whether two paths can be morphed.
 */
export interface PathMorphCreationExplanation {
  readonly supported: boolean;
  readonly reason: PathMorphCreationReason;
  readonly contour: number | null;
}

/**
 * Explanation of whether a stroke path could be tessellated.
 */
export interface StrokePathTessellationExplanation {
  readonly supported: boolean;
  readonly reason: StrokePathTessellationReason;
  readonly subpath: number | null;
}

/**
 * The CIRCLE_KAPPA constant: 4*(sqrt(2)-1)/3.
 * Optimal cubic Bezier arc approximation constant.
 * Maximum radial error is less than 0.03% of the radius.
 */
const CIRCLE_KAPPA: number = 0.5522847498307936;

/**
 * Approximates an arc centered at (center_x, center_y) from start_angle to end_angle with the
 * given radius. Uses one or more cubic bezier segments spanning at most pi/2 each.
 */
export function appendPathArc(
  path: PathRaw,
  centerX: number,
  centerY: number,
  radius: number,
  startAngle: number,
  endAngle: number,
  anticlockwise?: boolean,
  connectToCurrent?: boolean,
): void {
  anticlockwise = anticlockwise ?? false;
  connectToCurrent = connectToCurrent ?? false;
  if (radius <= 0.0) {
    return;
  }
  let sweep = endAngle - startAngle;
  if (anticlockwise) {
    if (sweep > 0.0) {
      sweep -= Math.PI * 2.0;
    }
  } else {
    if (sweep < 0.0) {
      sweep += Math.PI * 2.0;
    }
  }
  const arcStartX = centerX + Math.cos(startAngle) * radius;
  const arcStartY = centerY + Math.sin(startAngle) * radius;
  if (connectToCurrent) {
    appendPathLineTo(path, arcStartX, arcStartY);
  } else {
    appendPathMoveTo(path, arcStartX, arcStartY);
  }
  appendArcCubics(path, centerX, centerY, radius, radius, 0.0, startAngle, sweep);
}

/**
 * Approximates a circle centered at (center_x, center_y) with the given radius using four cubic
 * bezier segments. Appends a MOVE_TO before the circle and a CLOSE at the end.
 */
export function appendPathCircle(path: PathRaw, centerX: number, centerY: number, radius: number): void {
  appendPathEllipse(path, centerX, centerY, radius, radius);
}

function appendArcCubics(
  path: PathRaw,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  xAxisRotation: number,
  theta1: number,
  dtheta: number,
): void {
  if (dtheta === 0.0) {
    return;
  }
  const nSegs = Math.max(1, Math.ceil(Math.abs(dtheta) / (Math.PI / 2.0)));
  const dt = dtheta / nSegs;
  const cosPhi = Math.cos(xAxisRotation);
  const sinPhi = Math.sin(xAxisRotation);
  for (let i = 0; i < nSegs; i += 1) {
    const t1 = theta1 + i * dt;
    const t2 = t1 + dt;
    const cos1 = Math.cos(t1);
    const sin1 = Math.sin(t1);
    const cos2 = Math.cos(t2);
    const sin2 = Math.sin(t2);
    const alpha = (4.0 / 3.0) * Math.tan(dt / 4.0);
    const dx1 = -rx * sin1 * alpha;
    const dy1 = ry * cos1 * alpha;
    const dx2 = rx * sin2 * alpha;
    const dy2 = -ry * cos2 * alpha;
    const p1x = cx + cosPhi * rx * cos1 - sinPhi * ry * sin1;
    const p1y = cy + sinPhi * rx * cos1 + cosPhi * ry * sin1;
    const p2x = cx + cosPhi * rx * cos2 - sinPhi * ry * sin2;
    const p2y = cy + sinPhi * rx * cos2 + cosPhi * ry * sin2;
    const c1x = p1x + cosPhi * dx1 - sinPhi * dy1;
    const c1y = p1y + sinPhi * dx1 + cosPhi * dy1;
    const c2x = p2x + cosPhi * dx2 - sinPhi * dy2;
    const c2y = p2y + sinPhi * dx2 + cosPhi * dy2;
    appendPathCubicCurveTo(path, c1x, c1y, c2x, c2y, p2x, p2y);
  }
}

function appendCornerArc(
  path: PathRaw,
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
): void {
  if (radius <= 0.0) {
    return;
  }
  const k = radius * CIRCLE_KAPPA;
  const cosStart = Math.cos(startAngle);
  const sinStart = Math.sin(startAngle);
  const cosEnd = Math.cos(endAngle);
  const sinEnd = Math.sin(endAngle);
  appendPathCubicCurveTo(
    path,
    cx + cosStart * radius - sinStart * k,
    cy + sinStart * radius + cosStart * k,
    cx + cosEnd * radius + sinEnd * k,
    cy + sinEnd * radius - cosEnd * k,
    cx + cosEnd * radius,
    cy + sinEnd * radius,
  );
}

/**
 * Closes the current contour back to the most recent MOVE_TO origin.
 */
export function appendPathClose(path: PathRaw): void {
  path.commands.push(PathCommand.CLOSE);
}

/**
 * Appends a CUBIC_CURVE_TO command with two control points and an anchor.
 */
export function appendPathCubicCurveTo(
  path: PathRaw,
  controlX1: number,
  controlY1: number,
  controlX2: number,
  controlY2: number,
  x: number,
  y: number,
): void {
  path.commands.push(PathCommand.CUBIC_CURVE_TO);
  path.data.push(controlX1);
  path.data.push(controlY1);
  path.data.push(controlX2);
  path.data.push(controlY2);
  path.data.push(x);
  path.data.push(y);
}

/**
 * Approximates an axis-aligned ellipse using four cubic bezier segments.
 */
export function appendPathEllipse(
  path: PathRaw,
  centerX: number,
  centerY: number,
  radiusX: number,
  radiusY: number,
): void {
  const kx = radiusX * CIRCLE_KAPPA;
  const ky = radiusY * CIRCLE_KAPPA;
  appendPathMoveTo(path, centerX + radiusX, centerY);
  appendPathCubicCurveTo(
    path,
    centerX + radiusX,
    centerY - ky,
    centerX + kx,
    centerY - radiusY,
    centerX,
    centerY - radiusY,
  );
  appendPathCubicCurveTo(
    path,
    centerX - kx,
    centerY - radiusY,
    centerX - radiusX,
    centerY - ky,
    centerX - radiusX,
    centerY,
  );
  appendPathCubicCurveTo(
    path,
    centerX - radiusX,
    centerY + ky,
    centerX - kx,
    centerY + radiusY,
    centerX,
    centerY + radiusY,
  );
  appendPathCubicCurveTo(
    path,
    centerX + kx,
    centerY + radiusY,
    centerX + radiusX,
    centerY + ky,
    centerX + radiusX,
    centerY,
  );
  appendPathClose(path);
}

/**
 * Appends an SVG-style elliptic arc from the current point to (end_x, end_y).
 */
export function appendPathEllipticalArcTo(
  path: PathRaw,
  radiusX: number,
  radiusY: number,
  xAxisRotation: number,
  largeArc: boolean,
  sweep: boolean,
  endX: number,
  endY: number,
): void {
  if (radiusX === 0.0 || radiusY === 0.0) {
    appendPathLineTo(path, endX, endY);
    return;
  }
  const last = getPathLastPoint(path) ?? undefined;
  let x1 = 0.0;
  let y1 = 0.0;
  if (last !== undefined) {
    const point = last;
    x1 = point[0];
    y1 = point[1];
  }
  const x2 = endX;
  const y2 = endY;
  if (x1 === x2 && y1 === y2) {
    return;
  }
  let rx = Math.abs(radiusX);
  let ry = Math.abs(radiusY);
  const cosPhi = Math.cos(xAxisRotation);
  const sinPhi = Math.sin(xAxisRotation);
  const dx = (x1 - x2) / 2.0;
  const dy = (y1 - y2) / 2.0;
  const x1p = cosPhi * dx + sinPhi * dy;
  const y1p = -sinPhi * dx + cosPhi * dy;
  const x1pSq = x1p * x1p;
  const y1pSq = y1p * y1p;
  const rxSq = rx * rx;
  const rySq = ry * ry;
  const lambda = x1pSq / rxSq + y1pSq / rySq;
  if (lambda > 1.0) {
    const sqrtLambda = Math.sqrt(lambda);
    rx *= sqrtLambda;
    ry *= sqrtLambda;
  }
  const rxSq2 = rx * rx;
  const rySq2 = ry * ry;
  const num = rxSq2 * rySq2 - rxSq2 * y1pSq - rySq2 * x1pSq;
  const den = rxSq2 * y1pSq + rySq2 * x1pSq;
  const sq = den <= 0.0 ? 0.0 : Math.sqrt(Math.max(num / den, 0.0));
  const sign = largeArc === sweep ? -1.0 : 1.0;
  const cxp = (sign * sq * (rx * y1p)) / ry;
  const cyp = (sign * sq * (-ry * x1p)) / rx;
  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2.0;
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2.0;
  const ux = (x1p - cxp) / rx;
  const uy = (y1p - cyp) / ry;
  const vx = (-x1p - cxp) / rx;
  const vy = (-y1p - cyp) / ry;
  const theta1 = vectorAngle(1.0, 0.0, ux, uy);
  let dtheta = vectorAngle(ux, uy, vx, vy);
  if (!sweep && dtheta > 0.0) {
    dtheta -= Math.PI * 2.0;
  }
  if (sweep && dtheta < 0.0) {
    dtheta += Math.PI * 2.0;
  }
  appendArcCubics(path, cx, cy, rx, ry, xAxisRotation, theta1, dtheta);
}

/**
 * Appends a LINE_TO command and its point to the path.
 */
export function appendPathLineTo(path: PathRaw, x: number, y: number): void {
  path.commands.push(PathCommand.LINE_TO);
  path.data.push(x);
  path.data.push(y);
}

/**
 * Appends a MOVE_TO command and its point to the path.
 */
export function appendPathMoveTo(path: PathRaw, x: number, y: number): void {
  path.commands.push(PathCommand.MOVE_TO);
  path.data.push(x);
  path.data.push(y);
}

/**
 * Appends a closed polygon from a flat array of coordinate pairs.
 */
export function appendPathPolygon(path: PathRaw, points: ArrayLike<number>): void {
  if (points.length < 6) {
    return;
  }
  appendPathMoveTo(path, points[0], points[1]);
  let i = 2;
  while (i < points.length) {
    appendPathLineTo(path, points[i], points[i + 1]);
    i += 2;
  }
  appendPathClose(path);
}

/**
 * Appends an open polyline from a flat array of coordinate pairs.
 */
export function appendPathPolyline(path: PathRaw, points: ArrayLike<number>): void {
  if (points.length < 4) {
    return;
  }
  appendPathMoveTo(path, points[0], points[1]);
  let i = 2;
  while (i < points.length) {
    appendPathLineTo(path, points[i], points[i + 1]);
    i += 2;
  }
}

/**
 * Appends a QUADRATIC_CURVE_TO command with its control point and anchor.
 */
export function appendPathQuadraticCurveTo(
  path: PathRaw,
  controlX: number,
  controlY: number,
  x: number,
  y: number,
): void {
  path.commands.push(PathCommand.QUADRATIC_CURVE_TO);
  path.data.push(controlX);
  path.data.push(controlY);
  path.data.push(x);
  path.data.push(y);
}

/**
 * Appends a closed axis-aligned rectangle.
 */
export function appendPathRectangle(path: PathRaw, x: number, y: number, width: number, height: number): void {
  appendPathMoveTo(path, x, y);
  appendPathLineTo(path, x + width, y);
  appendPathLineTo(path, x + width, y + height);
  appendPathLineTo(path, x, y + height);
  appendPathClose(path);
}

/**
 * Appends a closed rounded rectangle with uniform corner radius.
 */
export function appendPathRoundedRectangle(
  path: PathRaw,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  appendPathRoundedRectangleWithCornerRadii(path, x, y, width, height, radius, radius, radius, radius);
}

/**
 * Appends a closed rounded rectangle with per-corner radii.
 */
export function appendPathRoundedRectangleWithCornerRadii(
  path: PathRaw,
  x: number,
  y: number,
  width: number,
  height: number,
  topLeft: number,
  topRight: number,
  bottomRight: number,
  bottomLeft: number,
): void {
  const [rtl, rtr, rbr, rbl] = normalizeCornerRadii(topLeft, topRight, bottomRight, bottomLeft, width, height);
  appendPathMoveTo(path, x + rtl, y);
  appendPathLineTo(path, x + width - rtr, y);
  appendCornerArc(path, x + width - rtr, y + rtr, rtr, -(Math.PI / 2.0), 0.0);
  appendPathLineTo(path, x + width, y + height - rbr);
  appendCornerArc(path, x + width - rbr, y + height - rbr, rbr, 0.0, Math.PI / 2.0);
  appendPathLineTo(path, x + rbl, y + height);
  appendCornerArc(path, x + rbl, y + height - rbl, rbl, Math.PI / 2.0, Math.PI);
  appendPathLineTo(path, x, y + rtl);
  appendCornerArc(path, x + rtl, y + rtl, rtl, Math.PI, (Math.PI * 3.0) / 2.0);
  appendPathClose(path);
}

/**
 * Appends an arc tangent to the two lines (pen, x1, y1) and (x1, y1, x2, y2).
 */
export function appendPathTangentArcTo(
  path: PathRaw,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  radius: number,
): void {
  const last = getPathLastPoint(path) ?? undefined;
  let penX = 0.0;
  let penY = 0.0;
  if (last !== undefined) {
    const point = last;
    penX = point[0];
    penY = point[1];
  }
  const d1x = penX - x1;
  const d1y = penY - y1;
  const d2x = x2 - x1;
  const d2y = y2 - y1;
  const len1 = Math.sqrt(d1x * d1x + d1y * d1y);
  const len2 = Math.sqrt(d2x * d2x + d2y * d2y);
  if (radius <= 0.0 || len1 < 1e-10 || len2 < 1e-10) {
    appendPathLineTo(path, x1, y1);
    return;
  }
  const cosHalf = (d1x * d2x + d1y * d2y) / (len1 * len2);
  const clampedCos = Math.min(Math.max(cosHalf, -1.0), 1.0);
  const halfAngle = Math.acos(clampedCos) / 2.0;
  if (Math.abs(Math.sin(halfAngle)) < 1e-10) {
    appendPathLineTo(path, x1, y1);
    return;
  }
  const d = radius / Math.tan(halfAngle);
  const n1x = d1x / len1;
  const n1y = d1y / len1;
  const tx1 = x1 + n1x * d;
  const ty1 = y1 + n1y * d;
  const n2x = d2x / len2;
  const n2y = d2y / len2;
  const tx2 = x1 + n2x * d;
  const ty2 = y1 + n2y * d;
  appendPathLineTo(path, tx1, ty1);
  const bx = (n1x + n2x) / 2.0;
  const by = (n1y + n2y) / 2.0;
  const blen = Math.sqrt(bx * bx + by * by);
  if (blen < 1e-10) {
    return;
  }
  const distToCenter = radius / Math.sin(halfAngle);
  const ocx = x1 + (bx / blen) * distToCenter;
  const ocy = y1 + (by / blen) * distToCenter;
  const startA = Math.atan2(ty1 - ocy, tx1 - ocx);
  const endA = Math.atan2(ty2 - ocy, tx2 - ocx);
  let arcSweep = endA - startA;
  if (arcSweep > Math.PI) {
    arcSweep -= Math.PI * 2.0;
  }
  if (arcSweep < -Math.PI) {
    arcSweep += Math.PI * 2.0;
  }
  appendArcCubics(path, ocx, ocy, radius, radius, 0.0, startA, arcSweep);
}

/**
 * Creates an empty path with the given winding rule, `NonZero` when omitted (TS
 * `createPath(winding = 'nonZero')`).
 */
export function createPath(winding?: PathWinding): PathRaw {
  let out: PathRaw = Object.assign(allocateEntity<PathRaw>(), { commands: [], data: [] });
  initializePath(out, winding);
  return out;
}

/**
 * Returns the current pen position after the last command, or None for an empty path.
 */
export function getPathLastPoint(path: Readonly<PathRaw>): readonly [number, number] | null {
  if (path.data.length < 2) {
    return null;
  }
  const last = path.commands.length;
  if (last === 0) {
    return null;
  }
  const lastCmd = path.commands[last - 1];
  if (lastCmd !== PathCommand.CLOSE) {
    return [path.data[path.data.length - 2], path.data[path.data.length - 1]];
  }
  let di = path.data.length;
  let ci = last - 2;
  while (ci >= 0) {
    const cmd = path.commands[ci];
    di -= pathCommandDataCount(cmd);
    if (cmd === PathCommand.MOVE_TO) {
      return [path.data[di], path.data[di + 1]];
    }
    if (cmd === PathCommand.WIDE_MOVE_TO) {
      return [path.data[di + 2], path.data[di + 3]];
    }
    ci -= 1;
  }
  return null;
}

export function getPathMorphCreationReasonString(value: PathMorphCreationReason): string {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'ok':
        return 'ok';
      case 'winding-mismatch':
        return 'winding-mismatch';
      case 'contour-count-mismatch':
        return 'contour-count-mismatch';
      case 'contour-closedness-mismatch':
        return 'contour-closedness-mismatch';
      case 'contour-orientation-mismatch':
        return 'contour-orientation-mismatch';
    }
  })();
}

export function getPathWindingString(value: PathWinding): string {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'nonZero':
        return 'nonZero';
      case 'evenOdd':
        return 'evenOdd';
    }
  })();
}

export function getStrokeCapString(value: StrokeCap): string {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'butt':
        return 'butt';
      case 'round':
        return 'round';
      case 'square':
        return 'square';
    }
  })();
}

export function getStrokeJoinString(value: StrokeJoin): string {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'miter':
        return 'miter';
      case 'bevel':
        return 'bevel';
      case 'round':
        return 'round';
    }
  })();
}

export function getStrokePathTessellationReasonString(value: StrokePathTessellationReason): string {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'ok':
        return 'ok';
      case 'invalid-style':
        return 'invalid-style';
      case 'invalid-path':
        return 'invalid-path';
      case 'self-intersecting-centerline':
        return 'self-intersecting-centerline';
      case 'reversing-join':
        return 'reversing-join';
      case 'self-intersecting-outline':
        return 'self-intersecting-outline';
    }
  })();
}

/**
 * Writes the empty command and data streams and the given winding rule, `NonZero` when omitted,
 * into a pre-allocated `Path` (TS `initializePath(out, winding = 'nonZero')`).
 */
export function initializePath(out: PathRaw, winding?: PathWinding): void {
  out.commands = [] as never[];
  out.data = [] as never[];
  out.winding = winding ?? 'nonZero';
}

function normalizeCornerRadii(
  topLeft: number,
  topRight: number,
  bottomRight: number,
  bottomLeft: number,
  width: number,
  height: number,
): readonly [number, number, number, number] {
  const halfW = Math.abs(width) / 2.0;
  const halfH = Math.abs(height) / 2.0;
  const clampTl = Math.min(Math.min(Math.max(topLeft, 0.0), halfW), halfH);
  const clampTr = Math.min(Math.min(Math.max(topRight, 0.0), halfW), halfH);
  const clampBr = Math.min(Math.min(Math.max(bottomRight, 0.0), halfW), halfH);
  const clampBl = Math.min(Math.min(Math.max(bottomLeft, 0.0), halfW), halfH);
  return [clampTl, clampTr, clampBr, clampBl];
}

export function parsePathMorphCreationReason(value: string): PathMorphCreationReason | undefined {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'ok':
        return 'ok';
      case 'winding-mismatch':
        return 'winding-mismatch';
      case 'contour-count-mismatch':
        return 'contour-count-mismatch';
      case 'contour-closedness-mismatch':
        return 'contour-closedness-mismatch';
      case 'contour-orientation-mismatch':
        return 'contour-orientation-mismatch';
      default:
        return undefined;
    }
  })();
}

export function parsePathWinding(value: string): PathWinding | undefined {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'nonZero':
        return 'nonZero';
      case 'evenOdd':
        return 'evenOdd';
      default:
        return undefined;
    }
  })();
}

export function parseStrokeCap(value: string): StrokeCap | undefined {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'butt':
        return 'butt';
      case 'round':
        return 'round';
      case 'square':
        return 'square';
      default:
        return undefined;
    }
  })();
}

export function parseStrokeJoin(value: string): StrokeJoin | undefined {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'miter':
        return 'miter';
      case 'bevel':
        return 'bevel';
      case 'round':
        return 'round';
      default:
        return undefined;
    }
  })();
}

export function parseStrokePathTessellationReason(value: string): StrokePathTessellationReason | undefined {
  const reasons = [
    ['ok', 'ok'],
    ['invalid-style', 'invalid-style'],
    ['invalid-path', 'invalid-path'],
    ['self-intersecting-centerline', 'self-intersecting-centerline'],
    ['reversing-join', 'reversing-join'],
    ['self-intersecting-outline', 'self-intersecting-outline'],
  ] as const;
  for (let i = 0; i < reasons.length; i += 1) {
    if (reasons[i][0] === value) {
      return reasons[i][1];
    }
  }
  return undefined;
}

function pathCommandDataCount(cmd: number): number {
  if (cmd === PathCommand.MOVE_TO || cmd === PathCommand.LINE_TO) {
    return 2;
  }
  if (cmd === PathCommand.QUADRATIC_CURVE_TO || cmd === PathCommand.WIDE_MOVE_TO || cmd === PathCommand.WIDE_LINE_TO) {
    return 4;
  }
  if (cmd === PathCommand.CUBIC_CURVE_TO) {
    return 6;
  }
  return 0;
}

function vectorAngle(ux: number, uy: number, vx: number, vy: number): number {
  const dot = ux * vx + uy * vy;
  const lenU = Math.sqrt(ux * ux + uy * uy);
  const lenV = Math.sqrt(vx * vx + vy * vy);
  if (lenU === 0.0 || lenV === 0.0) {
    return 0.0;
  }
  const cosAngle = Math.min(Math.max(dot / (lenU * lenV), -1.0), 1.0);
  const angle = Math.acos(cosAngle);
  return ux * vy - uy * vx < 0.0 ? -angle : angle;
}
