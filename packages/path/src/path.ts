import type { Path, PathWinding } from '@flighthq/types';
import { PathCommand } from '@flighthq/types';

// Approximates an arc centered at (cx, cy) from `startAngle` to `endAngle` (radians) with the given
// `radius`, using one or more cubic bezier segments. Each cubic segment spans at most π/2 (90°) to
// keep the kappa approximation error under 0.03% of the radius. Appends a MOVE_TO at the arc start
// unless `connectToCurrent` is true, in which case the arc start is reached by a LINE_TO (useful for
// building arcs as part of a larger contour). Anticlockwise arcs are supported via the `anticlockwise`
// flag (default false = clockwise).
export function appendPathArc(
  path: Path,
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
  anticlockwise = false,
  connectToCurrent = false,
): void {
  if (radius <= 0) return;
  // Normalize the angle sweep to the correct winding direction.
  let sweep = endAngle - startAngle;
  if (anticlockwise) {
    if (sweep > 0) sweep -= Math.PI * 2;
  } else {
    if (sweep < 0) sweep += Math.PI * 2;
  }
  const arcStartX = cx + Math.cos(startAngle) * radius;
  const arcStartY = cy + Math.sin(startAngle) * radius;
  if (connectToCurrent) {
    appendPathLineTo(path, arcStartX, arcStartY);
  } else {
    appendPathMoveTo(path, arcStartX, arcStartY);
  }
  appendArcCubics(path, cx, cy, radius, radius, 0, startAngle, sweep);
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
export function appendPathArcTo(
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

// Approximates a circle centered at (cx, cy) with the given radius using four cubic bezier segments.
// The standard kappa constant (4*(sqrt(2)-1)/3) gives the best cubic approximation of an arc.
// Appends a MOVE_TO before the circle and a CLOSE at the end.
export function appendPathCircle(path: Path, cx: number, cy: number, radius: number): void {
  appendPathEllipse(path, cx, cy, radius, radius);
}

// Closes the current contour back to the most recent MOVE_TO origin. Appends a CLOSE verb (0 data
// values). After CLOSE, the next draw verb starts a new implicit contour unless preceded by MOVE_TO.
export function appendPathClose(path: Path): void {
  path.commands.push(PathCommand.CLOSE);
}

export function appendPathCubicCurveTo(
  path: Path,
  control1X: number,
  control1Y: number,
  control2X: number,
  control2Y: number,
  anchorX: number,
  anchorY: number,
): void {
  path.commands.push(PathCommand.CUBIC_CURVE_TO);
  path.data.push(control1X, control1Y, control2X, control2Y, anchorX, anchorY);
}

export function appendPathCurveTo(
  path: Path,
  controlX: number,
  controlY: number,
  anchorX: number,
  anchorY: number,
): void {
  path.commands.push(PathCommand.CURVE_TO);
  path.data.push(controlX, controlY, anchorX, anchorY);
}

// Approximates an axis-aligned ellipse using four cubic bezier segments (standard kappa approximation:
// kappa = 4*(sqrt(2)-1)/3 ≈ 0.5522847498). The error is less than 0.03% of the radius. Appends a
// MOVE_TO at the rightmost point and a CLOSE after the fourth arc segment.
export function appendPathEllipse(path: Path, cx: number, cy: number, radiusX: number, radiusY: number): void {
  // kappa: the distance along each tangent handle for the optimal cubic arc approximation.
  const kx = radiusX * KAPPA;
  const ky = radiusY * KAPPA;
  appendPathMoveTo(path, cx + radiusX, cy);
  appendPathCubicCurveTo(path, cx + radiusX, cy - ky, cx + kx, cy - radiusY, cx, cy - radiusY);
  appendPathCubicCurveTo(path, cx - kx, cy - radiusY, cx - radiusX, cy - ky, cx - radiusX, cy);
  appendPathCubicCurveTo(path, cx - radiusX, cy + ky, cx - kx, cy + radiusY, cx, cy + radiusY);
  appendPathCubicCurveTo(path, cx + kx, cy + radiusY, cx + radiusX, cy + ky, cx + radiusX, cy);
  appendPathClose(path);
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

// Appends a closed axis-aligned rectangle as a moveTo + three lineTo + close. The winding is CW
// in screen space (y-down), matching the standard path fill convention.
export function appendPathRectangle(path: Path, x: number, y: number, width: number, height: number): void {
  appendPathMoveTo(path, x, y);
  appendPathLineTo(path, x + width, y);
  appendPathLineTo(path, x + width, y + height);
  appendPathLineTo(path, x, y + height);
  appendPathClose(path);
}

// Appends a closed axis-aligned rounded rectangle. Corner radii are uniform when passed as a single
// number, or per-corner when passed as [topLeft, topRight, bottomRight, bottomLeft]. Each radius is
// clamped to half the adjacent edge so the corners never overlap. Radii of 0 produce sharp corners.
// Corners are approximated using the kappa cubic arc method (same as `appendPathEllipse`).
export function appendPathRoundRectangle(
  path: Path,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number | [number, number, number, number],
): void {
  const [rtl, rtr, rbr, rbl] = normalizeCornerRadii(radius, width, height);
  // Start at the top-left corner arc start (top edge, after top-left radius).
  appendPathMoveTo(path, x + rtl, y);
  // Top edge → top-right corner.
  appendPathLineTo(path, x + width - rtr, y);
  appendCornerArc(path, x + width - rtr, y + rtr, rtr, -Math.PI / 2, 0);
  // Right edge → bottom-right corner.
  appendPathLineTo(path, x + width, y + height - rbr);
  appendCornerArc(path, x + width - rbr, y + height - rbr, rbr, 0, Math.PI / 2);
  // Bottom edge → bottom-left corner.
  appendPathLineTo(path, x + rbl, y + height);
  appendCornerArc(path, x + rbl, y + height - rbl, rbl, Math.PI / 2, Math.PI);
  // Left edge → top-left corner.
  appendPathLineTo(path, x, y + rtl);
  appendCornerArc(path, x + rtl, y + rtl, rtl, Math.PI, (Math.PI * 3) / 2);
  appendPathClose(path);
}

// Allocates an empty path. Winding defaults to nonZero: same-wound subpaths union (the common clip
// case) and counter-wound subpaths cut holes. Pass 'evenOdd' for parity fills.
export function createPath(winding: PathWinding = 'nonZero'): Path {
  return { commands: [], data: [], winding };
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
  const k = radius * KAPPA;
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

// Returns the last anchor point written into the path, by scanning the command stream.
// Returns null if the path is empty.
function getPathLastPoint(path: Readonly<Path>): [number, number] | null {
  const commands = path.commands;
  const data = path.data;
  if (commands.length === 0) return null;
  let dataIdx = 0;
  let lastX = 0;
  let lastY = 0;
  let hasPoint = false;
  for (let ci = 0; ci < commands.length; ci++) {
    const cmd = commands[ci];
    if (cmd === PathCommand.MOVE_TO) {
      lastX = data[dataIdx];
      lastY = data[dataIdx + 1];
      hasPoint = true;
      dataIdx += 2;
    } else if (cmd === PathCommand.LINE_TO) {
      lastX = data[dataIdx];
      lastY = data[dataIdx + 1];
      hasPoint = true;
      dataIdx += 2;
    } else if (cmd === PathCommand.WIDE_MOVE_TO) {
      lastX = data[dataIdx + 2];
      lastY = data[dataIdx + 3];
      hasPoint = true;
      dataIdx += 4;
    } else if (cmd === PathCommand.WIDE_LINE_TO) {
      lastX = data[dataIdx + 2];
      lastY = data[dataIdx + 3];
      hasPoint = true;
      dataIdx += 4;
    } else if (cmd === PathCommand.CURVE_TO) {
      lastX = data[dataIdx + 2];
      lastY = data[dataIdx + 3];
      hasPoint = true;
      dataIdx += 4;
    } else if (cmd === PathCommand.CUBIC_CURVE_TO) {
      lastX = data[dataIdx + 4];
      lastY = data[dataIdx + 5];
      hasPoint = true;
      dataIdx += 6;
    }
  }
  return hasPoint ? [lastX, lastY] : null;
}

// Normalizes corner radii for a rounded rectangle, clamping each corner radius to at most half the
// adjacent edge length so corners never overlap. Returns [topLeft, topRight, bottomRight, bottomLeft].
function normalizeCornerRadii(
  radius: number | [number, number, number, number],
  width: number,
  height: number,
): [number, number, number, number] {
  const [rtl, rtr, rbr, rbl] = typeof radius === 'number' ? [radius, radius, radius, radius] : radius;
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

// Optimal cubic Bezier arc approximation constant: 4*(sqrt(2)-1)/3.
// Maximum radial error is < 0.03% of the radius.
const KAPPA = 0.5522847498308936;
