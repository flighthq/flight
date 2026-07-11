import { createVector2 } from '@flighthq/geometry';
import type { Camera2D } from '@flighthq/types';

import { unprojectCamera2DPoint } from './projection';

// Sets the camera's `zoom` while keeping the world point currently under `(screenX, screenY)` fixed
// on screen (zoom-to-cursor). Because the view's linear part depends only on zoom and rotation (not
// position), the world point under a screen point shifts by exactly the change in the camera's
// position offset when zoom changes; re-centering the camera by that shift pins the point.
//
// Reads the pre-zoom world point, applies the new zoom, then adjusts `x`/`y` by the difference so the
// same screen point unprojects to the same world point as before.
export function zoomCamera2DAtScreenPoint(camera: Camera2D, screenX: number, screenY: number, zoom: number): void {
  unprojectCamera2DPoint(camera, screenX, screenY, scratchBefore);
  camera.zoom = zoom;
  unprojectCamera2DPoint(camera, screenX, screenY, scratchAfter);
  camera.x += scratchBefore.x - scratchAfter.x;
  camera.y += scratchBefore.y - scratchAfter.y;
}

const scratchAfter = createVector2();
const scratchBefore = createVector2();
