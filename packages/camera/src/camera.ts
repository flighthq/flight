import { createEntity } from '@flighthq/entity';
import { createMatrix4, createVector2, inverseMatrix4, multiplyMatrix4, setMatrix4LookAt } from '@flighthq/geometry';
import type { Camera, Matrix4Like, Projection, Vector3Like } from '@flighthq/types';

import { setProjectionMatrix4 } from './projection';

// Allocates a 3D camera. The camera stores its projection descriptor, a world->view Matrix4
// (`view`, initialized to identity), the clip-plane distances `near`/`far`, the per-frame
// sub-pixel NDC `jitter` (consumed by TAA, initialized to zero), and a cached
// `inverseViewProjection` (consumed by TAA / velocity / fog / depth-of-field, initialized to
// identity). The view matrix is canonical: the camera has no separate Transform3D — a Matrix4 is
// the only world->view representation.
export function createCamera(opts: Readonly<CameraOptions>): Camera {
  return createEntity({
    far: opts.far,
    inverseViewProjection: createMatrix4(),
    jitter: createVector2(0, 0),
    near: opts.near,
    projection: opts.projection,
    view: createMatrix4(),
  });
}

// Writes the inverse of the camera's view-projection matrix into `out` and returns true, or
// returns false (writing NaN into `out`) when the view-projection is non-invertible. `aspect`
// is the viewport width / height. This is the matrix the existing TAA / velocity / fog /
// depth-of-field effects consume to reconstruct world position from NDC.
//
// Reads camera fields into a scratch matrix before writing `out`, so it is safe even if `out`
// aliases the camera's own `inverseViewProjection` or `view`. Use
// `updateCameraInverseViewProjection` instead to safely update the cached field.
export function getCameraInverseViewProjectionMatrix4(
  out: Matrix4Like,
  camera: Readonly<Camera>,
  aspect: number,
): boolean {
  getCameraViewProjectionMatrix4(__scratchViewProjection, camera, aspect);
  return inverseMatrix4(out, __scratchViewProjection);
}

// Writes the camera's view-projection matrix (projection × view) into `out`. `aspect` is the
// viewport width / height, applied to a perspective projection. `near`/`far` are taken from the
// camera.
//
// Reads camera fields into a scratch matrix before writing `out`, so it is safe even if `out`
// aliases the camera's own `view`.
export function getCameraViewProjectionMatrix4(out: Matrix4Like, camera: Readonly<Camera>, aspect: number): void {
  setProjectionMatrix4(__scratchProjection, camera.projection, aspect, camera.near, camera.far);
  multiplyMatrix4(out, __scratchProjection, camera.view);
}

// Sets the viewport aspect ratio (width / height) on the camera's projection, in place. For a
// perspective projection this writes `aspect` directly; for an orthographic projection it widens
// the view volume to match — keeping `halfHeight` and setting `halfWidth = halfHeight * aspect`,
// so the vertical extent is preserved as the viewport resizes. The authored counterpart to the
// `aspect` argument `getCameraViewProjectionMatrix4` takes: set it once on resize rather than
// reaching into `camera.projection` with a cast.
export function setCameraAspect(camera: Camera, aspect: number): void {
  const projection = camera.projection;
  if (projection.kind === 'perspective') {
    projection.aspect = aspect;
    return;
  }
  projection.halfWidth = projection.halfHeight * aspect;
}

// Sets the camera's per-frame sub-pixel jitter offset (in NDC), in place. TAA reads this when
// building the jittered projection matrix.
export function setCameraJitter(camera: Camera, x: number, y: number): void {
  camera.jitter.x = x;
  camera.jitter.y = y;
}

// Builds the camera's world->view matrix in place from an eye position, a look-at target, and an
// up vector (right-handed look-at). This is the common path for positioning a camera without an
// explicit world transform.
//
// Reads all vector inputs before writing, so it is safe when the vectors alias one another.
export function setCameraViewMatrix4FromLookAt(
  camera: Camera,
  eye: Readonly<Vector3Like>,
  target: Readonly<Vector3Like>,
  up: Readonly<Vector3Like>,
): void {
  setMatrix4LookAt(camera.view, eye, target, up);
}

// Copies a precomputed world->view matrix into the camera in place. Use this when the view matrix
// is derived elsewhere (for example, the inverse of a scene node's world transform).
export function setCameraViewMatrix4FromMatrix4(camera: Camera, view: Readonly<Matrix4Like>): void {
  camera.view.m.set(view.m);
}

// Recomputes and stores the inverse view-projection into camera.inverseViewProjection for the
// given aspect. Returns true on success or false when the matrix is non-invertible (leaving the
// cached field untouched). `aspect` is viewport width / height.
//
// Call this once per frame after setting the view matrix and before any effects that read
// camera.inverseViewProjection (TAA, velocity, fog, depth-of-field).
export function updateCameraInverseViewProjection(camera: Camera, aspect: number): boolean {
  // Write into a scratch first so the cache is never clobbered with NaN on failure.
  const ok = getCameraInverseViewProjectionMatrix4(__scratchInverse, camera, aspect);
  if (ok) {
    camera.inverseViewProjection.m.set(__scratchInverse.m);
  }
  return ok;
}

// Structural inputs for createCamera.
export interface CameraOptions {
  far: number;
  near: number;
  projection: Projection;
}

// Scratch matrices reused by the view-projection helpers. Single-threaded; not re-entrant.
const __scratchInverse = createMatrix4();
const __scratchProjection = createMatrix4();
const __scratchViewProjection = createMatrix4();
