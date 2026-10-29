// Generated from crates/flight-path/src/decimate_path.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { flattenPath } from './flattenPath.ts';
import type { PathRaw } from './path.ts';
import { PathCommand } from './path.ts';

/**
 * Decimates `source` by flattening curves and applying Douglas-Peucker point reduction.
 * Removes points that deviate less than `tolerance` from the decimated line.
 * Alias-safe: `out` may be the same object as `source`.
 */
export function decimatePath(
  source: Readonly<PathRaw>,
  tolerance: number,
  out: PathRaw,
  flattenTolerance?: number,
): void {
  flattenTolerance = flattenTolerance ?? 0.25;
  const contours = flattenPath(source, flattenTolerance);
  out.commands.length = 0;
  out.data.length = 0;
  out.winding = source.winding;
  for (const contour of contours) {
    const n = Math.trunc(contour.length / 2);
    if (n < 2) {
      continue;
    }
    const closed = n >= 3 && contour[0] === contour[contour.length - 2] && contour[1] === contour[contour.length - 1];
    const last = closed ? n - 1 : n;
    let keep = new Array(last).fill(0);
    keep[0] = 1;
    keep[last - 1] = 1;
    douglasPeucker(contour, 0, last - 1, tolerance * tolerance, keep);
    let first = true;
    for (let i = 0; i < last; i += 1) {
      if (keep[i] === 0) {
        continue;
      }
      if (first) {
        out.commands.push(PathCommand.MOVE_TO & 0xff);
        first = false;
      } else {
        out.commands.push(PathCommand.LINE_TO & 0xff);
      }
      out.data.push(contour[i * 2]);
      out.data.push(contour[i * 2 + 1]);
    }
    if (closed) {
      out.commands.push(PathCommand.CLOSE & 0xff);
    }
  }
}

function douglasPeucker(
  pts: Readonly<number[]>,
  first: number,
  last: number,
  toleranceSq: number,
  keep: number[],
): void {
  if (last - first < 2) {
    return;
  }
  const x0 = pts[first * 2];
  const y0 = pts[first * 2 + 1];
  const x1 = pts[last * 2];
  const y1 = pts[last * 2 + 1];
  const dx = x1 - x0;
  const dy = y1 - y0;
  const lenSq = dx * dx + dy * dy;
  let maxDistSq: number = 0.0;
  let maxIdx = first;
  for (let i = first + 1; i < last; i += 1) {
    const px = pts[i * 2];
    const py = pts[i * 2 + 1];
    let distSq;
    if (lenSq === 0.0) {
      const ax = px - x0;
      const ay = py - y0;
      distSq = ax * ax + ay * ay;
    } else {
      const cross = dx * (y0 - py) - dy * (x0 - px);
      distSq = (cross * cross) / lenSq;
    }
    if (distSq > maxDistSq) {
      maxDistSq = distSq;
      maxIdx = i;
    }
  }
  if (maxDistSq > toleranceSq) {
    keep[maxIdx] = 1;
    douglasPeucker(pts, first, maxIdx, toleranceSq, keep);
    douglasPeucker(pts, maxIdx, last, toleranceSq, keep);
  }
}
