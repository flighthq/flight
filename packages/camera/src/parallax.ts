import { createMatrix } from '@flighthq/geometry/contract';
import type { Camera2D, Vector2Like } from '@flighthq/types/contract';

import { getCamera2DViewMatrix } from './viewMatrix.ts';

// Writes the screen-space scroll offset for a parallax layer at depth `factor` into `out`.
//
// Convention: the offset is the camera's own screen-space translation (the view matrix translation
// minus the viewport center — i.e. `-L * cameraPosition`, where `L` is the zoom+rotation linear part)
// scaled by `factor`. A layer whose content is drawn relative to the viewport center adds this offset
// to scroll with the camera:
//
//   factor 0   -> (0, 0): the layer is screen-locked (a fixed HUD / far background).
//   factor 1   -> the camera's full screen translation: the layer is world-locked, moving exactly
//                 like the main scene.
//   factor 0.5 -> half the camera translation: the layer drifts at half speed (a mid background).
//
// Accounts for zoom and rotation through the view matrix, so a rotated/zoomed camera yields the
// correctly transformed offset.
export function getCamera2DParallaxPoint(
  camera: Readonly<Camera2D>,
  viewportWidth: number,
  viewportHeight: number,
  factor: number,
  out: Vector2Like,
): void {
  getCamera2DViewMatrix(camera, viewportWidth, viewportHeight, scratchMatrix);
  out.x = (scratchMatrix.tx - viewportWidth * 0.5) * factor;
  out.y = (scratchMatrix.ty - viewportHeight * 0.5) * factor;
}

const scratchMatrix = createMatrix();
