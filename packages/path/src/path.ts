import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { CIRCLE_KAPPA } from '@flighthq/math/contract';
import type { Path, PathWinding, EntityConstruction } from '@flighthq/types/contract';
import { PathCommand } from '@flighthq/types/contract';

// Approximates an arc centered at (cx, cy) from `startAngle` to `endAngle` (radians) with the given
// `radius`, using one or more cubic bezier segments. Each cubic segment spans at most π/2 (90°) to
// keep the kappa approximation error under 0.03% of the radius. Appends a MOVE_TO at the arc start
// unless `connectToCurrent` is true, in which case the arc start is reached by a LINE_TO (useful for
// building arcs as part of a larger contour). Anticlockwise arcs are supported via the `anticlockwise`
// flag (default false = clockwise).
export function appendPathArc(
  path: Path,
  centerX: number,
  centerY: number,
  radius: number,
  startAngle: number,
  endAngle: number,
  anticlockwise = false,
  connectToCurrent = false,
): void {
  if (radius <= 0) return;
  let sweep = endAngle - startAngle;
  if (anticlockwise) {
    if (sweep > 0) sweep -= Math.PI * 2;
  } else {
    if (sweep < 0) sweep += Math.PI * 2;
  }
  const arcStartX = centerX + Math.cos(startAngle) * radius;
  const arcStartY = centerY + Math.sin(startAngle) * radius;
  if (connectToCurrent) {
    appendPathLineTo(path, arcStartX, arcStartY);
  } else {
    appendPathMoveTo(path, arcStartX, arcStartY);
  }
  appendArcCubics(path, centerX, centerY, radius, radius, 0, startAngle, sweep);
}

// Approximates a circle centered at (cx, cy) with the given radius using four cubic bezier segments.
// The standard kappa constant (4*(sqrt(2)-1)/3) gives the best cubic approximation of an arc.
// Appends a MOVE_TO before the circle and a CLOSE at the end.
export function appendPathCircle(path: Path, centerX: number, centerY: number, radius: number): void {
  appendPathEllipse(path, centerX, centerY, radius, radius);
}

// Closes the current contour back to the most recent MOVE_TO origin. Appends a CLOSE verb (0 data
// values). After CLOSE, the next draw verb starts a new implicit contour unless preceded by MOVE_TO.
export function appendPathClose(path: Path): void {
  path.commands.push(PathCommand.CLOSE);
}

export function appendPathCubicCurveTo(
  path: Path,
  controlX1: number,
  controlY1: number,
  controlX2: number,
  controlY2: number,
  x: number,
  y: number,
): void {
  path.commands.push(PathCommand.CUBIC_CURVE_TO);
  path.data.push(controlX1, controlY1, controlX2, controlY2, x, y);
}

// Approximates an axis-aligned ellipse using four cubic bezier segments, each tangent handle reaching
// CIRCLE_KAPPA = 4*(sqrt(2)-1)/3 of the radius. The error is less than 0.03% of the radius. Appends a
// MOVE_TO at the rightmost point and a CLOSE after the fourth arc segment.
export function appendPathEllipse(
  path: Path,
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

// Appends an SVG-style elliptic arc from the current point to (endX, endY). The arc is defined
// by the ellipse with semi-axes (radiusX, radiusY) rotated by `xAxisRotation` radians. When the
// start and end points do not uniquely identify an arc, `largeArc` and `sweep` select among the
// four candidate arcs: `largeArc=true` picks the arc spanning more than 180°; `sweep=true` picks
// the CW arc (positive-angle direction). Converts the SVG endpoint parameterization to the center
// parameterization and then to cubic bezier segments.
//
// If radiusX or radiusY is 0, appends a LINE_TO to (endX, endY). If the current point equals
// the endpoint, appends nothing. This matches the SVG arc spec behavior.
export function appendPathEllipticalArcTo(
  path: Path,
  radiusX: number,
  radiusY: number,
  xAxisRotation: number,
  largeArc: boolean,
  sweep: boolean,
  endX: number,
  endY: number,
): void {
  if (radiusX === 0 || radiusY === 0) {
    appendPathLineTo(path, endX, endY);
    return;
  }
  // Determine the current point. If the path is empty use (0,0).
  let x1 = 0;
  let y1 = 0;
  {
    const last = getPathLastPoint(path);
    if (last !== null) {
      x1 = last[0];
      y1 = last[1];
    }
  }
  const x2 = endX;
  const y2 = endY;
  // If start == end, do nothing (SVG spec).
  if (x1 === x2 && y1 === y2) return;
  // Ensure positive radii.
  let rx = Math.abs(radiusX);
  let ry = Math.abs(radiusY);
  const cosφ = Math.cos(xAxisRotation);
  const sinφ = Math.sin(xAxisRotation);
  // Step 1: Compute (x1', y1') in the rotated ellipse frame.
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cosφ * dx + sinφ * dy;
  const y1p = -sinφ * dx + cosφ * dy;
  // Step 2: Scale radii up if too small (SVG spec §F.6.6.3).
  const x1pSq = x1p * x1p;
  const y1pSq = y1p * y1p;
  const rxSq = rx * rx;
  const rySq = ry * ry;
  const lambda = x1pSq / rxSq + y1pSq / rySq;
  if (lambda > 1) {
    const sqrtLambda = Math.sqrt(lambda);
    rx *= sqrtLambda;
    ry *= sqrtLambda;
  }
  const rxSq2 = rx * rx;
  const rySq2 = ry * ry;
  // Step 3: Compute center (cx', cy') in the rotated frame.
  const num = rxSq2 * rySq2 - rxSq2 * y1pSq - rySq2 * x1pSq;
  const den = rxSq2 * y1pSq + rySq2 * x1pSq;
  const sq = den <= 0 ? 0 : Math.sqrt(Math.max(0, num / den));
  const sign = largeArc === sweep ? -1 : 1;
  const cxp = (sign * sq * (rx * y1p)) / ry;
  const cyp = (sign * sq * (-ry * x1p)) / rx;
  // Step 4: Compute center (cx, cy) in the original frame.
  const cx = cosφ * cxp - sinφ * cyp + (x1 + x2) / 2;
  const cy = sinφ * cxp + cosφ * cyp + (y1 + y2) / 2;
  // Step 5: Compute start angle θ1 and sweep angle Δθ.
  const ux = (x1p - cxp) / rx;
  const uy = (y1p - cyp) / ry;
  const vx = (-x1p - cxp) / rx;
  const vy = (-y1p - cyp) / ry;
  const theta1 = vectorAngle(1, 0, ux, uy);
  let dtheta = vectorAngle(ux, uy, vx, vy);
  if (!sweep && dtheta > 0) dtheta -= Math.PI * 2;
  if (sweep && dtheta < 0) dtheta += Math.PI * 2;
  appendArcCubics(path, cx, cy, rx, ry, xAxisRotation, theta1, dtheta);
}

export function appendPathLineTo(path: Path, x: number, y: number): void {
  path.commands.push(PathCommand.LINE_TO);
  path.data.push(x, y);
}

export function appendPathMoveTo(path: Path, x: number, y: number): void {
  path.commands.push(PathCommand.MOVE_TO);
  path.data.push(x, y);
}

// Appends a closed polygon from a flat array of [x0, y0, x1, y1, ...] coordinate pairs. Emits a
// MOVE_TO at the first point, LINE_TO for each subsequent point, and a CLOSE at the end.
// Requires at least 3 points (6 values); returns immediately if fewer are provided.
export function appendPathPolygon(path: Path, points: Readonly<number[]>): void {
  if (points.length < 6) return;
  appendPathMoveTo(path, points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) {
    appendPathLineTo(path, points[i], points[i + 1]);
  }
  appendPathClose(path);
}

// Appends an open polyline from a flat array of [x0, y0, x1, y1, ...] coordinate pairs. Emits a
// MOVE_TO at the first point and LINE_TO for each subsequent point. No CLOSE is appended.
// Requires at least 2 points (4 values); returns immediately if fewer are provided.
export function appendPathPolyline(path: Path, points: Readonly<number[]>): void {
  if (points.length < 4) return;
  appendPathMoveTo(path, points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) {
    appendPathLineTo(path, points[i], points[i + 1]);
  }
}

export function appendPathQuadraticCurveTo(path: Path, controlX: number, controlY: number, x: number, y: number): void {
  path.commands.push(PathCommand.QUADRATIC_CURVE_TO);
  path.data.push(controlX, controlY, x, y);
}

// Appends a closed axis-aligned rectangle as a moveTo + three lineTo + close. The winding is CW
// in screen space (y-down), matching the standard path fill convention.
export function appendPathRectangle(path: Path, x: number, y: number, width: number, height: number): void {
  appendPathMoveTo(path, x, y);
  appendPathLineTo(path, x + width, y);
  appendPathLineTo(path, x + width, y + height);
  appendPathLineTo(path, x, y + height);
  appendPathClose(path);
}

export function appendPathRoundedRectangle(
  path: Path,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  appendPathRoundedRectangleWithCornerRadii(path, x, y, width, height, radius, radius, radius, radius);
}

export function appendPathRoundedRectangleWithCornerRadii(
  path: Path,
  x: number,
  y: number,
  width: number,
  height: number,
  topLeft: number,
  topRight: number,
  bottomRight: number,
  bottomLeft: number,
): void {
  const [rtl, rtr, rbr, rbl] = normalizeCornerRadii([topLeft, topRight, bottomRight, bottomLeft], width, height);
  appendPathMoveTo(path, x + rtl, y);
  appendPathLineTo(path, x + width - rtr, y);
  appendCornerArc(path, x + width - rtr, y + rtr, rtr, -Math.PI / 2, 0);
  appendPathLineTo(path, x + width, y + height - rbr);
  appendCornerArc(path, x + width - rbr, y + height - rbr, rbr, 0, Math.PI / 2);
  appendPathLineTo(path, x + rbl, y + height);
  appendCornerArc(path, x + rbl, y + height - rbl, rbl, Math.PI / 2, Math.PI);
  appendPathLineTo(path, x, y + rtl);
  appendCornerArc(path, x + rtl, y + rtl, rtl, Math.PI, (Math.PI * 3) / 2);
  appendPathClose(path);
}

export function appendPathTangentArcTo(
  path: Path,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  radius: number,
): void {
  let penX = 0;
  let penY = 0;
  {
    const last = getPathLastPoint(path);
    if (last !== null) {
      penX = last[0];
      penY = last[1];
    }
  }
  const d1x = penX - x1;
  const d1y = penY - y1;
  const d2x = x2 - x1;
  const d2y = y2 - y1;
  const len1 = Math.sqrt(d1x * d1x + d1y * d1y);
  const len2 = Math.sqrt(d2x * d2x + d2y * d2y);
  if (len1 < 1e-10 || len2 < 1e-10) {
    appendPathLineTo(path, x1, y1);
    return;
  }
  const cosHalf = (d1x * d2x + d1y * d2y) / (len1 * len2);
  const clampedCos = Math.max(-1, Math.min(1, cosHalf));
  const halfAngle = Math.acos(clampedCos) / 2;
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
  const bx = (n1x + n2x) / 2;
  const by = (n1y + n2y) / 2;
  const blen = Math.sqrt(bx * bx + by * by);
  const distToCenter = radius / Math.sin(halfAngle);
  const ocx = x1 + (bx / blen) * distToCenter;
  const ocy = y1 + (by / blen) * distToCenter;
  const startA = Math.atan2(ty1 - ocy, tx1 - ocx);
  const endA = Math.atan2(ty2 - ocy, tx2 - ocx);
  const cross = d1x * d2y - d1y * d2x;
  const isAnticlockwise = cross < 0;
  let sweep = endA - startA;
  if (isAnticlockwise) {
    if (sweep > 0) sweep -= Math.PI * 2;
  } else {
    if (sweep < 0) sweep += Math.PI * 2;
  }
  appendArcCubics(path, ocx, ocy, radius, radius, 0, startA, sweep);
}

export function createPath(winding: PathWinding = 'nonZero'): Path {
  const out = allocateEntity<Path>();
  initializePath(out, winding);
  return finishEntity(out);
}

// Returns the current pen position after the last command. For most commands this is the
// last anchor in the data stream. After CLOSE the SVG/Canvas pen resets to the subpath
// origin (the most recent MOVE_TO), so this walks backward to find it.
export function getPathLastPoint(path: Readonly<Path>): [number, number] | null {
  const { commands, data } = path;
  if (data.length < 2) return null;
  const last = commands.length - 1;
  if (last < 0) return null;

  if (commands[last] !== PathCommand.CLOSE) {
    return [data[data.length - 2], data[data.length - 1]];
  }

  let di = data.length;
  for (let ci = last - 1; ci >= 0; ci--) {
    const cmd = commands[ci];
    di -= pathCommandDataCount(cmd);
    if (cmd === PathCommand.MOVE_TO) return [data[di], data[di + 1]];
    if (cmd === PathCommand.WIDE_MOVE_TO) return [data[di + 2], data[di + 3]];
  }
  return null;
}

// Appends a quarter-circle arc (90°) centered at (cx, cy) with the given radius, from `startAngle`
// to `startAngle + π/2`. Uses a single cubic bezier with the kappa approximation.
function appendCornerArc(
  path: Path,
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
): void {
  if (radius <= 0) return;
  // Single cubic approximation for a quarter arc using kappa.
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

// Appends cubic bezier segments approximating an elliptic arc. The arc is described in the center
// parameterization: (cx, cy) = center, (rx, ry) = semi-axes, xAxisRotation = ellipse rotation,
// theta1 = start angle, dtheta = sweep angle (signed). Segments span at most π/2 to keep error low.
function appendArcCubics(
  path: Path,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  xAxisRotation: number,
  theta1: number,
  dtheta: number,
): void {
  if (dtheta === 0) return;
  // Split into segments of at most π/2.
  const nSegs = Math.max(1, Math.ceil(Math.abs(dtheta) / (Math.PI / 2)));
  const dt = dtheta / nSegs;
  const cosφ = Math.cos(xAxisRotation);
  const sinφ = Math.sin(xAxisRotation);
  for (let i = 0; i < nSegs; i++) {
    const t1 = theta1 + i * dt;
    const t2 = t1 + dt;
    // Endpoint angles.
    const cos1 = Math.cos(t1);
    const sin1 = Math.sin(t1);
    const cos2 = Math.cos(t2);
    const sin2 = Math.sin(t2);
    // The kappa factor for the half-sweep of this segment.
    const alpha = (4 / 3) * Math.tan(dt / 4);
    // Control points in the ellipse frame, then rotated.
    const dx1 = -rx * sin1 * alpha;
    const dy1 = ry * cos1 * alpha;
    const dx2 = rx * sin2 * alpha;
    const dy2 = -ry * cos2 * alpha;
    const p1x = cx + cosφ * rx * cos1 - sinφ * ry * sin1;
    const p1y = cy + sinφ * rx * cos1 + cosφ * ry * sin1;
    const p2x = cx + cosφ * rx * cos2 - sinφ * ry * sin2;
    const p2y = cy + sinφ * rx * cos2 + cosφ * ry * sin2;
    const c1x = p1x + cosφ * dx1 - sinφ * dy1;
    const c1y = p1y + sinφ * dx1 + cosφ * dy1;
    const c2x = p2x + cosφ * dx2 - sinφ * dy2;
    const c2y = p2y + sinφ * dx2 + cosφ * dy2;
    appendPathCubicCurveTo(path, c1x, c1y, c2x, c2y, p2x, p2y);
  }
}

// Allocates an empty path. Winding defaults to nonZero: same-wound subpaths union (the common clip
// case) and counter-wound subpaths cut holes. Pass 'evenOdd' for parity fills.
export function initializePath(out: EntityConstruction<Path>, winding: PathWinding = 'nonZero'): void {
  out.commands = [];
  out.data = [];
  out.winding = winding;
}

// Normalizes corner radii for a rounded rectangle, clamping each corner radius to at most half the
// adjacent edge length so corners never overlap. Returns [topLeft, topRight, bottomRight, bottomLeft].
function normalizeCornerRadii(
  radius: [number, number, number, number],
  width: number,
  height: number,
): [number, number, number, number] {
  const [rtl, rtr, rbr, rbl] = radius;
  // Clamp each radius to half of the shorter adjacent edge.
  const halfW = Math.abs(width) / 2;
  const halfH = Math.abs(height) / 2;
  const clampTL = Math.max(0, Math.min(rtl, halfW, halfH));
  const clampTR = Math.max(0, Math.min(rtr, halfW, halfH));
  const clampBR = Math.max(0, Math.min(rbr, halfW, halfH));
  const clampBL = Math.max(0, Math.min(rbl, halfW, halfH));
  return [clampTL, clampTR, clampBR, clampBL];
}

// Computes the signed angle from vector (ux,uy) to vector (vx,vy), following the SVG spec §F.6.5.6.
// The result is in the range (-π, π].
function vectorAngle(ux: number, uy: number, vx: number, vy: number): number {
  const dot = ux * vx + uy * vy;
  const lenU = Math.sqrt(ux * ux + uy * uy);
  const lenV = Math.sqrt(vx * vx + vy * vy);
  if (lenU === 0 || lenV === 0) return 0;
  const cosAngle = Math.max(-1, Math.min(1, dot / (lenU * lenV)));
  const angle = Math.acos(cosAngle);
  return ux * vy - uy * vx < 0 ? -angle : angle;
}

function pathCommandDataCount(cmd: PathCommand): number {
  if (cmd === PathCommand.MOVE_TO || cmd === PathCommand.LINE_TO) return 2;
  if (cmd === PathCommand.QUADRATIC_CURVE_TO || cmd === PathCommand.WIDE_MOVE_TO || cmd === PathCommand.WIDE_LINE_TO)
    return 4;
  if (cmd === PathCommand.CUBIC_CURVE_TO) return 6;
  return 0;
}

// Optimal cubic Bezier arc approximation constant: 4*(sqrt(2)-1)/3.
// Maximum radial error is < 0.03% of the radius.
