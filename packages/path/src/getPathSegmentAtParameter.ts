// Generated from crates/flight-path/src/get_path_segment_at_parameter.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import type { Vector2Like } from '@flighthq/geometry/contract';

import type { PathRaw } from './path.ts';
import { PathCommand } from './path.ts';

/**
 * Returns the signed curvature at parameter `t` on a cubic bezier.
 */
export function getCubicBezierCurvature(
  x0: number,
  y0: number,
  c1x: number,
  c1y: number,
  c2x: number,
  c2y: number,
  x1: number,
  y1: number,
  t: number,
): number {
  const u = 1.0 - t;
  const u2 = u * u;
  const t2 = t * t;
  const dx = 3.0 * (u2 * (c1x - x0) + 2.0 * u * t * (c2x - c1x) + t2 * (x1 - c2x));
  const dy = 3.0 * (u2 * (c1y - y0) + 2.0 * u * t * (c2y - c1y) + t2 * (y1 - c2y));
  const ddx = 6.0 * (u * (c2x - 2.0 * c1x + x0) + t * (x1 - 2.0 * c2x + c1x));
  const ddy = 6.0 * (u * (c2y - 2.0 * c1y + y0) + t * (y1 - 2.0 * c2y + c1y));
  const cross = dx * ddy - dy * ddx;
  const speed2 = dx * dx + dy * dy;
  const speed = Math.sqrt(speed2);
  if (speed === 0.0) {
    return 0.0;
  }
  return cross / (speed2 * speed);
}

/**
 * Returns the point at parameter `t` on a cubic bezier. Writes into `out`.
 */
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
): void {
  const u = 1.0 - t;
  const u2 = u * u;
  const u3 = u2 * u;
  const t2 = t * t;
  const t3 = t2 * t;
  out.x = u3 * x0 + 3.0 * u2 * t * c1x + 3.0 * u * t2 * c2x + t3 * x1;
  out.y = u3 * y0 + 3.0 * u2 * t * c1y + 3.0 * u * t2 * c2y + t3 * y1;
}

/**
 * Returns the tangent direction at parameter `t` on a cubic bezier. Writes into `out`.
 */
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
): void {
  const u = 1.0 - t;
  const u2 = u * u;
  const t2 = t * t;
  out.x = 3.0 * (u2 * (c1x - x0) + 2.0 * u * t * (c2x - c1x) + t2 * (x1 - c2x));
  out.y = 3.0 * (u2 * (c1y - y0) + 2.0 * u * t * (c2y - c1y) + t2 * (y1 - c2y));
}

/**
 * Returns the signed curvature at parameter `t` on the n-th segment of `path`.
 * Returns `undefined` if `segmentIndex` is out of range.
 */
export function getPathSegmentCurvatureAtParameter(
  path: Readonly<PathRaw>,
  segmentIndex: number,
  t: number,
): number | null {
  return walkPathSegmentCurvature(path, segmentIndex, t) ?? null;
}

/**
 * Evaluates the point at parameter `t` on the n-th segment of `path`.
 * Returns `true` on success; `false` if `segmentIndex` is out of range.
 */
export function getPathSegmentPointAtParameter(
  path: Readonly<PathRaw>,
  segmentIndex: number,
  t: number,
  out: Vector2Like,
): boolean {
  return walkPathSegment(path, segmentIndex, t, out, false);
}

/**
 * Evaluates the tangent direction at parameter `t` on the n-th segment of `path`.
 * Returns `true` on success; `false` if `segmentIndex` is out of range.
 */
export function getPathSegmentTangentAtParameter(
  path: Readonly<PathRaw>,
  segmentIndex: number,
  t: number,
  out: Vector2Like,
): boolean {
  return walkPathSegment(path, segmentIndex, t, out, true);
}

/**
 * Returns the signed curvature at parameter `t` on a quadratic bezier.
 */
export function getQuadraticBezierCurvature(
  x0: number,
  y0: number,
  cx: number,
  cy: number,
  x1: number,
  y1: number,
  t: number,
): number {
  const u = 1.0 - t;
  const dx = 2.0 * (u * (cx - x0) + t * (x1 - cx));
  const dy = 2.0 * (u * (cy - y0) + t * (y1 - cy));
  const ddx = 2.0 * (x1 - 2.0 * cx + x0);
  const ddy = 2.0 * (y1 - 2.0 * cy + y0);
  const cross = dx * ddy - dy * ddx;
  const speed2 = dx * dx + dy * dy;
  const speed = Math.sqrt(speed2);
  if (speed === 0.0) {
    return 0.0;
  }
  return cross / (speed2 * speed);
}

/**
 * Returns the point at parameter `t` on a quadratic bezier. Writes into `out`.
 */
export function getQuadraticBezierPoint(
  x0: number,
  y0: number,
  cx: number,
  cy: number,
  x1: number,
  y1: number,
  t: number,
  out: Vector2Like,
): void {
  const u = 1.0 - t;
  out.x = u * u * x0 + 2.0 * u * t * cx + t * t * x1;
  out.y = u * u * y0 + 2.0 * u * t * cy + t * t * y1;
}

/**
 * Returns the tangent direction at parameter `t` on a quadratic bezier. Writes into `out`.
 */
export function getQuadraticBezierTangent(
  x0: number,
  y0: number,
  cx: number,
  cy: number,
  x1: number,
  y1: number,
  t: number,
  out: Vector2Like,
): void {
  const u = 1.0 - t;
  out.x = 2.0 * (u * (cx - x0) + t * (x1 - cx));
  out.y = 2.0 * (u * (cy - y0) + t * (y1 - cy));
}

function walkPathSegment(
  path: Readonly<PathRaw>,
  segmentIndex: number,
  t: number,
  out: Vector2Like,
  wantTangent: boolean,
): boolean {
  const commands = path.commands;
  const data = path.data;
  let currentSegment: number = 0;
  let x: number = 0.0;
  let y: number = 0.0;
  let di: number = 0;
  for (let ci = 0; ci < commands.length; ci += 1) {
    const command = commands[ci];
    if (command === (PathCommand.MOVE_TO & 0xff)) {
      x = data[di];
      y = data[di + 1];
      di += 2;
    } else {
      if (command === (PathCommand.WIDE_MOVE_TO & 0xff)) {
        x = data[di + 2];
        y = data[di + 3];
        di += 4;
      } else {
        if (command === (PathCommand.LINE_TO & 0xff)) {
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
          currentSegment += 1;
        } else {
          if (command === (PathCommand.WIDE_LINE_TO & 0xff)) {
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
            currentSegment += 1;
          } else {
            if (command === (PathCommand.QUADRATIC_CURVE_TO & 0xff)) {
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
              currentSegment += 1;
            } else {
              if (command === (PathCommand.CUBIC_CURVE_TO & 0xff)) {
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
                currentSegment += 1;
              }
            }
          }
        }
      }
    }
  }
  return false;
}

function walkPathSegmentCurvature(path: Readonly<PathRaw>, segmentIndex: number, t: number): number | undefined {
  const commands = path.commands;
  const data = path.data;
  let currentSegment: number = 0;
  let x: number = 0.0;
  let y: number = 0.0;
  let di: number = 0;
  for (let ci = 0; ci < commands.length; ci += 1) {
    const command = commands[ci];
    if (command === (PathCommand.MOVE_TO & 0xff)) {
      x = data[di];
      y = data[di + 1];
      di += 2;
    } else {
      if (command === (PathCommand.WIDE_MOVE_TO & 0xff)) {
        x = data[di + 2];
        y = data[di + 3];
        di += 4;
      } else {
        if (command === (PathCommand.LINE_TO & 0xff)) {
          di += 2;
          if (currentSegment === segmentIndex) {
            return 0.0;
          }
          x = data[di - 2];
          y = data[di - 1];
          currentSegment += 1;
        } else {
          if (command === (PathCommand.WIDE_LINE_TO & 0xff)) {
            di += 4;
            if (currentSegment === segmentIndex) {
              return 0.0;
            }
            x = data[di - 2];
            y = data[di - 1];
            currentSegment += 1;
          } else {
            if (command === (PathCommand.QUADRATIC_CURVE_TO & 0xff)) {
              const cx = data[di];
              const cy = data[di + 1];
              const x1 = data[di + 2];
              const y1 = data[di + 3];
              di += 4;
              if (currentSegment === segmentIndex) {
                return getQuadraticBezierCurvature(x, y, cx, cy, x1, y1, t);
              }
              x = x1;
              y = y1;
              currentSegment += 1;
            } else {
              if (command === (PathCommand.CUBIC_CURVE_TO & 0xff)) {
                const c1x = data[di];
                const c1y = data[di + 1];
                const c2x = data[di + 2];
                const c2y = data[di + 3];
                const x1 = data[di + 4];
                const y1 = data[di + 5];
                di += 6;
                if (currentSegment === segmentIndex) {
                  return getCubicBezierCurvature(x, y, c1x, c1y, c2x, c2y, x1, y1, t);
                }
                x = x1;
                y = y1;
                currentSegment += 1;
              }
            }
          }
        }
      }
    }
  }
  return undefined;
}
