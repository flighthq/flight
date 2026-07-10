import { createMatrix } from '@flighthq/geometry';
import type { Camera2D, Vector2Like } from '@flighthq/types';

import { getCamera2DViewMatrix } from './viewMatrix';

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
export function getCamera2DParallaxPoint(camera: Readonly<Camera2D>, factor: number, out: Vector2Like): void {
  getCamera2DViewMatrix(camera, scratchMatrix);
  out.x = (scratchMatrix.tx - camera.viewportWidth * 0.5) * factor;
  out.y = (scratchMatrix.ty - camera.viewportHeight * 0.5) * factor;
}

const scratchMatrix = createMatrix();
