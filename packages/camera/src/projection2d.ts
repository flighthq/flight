import { createMatrix, inverseMatrixTransformPointXY, matrixTransformPointXY } from '@flighthq/geometry/contract';
import type { Camera2D, Vector2Like } from '@flighthq/types/contract';

import { getCamera2DViewMatrix } from './viewMatrix.ts';

// Projects a world point to its screen position through the camera's view matrix and writes the
// result to `out` (world -> screen). The inverse is `unprojectCamera2DPoint`.
export function projectCamera2DPoint(
  camera: Readonly<Camera2D>,
  viewportWidth: number,
  viewportHeight: number,
  worldX: number,
  worldY: number,
  out: Vector2Like,
): void {
  getCamera2DViewMatrix(camera, viewportWidth, viewportHeight, scratchMatrix);
  matrixTransformPointXY(out, scratchMatrix, worldX, worldY);
}

// Unprojects a screen point back to the world point that renders there and writes it to `out`
// (screen -> world). Uses the inverse of the camera's view matrix; the exact inverse of
// `projectCamera2DPoint`.
export function unprojectCamera2DPoint(
  camera: Readonly<Camera2D>,
  viewportWidth: number,
  viewportHeight: number,
  screenX: number,
  screenY: number,
  out: Vector2Like,
): void {
  getCamera2DViewMatrix(camera, viewportWidth, viewportHeight, scratchMatrix);
  inverseMatrixTransformPointXY(out, scratchMatrix, screenX, screenY);
}

const scratchMatrix = createMatrix();
