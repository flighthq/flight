// Generated from crates/flight-path/src/get_path_bounds.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import type { RectangleLike } from '@flighthq/geometry/contract';

import type { PathRaw } from './path.ts';
import { PathCommand } from './path.ts';

/**
 * The running min/max extent of the points visited by the bounds pass.
 */
interface BoundsAccumulator {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * The parameters in (0, 1) where one axis of a cubic bezier has a local extremum, in the order the
 * bounds pass visits them.
 */
function cubicExtremumRoots(p0: number, p1: number, p2: number, p3: number): number[] {
  let roots: number[] = [] as never[];
  const a = -p0 + 3.0 * p1 - 3.0 * p2 + p3;
  const b = 2.0 * (p0 - 2.0 * p1 + p2);
  const c = p1 - p0;
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) < 1e-12) {
      return roots;
    }
    const t = -c / b;
    if (t > 0.0 && t < 1.0) {
      roots.push(t);
    }
    return roots;
  }
  const discriminant = b * b - 4.0 * a * c;
  if (discriminant < 0.0) {
    return roots;
  }
  const sqrtD = Math.sqrt(discriminant);
  const t1 = (-b + sqrtD) / (2.0 * a);
  const t2 = (-b - sqrtD) / (2.0 * a);
  if (t1 > 0.0 && t1 < 1.0) {
    roots.push(t1);
  }
  if (t2 > 0.0 && t2 < 1.0 && Math.abs(t2 - t1) > 1e-12) {
    roots.push(t2);
  }
  return roots;
}

function evalCubic(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const mt = 1.0 - t;
  return mt * mt * mt * p0 + 3.0 * mt * mt * t * p1 + 3.0 * mt * t * t * p2 + t * t * t * p3;
}

function evalQuadratic(p0: number, p1: number, p2: number, t: number): number {
  const mt = 1.0 - t;
  return mt * mt * p0 + 2.0 * mt * t * p1 + t * t * p2;
}

function expandCubicBounds(
  x0: number,
  y0: number,
  c1x: number,
  c1y: number,
  c2x: number,
  c2y: number,
  x3: number,
  y3: number,
  bounds: BoundsAccumulator,
): void {
  expandBounds(bounds, x3, y3);
  const xRoots = cubicExtremumRoots(x0, c1x, c2x, x3);
  for (const t of xRoots) {
    expandBounds(bounds, evalCubic(x0, c1x, c2x, x3, t), evalCubic(y0, c1y, c2y, y3, t));
  }
  const yRoots = cubicExtremumRoots(y0, c1y, c2y, y3);
  for (const t of yRoots) {
    expandBounds(bounds, evalCubic(x0, c1x, c2x, x3, t), evalCubic(y0, c1y, c2y, y3, t));
  }
}

function expandBounds(bounds: BoundsAccumulator, px: number, py: number): void {
  if (px < bounds.minX) {
    bounds.minX = px;
  }
  if (px > bounds.maxX) {
    bounds.maxX = px;
  }
  if (py < bounds.minY) {
    bounds.minY = py;
  }
  if (py > bounds.maxY) {
    bounds.maxY = py;
  }
}

function expandQuadraticBounds(
  x0: number,
  y0: number,
  cx: number,
  cy: number,
  x2: number,
  y2: number,
  bounds: BoundsAccumulator,
): void {
  expandBounds(bounds, x2, y2);
  const tx = quadraticExtremumT(x0, cx, x2);
  if (tx !== undefined) {
    const t = tx;
    expandBounds(bounds, evalQuadratic(x0, cx, x2, t), evalQuadratic(y0, cy, y2, t));
  }
  const ty = quadraticExtremumT(y0, cy, y2);
  if (ty !== undefined) {
    const t = ty;
    expandBounds(bounds, evalQuadratic(x0, cx, x2, t), evalQuadratic(y0, cy, y2, t));
  }
}

/**
 * Computes the axis-aligned bounding rectangle of `path` including true bezier extrema.
 * Writes the result into `out`. Returns `true` if the path contains any geometry;
 * returns `false` and sets `out` to an empty zero-rectangle for an empty path.
 */
export function getPathBounds(path: Readonly<PathRaw>, out: RectangleLike): boolean {
  const commands = path.commands;
  const data = path.data;
  let bounds = {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  };
  let x: number = 0.0;
  let y: number = 0.0;
  let di: number = 0;
  for (let ci = 0; ci < commands.length; ci += 1) {
    const command = commands[ci];
    if (command === PathCommand.MOVE_TO) {
      const nx = data[di];
      const ny = data[di + 1];
      di += 2;
      expandBounds(bounds, nx, ny);
      x = nx;
      y = ny;
    } else {
      if (command === PathCommand.WIDE_MOVE_TO) {
        const nx = data[di + 2];
        const ny = data[di + 3];
        di += 4;
        expandBounds(bounds, nx, ny);
        x = nx;
        y = ny;
      } else {
        if (command === PathCommand.LINE_TO) {
          const nx = data[di];
          const ny = data[di + 1];
          di += 2;
          expandBounds(bounds, nx, ny);
          x = nx;
          y = ny;
        } else {
          if (command === PathCommand.WIDE_LINE_TO) {
            const nx = data[di + 2];
            const ny = data[di + 3];
            di += 4;
            expandBounds(bounds, nx, ny);
            x = nx;
            y = ny;
          } else {
            if (command === PathCommand.QUADRATIC_CURVE_TO) {
              const cx = data[di];
              const cy = data[di + 1];
              const ax = data[di + 2];
              const ay = data[di + 3];
              di += 4;
              expandQuadraticBounds(x, y, cx, cy, ax, ay, bounds);
              x = ax;
              y = ay;
            } else {
              if (command === PathCommand.CUBIC_CURVE_TO) {
                const c1x = data[di];
                const c1y = data[di + 1];
                const c2x = data[di + 2];
                const c2y = data[di + 3];
                const ax = data[di + 4];
                const ay = data[di + 5];
                di += 6;
                expandCubicBounds(x, y, c1x, c1y, c2x, c2y, ax, ay, bounds);
                x = ax;
                y = ay;
              }
            }
          }
        }
      }
    }
  }
  if (bounds.minX === Number.POSITIVE_INFINITY) {
    out.x = 0.0;
    out.y = 0.0;
    out.width = 0.0;
    out.height = 0.0;
    return false;
  }
  out.x = bounds.minX;
  out.y = bounds.minY;
  out.width = bounds.maxX - bounds.minX;
  out.height = bounds.maxY - bounds.minY;
  return true;
}

function quadraticExtremumT(p0: number, p1: number, p2: number): number | undefined {
  const denom = p0 - 2.0 * p1 + p2;
  if (denom === 0.0) {
    return undefined;
  }
  const t = (p0 - p1) / denom;
  if (t > 0.0 && t < 1.0) {
    return t;
  }
  return undefined;
}
