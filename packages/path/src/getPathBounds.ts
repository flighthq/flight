import type { Path, RectangleLike } from '@flighthq/types';
import { PathCommand } from '@flighthq/types';

// Computes the axis-aligned bounding rectangle of `path` including true bezier extrema (not just
// control-point hull). Writes the result into `out`. Returns `true` if the path contains any
// geometry; returns `false` and sets `out` to an empty zero-rectangle for an empty path.
//
// Extrema for cubic beziers are found by solving the derivative equations B'(t)=0 (a quadratic in
// t); only roots in [0,1] are included. Quadratic bezier extrema use a single linear root.
export function getPathBounds(path: Readonly<Path>, out: RectangleLike): boolean {
  const commands = path.commands;
  const data = path.data;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let x = 0;
  let y = 0;
  let di = 0;
  const expand = (px: number, py: number) => {
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  };
  for (let ci = 0; ci < commands.length; ci++) {
    const command = commands[ci];
    if (command === PathCommand.MOVE_TO) {
      x = data[di];
      y = data[di + 1];
      di += 2;
      expand(x, y);
    } else if (command === PathCommand.WIDE_MOVE_TO) {
      x = data[di + 2];
      y = data[di + 3];
      di += 4;
      expand(x, y);
    } else if (command === PathCommand.LINE_TO) {
      const nx = data[di];
      const ny = data[di + 1];
      di += 2;
      expand(nx, ny);
      x = nx;
      y = ny;
    } else if (command === PathCommand.WIDE_LINE_TO) {
      const nx = data[di + 2];
      const ny = data[di + 3];
      di += 4;
      expand(nx, ny);
      x = nx;
      y = ny;
    } else if (command === PathCommand.CURVE_TO) {
      const cx = data[di];
      const cy = data[di + 1];
      const ax = data[di + 2];
      const ay = data[di + 3];
      di += 4;
      expandQuadraticBounds(x, y, cx, cy, ax, ay, expand);
      x = ax;
      y = ay;
    } else if (command === PathCommand.CUBIC_CURVE_TO) {
      const c1x = data[di];
      const c1y = data[di + 1];
      const c2x = data[di + 2];
      const c2y = data[di + 3];
      const ax = data[di + 4];
      const ay = data[di + 5];
      di += 6;
      expandCubicBounds(x, y, c1x, c1y, c2x, c2y, ax, ay, expand);
      x = ax;
      y = ay;
    }
    // CLOSE, NO_OP, and unrecognized verbs consume no data and do not affect bounds.
  }
  if (minX === Infinity) {
    out.x = 0;
    out.y = 0;
    out.width = 0;
    out.height = 0;
    return false;
  }
  out.x = minX;
  out.y = minY;
  out.width = maxX - minX;
  out.height = maxY - minY;
  return true;
}

// Calls `cb` for each root t ∈ (0,1) of the cubic derivative B'(t) = 0 along one axis.
function cubicExtremumRoots(p0: number, p1: number, p2: number, p3: number, cb: (t: number) => void): void {
  // Quadratic coefficients of the derivative (after dividing out the factor of 3).
  const a = -p0 + 3 * p1 - 3 * p2 + p3;
  const b = 2 * (p0 - 2 * p1 + p2);
  const c = p1 - p0;
  if (Math.abs(a) < 1e-12) {
    // Degenerate to linear: b*t + c = 0
    if (Math.abs(b) < 1e-12) return;
    const t = -c / b;
    if (t > 0 && t < 1) cb(t);
    return;
  }
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return;
  const sqrtD = Math.sqrt(discriminant);
  const t1 = (-b + sqrtD) / (2 * a);
  const t2 = (-b - sqrtD) / (2 * a);
  if (t1 > 0 && t1 < 1) cb(t1);
  if (t2 > 0 && t2 < 1 && Math.abs(t2 - t1) > 1e-12) cb(t2);
}

function evalCubic(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const mt = 1 - t;
  return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
}

function evalQuadratic(p0: number, p1: number, p2: number, t: number): number {
  const mt = 1 - t;
  return mt * mt * p0 + 2 * mt * t * p1 + t * t * p2;
}

// Expands `expand` with the bounding extrema of a cubic bezier from (x0,y0) to (x3,y3).
// Extrema found by solving the quadratic B'(t) = 0 for each axis; only roots in (0,1) included.
function expandCubicBounds(
  x0: number,
  y0: number,
  c1x: number,
  c1y: number,
  c2x: number,
  c2y: number,
  x3: number,
  y3: number,
  expand: (px: number, py: number) => void,
): void {
  expand(x3, y3);
  // B'(t) coefficients for one axis: at^2 + bt + c = 0
  // a = 3*(-P0 + 3P1 - 3P2 + P3)
  // b = 6*(P0 - 2P1 + P2)
  // c = 3*(P1 - P0)
  cubicExtremumRoots(x0, c1x, c2x, x3, (t) => {
    expand(evalCubic(x0, c1x, c2x, x3, t), evalCubic(y0, c1y, c2y, y3, t));
  });
  cubicExtremumRoots(y0, c1y, c2y, y3, (t) => {
    expand(evalCubic(x0, c1x, c2x, x3, t), evalCubic(y0, c1y, c2y, y3, t));
  });
}

// Expands `expand` with the bounding extrema of a quadratic bezier from (x0,y0) to (x2,y2) with
// control point (cx,cy). The extreme point along each axis (if it lies in [0,1]) is evaluated.
function expandQuadraticBounds(
  x0: number,
  y0: number,
  cx: number,
  cy: number,
  x2: number,
  y2: number,
  expand: (px: number, py: number) => void,
): void {
  // The endpoint is always included; include the start of the segment via the caller.
  expand(x2, y2);
  // B(t) = (1-t)^2*P0 + 2t(1-t)*P1 + t^2*P2
  // B'(t) = 2(1-t)*(P1-P0) + 2t*(P2-P1) = 0 → t = (P0-P1) / (P0 - 2*P1 + P2)
  const tx = quadraticExtremumT(x0, cx, x2);
  if (tx !== null) expand(evalQuadratic(x0, cx, x2, tx), evalQuadratic(y0, cy, y2, tx));
  const ty = quadraticExtremumT(y0, cy, y2);
  if (ty !== null) expand(evalQuadratic(x0, cx, x2, ty), evalQuadratic(y0, cy, y2, ty));
}

// Returns the parameter t in (0,1) at which the quadratic bezier coordinate has its extremum,
// or null if the denominator is zero (linear segment in that axis) or t is outside (0,1).
function quadraticExtremumT(p0: number, p1: number, p2: number): number | null {
  const denom = p0 - 2 * p1 + p2;
  if (denom === 0) return null;
  const t = (p0 - p1) / denom;
  return t > 0 && t < 1 ? t : null;
}
