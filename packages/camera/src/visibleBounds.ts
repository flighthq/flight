import { createMatrix, inverseMatrix, matrixTransformBounds } from '@flighthq/geometry/contract';
import type { Camera2D, RectangleLike } from '@flighthq/types/contract';

import { getCamera2DViewMatrix } from './viewMatrix';

// Writes the axis-aligned world rectangle the viewport currently covers into `out` — the conservative
// cull bound that feeds `@flighthq/spatial` / the renderer's cull. Computed by unprojecting the four
// screen corners and taking their world-space bounding box: at zoom 1, rotation 0 this is exact; at
// higher zoom it shrinks (a smaller world region fills the viewport); under rotation it is the
// enclosing AABB of the rotated view, so it over-covers rather than clipping visible content. The
// rectangle is always centered on the camera position `(x, y)`.
//
// A zero `zoom` makes the view matrix singular and it has no inverse, so there is no world rectangle
// to report. `zoom` is deliberately NOT clamped to rescue this: it is a caller-set value, and quietly
// substituting a different one is the kind of hidden correction the SDK does not do. The failure is
// handled HERE instead, and it fails toward drawing — an unbounded rectangle, so the cull excludes
// nothing. The asymmetry is the whole reason: over-drawing is slow and visible, under-drawing is
// silent and wrong, and a cull bound that silently collapses removes content with nothing to point at
// the cause.
export function getCamera2DVisibleBounds(camera: Readonly<Camera2D>, out: RectangleLike): void {
  getCamera2DViewMatrix(camera, scratchMatrix);
  if (!inverseMatrix(scratchInverse, scratchMatrix)) {
    out.x = UNBOUNDED_ORIGIN;
    out.y = UNBOUNDED_ORIGIN;
    out.width = UNBOUNDED_EXTENT;
    out.height = UNBOUNDED_EXTENT;
    degenerateVisibleBoundsGuard?.(camera);
    return;
  }
  matrixTransformBounds(out, scratchInverse, 0, 0, camera.viewportWidth, camera.viewportHeight);
}

// The seam the guard layer installs into; `null` keeps this module free of message text and of any
// dependency on @flighthq/log, so an application that never imports the guards sheds both.
export function setCamera2DVisibleBoundsGuard(guard: ((camera: Readonly<Camera2D>) => void) | null): void {
  degenerateVisibleBoundsGuard = guard;
}

// Finite extremes rather than ±Infinity. With `-Infinity` origin and `Infinity` extent, a max edge is
// `-Infinity + Infinity` = NaN, and every NaN comparison is false — which `intersectsRectangle` happens
// to read as "overlaps", because it is written as the negation of four disjoint tests. That is the
// right answer reached by accident, and only for that one predicate: any cull that compares centers,
// areas, or sorts by extent gets NaN instead. Half of MAX_VALUE keeps `x + width` finite, so ordinary
// arithmetic holds everywhere and the rectangle still encloses any real content.
const UNBOUNDED_EXTENT = Number.MAX_VALUE;
const UNBOUNDED_ORIGIN = -Number.MAX_VALUE / 2;

let degenerateVisibleBoundsGuard: ((camera: Readonly<Camera2D>) => void) | null = null;
const scratchInverse = createMatrix();
const scratchMatrix = createMatrix();
