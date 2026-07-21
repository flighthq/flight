import type { Rectangle } from './Rectangle';

// 2D game-camera header. `@flighthq/camera2d` operates on this plain-data camera to produce the
// world<->screen transform, follow a target with a deadzone and frame-rate-independent smoothing,
// clamp to world bounds, compute parallax-layer offsets, and report the visible world rectangle for
// culling. It is the seam between a 2D game's world coordinates and what the renderer draws.
//
// `(x, y)` is the world point rendered at the CENTER of the viewport (center-anchored, the game-
// camera norm). `zoom` > 1 magnifies (a smaller world region fills the viewport); `zoom` < 1 zooms
// out. `rotation` is in radians and rotates the camera counter-clockwise about its center, so the
// world appears to rotate clockwise on screen. `viewportWidth`/`viewportHeight` are the drawable
// surface size in device pixels. Distinct from `Camera3D` (the 3D perspective/orthographic camera).
export interface Camera2D {
  rotation: number;
  viewportHeight: number;
  viewportWidth: number;
  x: number;
  y: number;
  zoom: number;
}

// Optional target-follow parameters for `updateCamera2DFollow`. All fields are optional; an omitted
// field takes its neutral default.
//
// `deadzoneHalfWidth`/`deadzoneHalfHeight` are the half-extents (world units) of a box centered on
// the camera: the target moves freely inside it and the camera only begins tracking once the target
// crosses an edge, at which point the camera moves the minimum needed to keep the target on the
// deadzone edge. Both default to 0 (the camera centers exactly on the target). `smoothTime` is the
// exponential-smoothing time constant in seconds passed to `@flighthq/math`'s `damp` (larger = more
// lag); 0 snaps the camera to its goal each step. `worldBounds`, when given, clamps the camera so
// the visible world rectangle (`getCamera2DVisibleBounds`) stays inside the level; a bound smaller
// than the view on an axis centers the camera on that axis.
export interface Camera2DFollowOptions {
  deadzoneHalfHeight?: number;
  deadzoneHalfWidth?: number;
  smoothTime?: number;
  worldBounds?: Readonly<Rectangle>;
}

// Optional overrides for `createCamera2D`. Omitted fields take their identity defaults
// (`x` = `y` = 0, `zoom` = 1, `rotation` = 0).
export interface Camera2DOptions {
  rotation?: number;
  x?: number;
  y?: number;
  zoom?: number;
}
