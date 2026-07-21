import { createMatrix, inverseMatrix, matrixTransformBounds } from '@flighthq/geometry';
import type { Camera2D, RectangleLike } from '@flighthq/types';

import { getCamera2DViewMatrix } from './viewMatrix';

// Writes the axis-aligned world rectangle the viewport currently covers into `out` — the conservative
// cull bound that feeds `@flighthq/spatial` / the renderer's cull. Computed by unprojecting the four
// screen corners and taking their world-space bounding box: at zoom 1, rotation 0 this is exact; at
// higher zoom it shrinks (a smaller world region fills the viewport); under rotation it is the
// enclosing AABB of the rotated view, so it over-covers rather than clipping visible content. The
// rectangle is always centered on the camera position `(x, y)`.
export function getCamera2DVisibleBounds(camera: Readonly<Camera2D>, out: RectangleLike): void {
  getCamera2DViewMatrix(camera, scratchMatrix);
  inverseMatrix(scratchInverse, scratchMatrix);
  matrixTransformBounds(out, scratchInverse, 0, 0, camera.viewportWidth, camera.viewportHeight);
}

const scratchInverse = createMatrix();
const scratchMatrix = createMatrix();
