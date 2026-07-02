import type { Path } from '@flighthq/types';
import { PathCommand } from '@flighthq/types';

import { flattenPath } from './flattenPath';

// Simplifies `source` by flattening curves and applying Douglas-Peucker decimation to each
// contour, removing points that deviate less than `tolerance` from the simplified line. Writes
// the result into `out`. Alias-safe: `out` may be the same object as `source`.
//
// Curves are first flattened (using `flattenTolerance`), then the resulting polylines are
// decimated. Closed contours that end at their start point remain closed in the output.
export function simplifyPath(source: Readonly<Path>, tolerance: number, out: Path, flattenTolerance = 0.25): void {
  const contours = flattenPath(source, flattenTolerance);
  out.commands.length = 0;
  out.data.length = 0;
  out.winding = source.winding;

  for (const contour of contours) {
    const n = contour.length >> 1;
    if (n < 2) continue;

    const closed = n >= 3 && contour[0] === contour[contour.length - 2] && contour[1] === contour[contour.length - 1];
    const last = closed ? n - 1 : n;
    const keep = new Uint8Array(last);
    keep[0] = 1;
    keep[last - 1] = 1;
    douglasPeucker(contour, 0, last - 1, tolerance * tolerance, keep);

    let first = true;
    for (let i = 0; i < last; i++) {
      if (!keep[i]) continue;
      if (first) {
        out.commands.push(PathCommand.MOVE_TO);
        first = false;
      } else {
        out.commands.push(PathCommand.LINE_TO);
      }
      out.data.push(contour[i * 2], contour[i * 2 + 1]);
    }
    if (closed) {
      out.commands.push(PathCommand.CLOSE);
    }
  }
}

function douglasPeucker(
  pts: Readonly<number[]>,
  first: number,
  last: number,
  toleranceSq: number,
  keep: Uint8Array,
): void {
  if (last - first < 2) return;

  const x0 = pts[first * 2];
  const y0 = pts[first * 2 + 1];
  const x1 = pts[last * 2];
  const y1 = pts[last * 2 + 1];
  const dx = x1 - x0;
  const dy = y1 - y0;
  const lenSq = dx * dx + dy * dy;

  let maxDistSq = 0;
  let maxIdx = first;
  for (let i = first + 1; i < last; i++) {
    const px = pts[i * 2];
    const py = pts[i * 2 + 1];
    let distSq: number;
    if (lenSq === 0) {
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
