import type { Path } from '@flighthq/types';
import { PathCommand } from '@flighthq/types';

import { flattenPath } from './flattenPath';

// Cleans `source` by flattening curves and removing redundant vertices from each contour: consecutive
// coincident points within `tolerance`, near-collinear vertices whose perpendicular distance to the line
// through their neighbors is within `tolerance`, and zero-area out-and-back spikes. Writes the result into
// `out`. This is a linear vertex pass (Clipper `CleanPolygons`), not a topological one — it never resolves
// self-intersections into a clean region (that is `simplifyPath` in `@flighthq/path-boolean`, a
// kernel-based operation) and it keeps every vertex that carries shape within `tolerance`, unlike the
// error-bounded Douglas-Peucker reduction of `decimatePath`. Alias-safe: `out` may be the same object as
// `source`. Curves are first flattened using `flattenTolerance`; closed contours stay closed.
export function cleanPath(source: Readonly<Path>, tolerance: number, out: Path, flattenTolerance = 0.25): void {
  const contours = flattenPath(source, flattenTolerance);
  const winding = source.winding;
  const toleranceSq = tolerance * tolerance;
  out.commands.length = 0;
  out.data.length = 0;
  out.winding = winding;

  for (const contour of contours) {
    const n = contour.length >> 1;
    if (n < 2) continue;

    const closed =
      n >= 3 && withinTolerance(contour[0], contour[1], contour[n * 2 - 2], contour[n * 2 - 1], toleranceSq);
    // A closed contour from the flattener repeats its start as an explicit closing vertex; drop it so the
    // seam is cleaned like any other corner rather than left as a duplicate.
    const count = closed ? n - 1 : n;

    const kept: number[] = [];
    for (let i = 0; i < count; i++) pushCleanVertex(kept, contour[i * 2], contour[i * 2 + 1], toleranceSq);
    if (closed) collapseClosedSeam(kept, toleranceSq);

    const keptCount = kept.length >> 1;
    if (closed ? keptCount < 3 : keptCount < 2) continue;

    out.commands.push(PathCommand.MOVE_TO);
    out.data.push(kept[0], kept[1]);
    for (let i = 1; i < keptCount; i++) {
      out.commands.push(PathCommand.LINE_TO);
      out.data.push(kept[i * 2], kept[i * 2 + 1]);
    }
    if (closed) out.commands.push(PathCommand.CLOSE);
  }
}

// Removes vertices from the closed seam that a single forward pass cannot see: the first and last kept
// vertices become interior once the ring wraps, so re-test each against its cyclic neighbors and drop it
// when the neighbors reveal it as coincident, collinear, or a spike. Loops until neither end is removable.
function collapseClosedSeam(kept: number[], toleranceSq: number): void {
  let changed = true;
  while (changed && kept.length >> 1 > 3) {
    changed = false;
    const last = kept.length >> 1;
    // Last vertex, with predecessor (last - 2) and wrap-successor (first).
    if (isMiddleRemovable(kept, last - 2, last - 1, 0, toleranceSq)) {
      kept.length -= 2;
      changed = true;
      continue;
    }
    // First vertex, with wrap-predecessor (last - 1) and successor (index 1).
    if (isMiddleRemovable(kept, last - 1, 0, 1, toleranceSq)) {
      kept.copyWithin(0, 2);
      kept.length -= 2;
      changed = true;
    }
  }
}

// Whether the middle vertex at `mid` is redundant between the outer vertices `prev` and `next` (all three
// given as vertex indices into the flat `kept` list): true when `prev` and `next` coincide (so `mid` is a
// spike tip) or when `mid`'s perpendicular distance to the `prev`-`next` line is within tolerance.
function isMiddleRemovable(
  kept: readonly number[],
  prev: number,
  mid: number,
  next: number,
  toleranceSq: number,
): boolean {
  const px = kept[prev * 2];
  const py = kept[prev * 2 + 1];
  const mx = kept[mid * 2];
  const my = kept[mid * 2 + 1];
  const sx = kept[next * 2];
  const sy = kept[next * 2 + 1];
  return isRedundantMiddle(px, py, mx, my, sx, sy, toleranceSq);
}

// Whether the middle point (mx, my) is redundant between outer points (px, py) and (sx, sy). Coincident
// outer points make the middle a spike tip; otherwise it is redundant when its squared perpendicular
// distance to the outer segment is within tolerance (collapsing both collinear runs and colinear spikes).
function isRedundantMiddle(
  px: number,
  py: number,
  mx: number,
  my: number,
  sx: number,
  sy: number,
  toleranceSq: number,
): boolean {
  const dx = sx - px;
  const dy = sy - py;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq <= toleranceSq) return true;
  const cross = dx * (py - my) - dy * (px - mx);
  return (cross * cross) / lengthSq <= toleranceSq;
}

// Appends (x, y) to the forward-built vertex list, first skipping it as a duplicate of the current last
// vertex, then popping any trailing vertices the new point reveals as redundant (collinear runs and
// spikes collapse here as each following vertex arrives).
function pushCleanVertex(kept: number[], x: number, y: number, toleranceSq: number): void {
  const k = kept.length;
  if (k >= 2 && withinTolerance(kept[k - 2], kept[k - 1], x, y, toleranceSq)) return;
  while (kept.length >= 4) {
    const m = kept.length;
    if (!isRedundantMiddle(kept[m - 4], kept[m - 3], kept[m - 2], kept[m - 1], x, y, toleranceSq)) break;
    kept.length -= 2;
  }
  kept.push(x, y);
}

// Whether two points are within `tolerance` (squared) of each other.
function withinTolerance(ax: number, ay: number, bx: number, by: number, toleranceSq: number): boolean {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy <= toleranceSq;
}
