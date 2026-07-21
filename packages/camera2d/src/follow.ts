import { createRectangle } from '@flighthq/geometry';
import { clamp, damp } from '@flighthq/math';
import type { Camera2D, Camera2DFollowOptions } from '@flighthq/types';

import { getCamera2DVisibleBounds } from './visibleBounds';

// Moves the camera toward a follow target for one step, mutating `camera` in place.
//
// Three composed stages: (1) a deadzone box (half-extents around the camera center) yields a goal
// position — inside the box the goal is the current position (no motion); once the target crosses an
// edge the goal moves the minimum needed to keep the target on that edge. (2) The camera is smoothed
// toward the goal with `@flighthq/math`'s `damp` using `smoothTime` as the time constant, so motion
// is frame-rate independent; `smoothTime` <= 0 (or `deltaTime` <= 0) snaps to the goal. (3) If
// `worldBounds` is given, the camera is clamped so the visible world rectangle stays inside the
// level, centering on any axis where the level is smaller than the view.
//
// Camera3D inputs are read into locals before any write, so passing the same camera as target source is
// safe. The deadzone box is axis-aligned in world space (it aligns with the view only when
// `rotation` is 0).
export function updateCamera2DFollow(
  camera: Camera2D,
  targetX: number,
  targetY: number,
  deltaTime: number,
  options?: Readonly<Camera2DFollowOptions>,
): void {
  const camX = camera.x;
  const camY = camera.y;
  const deadHalfW = options?.deadzoneHalfWidth ?? 0;
  const deadHalfH = options?.deadzoneHalfHeight ?? 0;
  const smoothTime = options?.smoothTime ?? 0;
  const worldBounds = options?.worldBounds;

  const dx = targetX - camX;
  let goalX = camX;
  if (dx > deadHalfW) goalX = targetX - deadHalfW;
  else if (dx < -deadHalfW) goalX = targetX + deadHalfW;

  const dy = targetY - camY;
  let goalY = camY;
  if (dy > deadHalfH) goalY = targetY - deadHalfH;
  else if (dy < -deadHalfH) goalY = targetY + deadHalfH;

  let nextX: number;
  let nextY: number;
  if (smoothTime > 0 && deltaTime > 0) {
    const lambda = 1 / smoothTime;
    nextX = damp(camX, goalX, lambda, deltaTime);
    nextY = damp(camY, goalY, lambda, deltaTime);
  } else {
    nextX = goalX;
    nextY = goalY;
  }

  if (worldBounds) {
    // The visible-bounds size is independent of camera position, so it is safe to read before the
    // camera moves; the rectangle is centered on the camera, so clamping the center by its half-
    // extents keeps the visible rect inside the level.
    getCamera2DVisibleBounds(camera, scratchBounds);
    const halfVisW = scratchBounds.width * 0.5;
    const halfVisH = scratchBounds.height * 0.5;
    if (worldBounds.width <= scratchBounds.width) {
      nextX = worldBounds.x + worldBounds.width * 0.5;
    } else {
      nextX = clamp(nextX, worldBounds.x + halfVisW, worldBounds.x + worldBounds.width - halfVisW);
    }
    if (worldBounds.height <= scratchBounds.height) {
      nextY = worldBounds.y + worldBounds.height * 0.5;
    } else {
      nextY = clamp(nextY, worldBounds.y + halfVisH, worldBounds.y + worldBounds.height - halfVisH);
    }
  }

  camera.x = nextX;
  camera.y = nextY;
}

const scratchBounds = createRectangle();
