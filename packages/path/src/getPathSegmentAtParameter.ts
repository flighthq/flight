import type { Path, Vector2Like } from '@flighthq/types';
import { PathCommand } from '@flighthq/types';

// Returns the point at parameter `t` (0..1) on a cubic bezier
// P0 → C1 → C2 → P1 using de Casteljau. Writes into `out`.
export function getCubicBezierPoint(
  x0: number,
  y0: number,
  c1x: number,
  c1y: number,
  c2x: number,
  c2y: number,
  x1: number,
  y1: number,
  t: number,
  out: Vector2Like,
): Vector2Like {
  const u = 1 - t;
  const u2 = u * u;
  const u3 = u2 * u;
  const t2 = t * t;
  const t3 = t2 * t;
  out.x = u3 * x0 + 3 * u2 * t * c1x + 3 * u * t2 * c2x + t3 * x1;
  out.y = u3 * y0 + 3 * u2 * t * c1y + 3 * u * t2 * c2y + t3 * y1;
  return out;
}

// Returns the tangent direction at parameter `t` on a cubic bezier (first derivative).
// B'(t) = 3*(1-t)^2*(C1-P0) + 6*(1-t)*t*(C2-C1) + 3*t^2*(P1-C2).
// Writes into `out`.
export function getCubicBezierTangent(
  x0: number,
  y0: number,
  c1x: number,
  c1y: number,
  c2x: number,
  c2y: number,
  x1: number,
  y1: number,
  t: number,
  out: Vector2Like,
): Vector2Like {
  const u = 1 - t;
  const u2 = u * u;
  const t2 = t * t;
  out.x = 3 * (u2 * (c1x - x0) + 2 * u * t * (c2x - c1x) + t2 * (x1 - c2x));
  out.y = 3 * (u2 * (c1y - y0) + 2 * u * t * (c2y - c1y) + t2 * (y1 - c2y));
  return out;
}

// Evaluates the point at parameter `t` on the n-th segment of `path` (0-indexed, counting
// segments in path-walk order: MOVE_TO does not count as a segment; LINE_TO, CURVE_TO,
// CUBIC_CURVE_TO each count as one). Writes into `out`. Returns `true` on success; `false` if
// `segmentIndex` is out of range.
//
// Parameter t=0 is the segment start; t=1 is the segment end. For a LINE_TO the interpolation
// is linear; for CURVE_TO quadratic; for CUBIC_CURVE_TO cubic.
export function getPathSegmentPointAtParameter(
  path: Readonly<Path>,
  segmentIndex: number,
  t: number,
  out: Vector2Like,
): boolean {
  return walkPathSegment(path, segmentIndex, t, out, false);
}

// Evaluates the tangent direction at parameter `t` on the n-th segment of `path`. The returned
// vector is the first derivative — callers that need a unit tangent should normalize it.
// Returns `true` on success; `false` if `segmentIndex` is out of range.
export function getPathSegmentTangentAtParameter(
  path: Readonly<Path>,
  segmentIndex: number,
  t: number,
  out: Vector2Like,
): boolean {
  return walkPathSegment(path, segmentIndex, t, out, true);
}

// Returns the point at parameter `t` (0..1) on a quadratic bezier defined by (x0,y0) → (cx,cy) → (x1,y1).
// Writes the result into `out` and returns `out`.
export function getQuadraticBezierPoint(
  x0: number,
  y0: number,
  cx: number,
  cy: number,
  x1: number,
  y1: number,
  t: number,
  out: Vector2Like,
): Vector2Like {
  const u = 1 - t;
  out.x = u * u * x0 + 2 * u * t * cx + t * t * x1;
  out.y = u * u * y0 + 2 * u * t * cy + t * t * y1;
  return out;
}

// Returns the tangent direction (not necessarily unit length) at parameter `t` on a quadratic bezier.
// The tangent is the first derivative: B'(t) = 2*(1-t)*(C-P0) + 2*t*(P1-C).
// Writes the result into `out` and returns `out`.
export function getQuadraticBezierTangent(
  x0: number,
  y0: number,
  cx: number,
  cy: number,
  x1: number,
  y1: number,
  t: number,
  out: Vector2Like,
): Vector2Like {
  const u = 1 - t;
  out.x = 2 * (u * (cx - x0) + t * (x1 - cx));
  out.y = 2 * (u * (cy - y0) + t * (y1 - cy));
  return out;
}

// Shared walker: iterates the segment stream and evaluates either the point or the tangent at t
// on the requested segment.
function walkPathSegment(
  path: Readonly<Path>,
  segmentIndex: number,
  t: number,
  out: Vector2Like,
  wantTangent: boolean,
): boolean {
  const commands = path.commands;
  const data = path.data;
  let currentSegment = 0;
  let x = 0;
  let y = 0;
  let di = 0;
  for (let ci = 0; ci < commands.length; ci++) {
    const command = commands[ci];
    if (command === PathCommand.MOVE_TO) {
      x = data[di];
      y = data[di + 1];
      di += 2;
    } else if (command === PathCommand.WIDE_MOVE_TO) {
      x = data[di + 2];
      y = data[di + 3];
      di += 4;
    } else if (command === PathCommand.LINE_TO) {
      const x1 = data[di];
      const y1 = data[di + 1];
      di += 2;
      if (currentSegment === segmentIndex) {
        if (wantTangent) {
          out.x = x1 - x;
          out.y = y1 - y;
        } else {
          out.x = x + t * (x1 - x);
          out.y = y + t * (y1 - y);
        }
        return true;
      }
      x = x1;
      y = y1;
      currentSegment++;
    } else if (command === PathCommand.WIDE_LINE_TO) {
      const x1 = data[di + 2];
      const y1 = data[di + 3];
      di += 4;
      if (currentSegment === segmentIndex) {
        if (wantTangent) {
          out.x = x1 - x;
          out.y = y1 - y;
        } else {
          out.x = x + t * (x1 - x);
          out.y = y + t * (y1 - y);
        }
        return true;
      }
      x = x1;
      y = y1;
      currentSegment++;
    } else if (command === PathCommand.CURVE_TO) {
      const cx = data[di];
      const cy = data[di + 1];
      const x1 = data[di + 2];
      const y1 = data[di + 3];
      di += 4;
      if (currentSegment === segmentIndex) {
        if (wantTangent) {
          getQuadraticBezierTangent(x, y, cx, cy, x1, y1, t, out);
        } else {
          getQuadraticBezierPoint(x, y, cx, cy, x1, y1, t, out);
        }
        return true;
      }
      x = x1;
      y = y1;
      currentSegment++;
    } else if (command === PathCommand.CUBIC_CURVE_TO) {
      const c1x = data[di];
      const c1y = data[di + 1];
      const c2x = data[di + 2];
      const c2y = data[di + 3];
      const x1 = data[di + 4];
      const y1 = data[di + 5];
      di += 6;
      if (currentSegment === segmentIndex) {
        if (wantTangent) {
          getCubicBezierTangent(x, y, c1x, c1y, c2x, c2y, x1, y1, t, out);
        } else {
          getCubicBezierPoint(x, y, c1x, c1y, c2x, c2y, x1, y1, t, out);
        }
        return true;
      }
      x = x1;
      y = y1;
      currentSegment++;
    } else if (command === PathCommand.CLOSE) {
      // CLOSE is not a parametric segment.
    }
  }
  return false;
}
