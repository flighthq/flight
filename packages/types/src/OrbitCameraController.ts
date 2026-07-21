import type { Vector3 } from './Vector3';
import type { Vector3Like } from './Vector3';

// A stateful orbit (arcball) camera controller: plain data holding spherical coordinates around a
// `target` point. Intent verbs (`orbitCameraController`/`dollyCameraController`/`panCameraController`)
// move the *goal* coordinates; `updateOrbitCameraController` eases the current coordinates toward the
// goal each step and writes the resulting eye position into a pure `Camera3D` view matrix (look-at).
// The controller never reads raw input — the app maps pointer/wheel to the verbs — so it stays
// input-agnostic and headless-testable. Angles are radians: `azimuth` orbits horizontally, `polar` is
// measured from the horizon and clamped to [`minPolar`, `maxPolar`] (kept just inside ±90° so the
// look-at up vector never degenerates); `distance` is clamped to [`minDistance`, `maxDistance`].
// `smoothTime` is the `@flighthq/math` `damp` time constant; <= 0 snaps.
export interface OrbitCameraController {
  azimuth: number;
  distance: number;
  goalAzimuth: number;
  goalDistance: number;
  goalPolar: number;
  maxDistance: number;
  maxPolar: number;
  minDistance: number;
  minPolar: number;
  polar: number;
  smoothTime: number;
  target: Vector3;
}

// Structural inputs for `createOrbitCameraController`. Every field is optional; omitted fields take
// the documented defaults.
export interface OrbitCameraControllerOptions {
  azimuth?: number;
  distance?: number;
  maxDistance?: number;
  maxPolar?: number;
  minDistance?: number;
  minPolar?: number;
  polar?: number;
  smoothTime?: number;
  target?: Readonly<Vector3Like>;
}
