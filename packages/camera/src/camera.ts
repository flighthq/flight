import { createEntity } from '@flighthq/entity/contract';
import {
  createMatrix4,
  createVector2,
  inverseMatrix4,
  multiplyMatrix4,
  setMatrix4LookAt,
} from '@flighthq/geometry/contract';
import type { Camera3D, Camera3DOptions, Matrix4Like, Vector3Like } from '@flighthq/types/contract';

import { setProjectionMatrix4 } from './projection';

// Allocates a 3D camera. The camera stores its projection descriptor, a world->view Matrix4
// (`view`, initialized to identity), the clip-plane distances `near`/`far`, the per-frame
// sub-pixel NDC `jitter` (applied to every projection, initialized to zero), and the last
// `inverseViewProjection` computed for a reconstruction pass (initialized to identity). The view
// matrix is canonical: the camera has no separate Transform3D — a Matrix4 is the only world->view
// representation.
export function createCamera3D(opts: Readonly<Camera3DOptions>): Camera3D {
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
// is the viewport width / height. Skybox and other world-position reconstruction passes use this
// calculation to refresh Camera3D.inverseViewProjection immediately before consuming it.
//
// Reads camera fields into a scratch matrix before writing `out`, so it is safe even if `out`
// aliases the camera's own `inverseViewProjection` or `view`.
export function getCamera3DInverseViewProjectionMatrix4(
  out: Matrix4Like,
  camera: Readonly<Camera3D>,
  aspect: number,
): boolean {
  getCamera3DViewProjectionMatrix4(__scratchViewProjection, camera, aspect);
  return inverseMatrix4(out, __scratchViewProjection);
}

// Writes the camera's view-projection matrix (projection × view) into `out`. `aspect` is the
// viewport width / height, applied to a perspective projection. `near`/`far` are taken from the
// camera.
//
// Reads camera fields into a scratch matrix before writing `out`, so it is safe even if `out`
// aliases the camera's own `view`.
export function getCamera3DViewProjectionMatrix4(out: Matrix4Like, camera: Readonly<Camera3D>, aspect: number): void {
  setProjectionMatrix4(__scratchProjection, camera.projection, aspect, camera.near, camera.far);
  applyCamera3DProjectionJitter(__scratchProjection, camera.jitter.x, camera.jitter.y);
  multiplyMatrix4(out, __scratchProjection, camera.view);
}

// Sets the viewport aspect ratio (width / height) on the camera's projection, in place. For a
// perspective projection this writes `aspect` directly; for an orthographic projection it widens
// the view volume to match — keeping `halfHeight` and setting `halfWidth = halfHeight * aspect`,
// so the vertical extent is preserved as the viewport resizes. The authored counterpart to the
// `aspect` argument `getCamera3DViewProjectionMatrix4` takes: set it once on resize rather than
// reaching into `camera.projection` with a cast.
export function setCamera3DAspect(camera: Camera3D, aspect: number): void {
  const projection = camera.projection;
  if (projection.kind === 'perspective') {
    projection.aspect = aspect;
    return;
  }
  projection.halfWidth = projection.halfHeight * aspect;
}

// Sets the camera's per-frame sub-pixel jitter offset (in NDC), in place. Every view-projection
// helper applies it to clip X/Y before the perspective divide.
export function setCamera3DJitter(camera: Camera3D, x: number, y: number): void {
  camera.jitter.x = x;
  camera.jitter.y = y;
}

// The seam the guard layer installs into; `null` keeps this module free of message text and of any
// dependency on @flighthq/log. Installed here rather than at each consumer because the precondition is a
// fact about the CAMERA — reporting it once where the matrix enters beats one warning per consumer that
// happens to rely on it.
export function setCamera3DViewGuard(guard: ((camera: Readonly<Camera3D>) => void) | null): void {
  camera3DViewGuard = guard;
}

// Builds the camera's world->view matrix in place from an eye position, a look-at target, and an
// up vector (right-handed look-at). This is the common path for positioning a camera without an
// explicit world transform.
//
// Reads all vector inputs before writing, so it is safe when the vectors alias one another.
export function setCamera3DViewMatrix4FromLookAt(
  camera: Camera3D,
  eye: Readonly<Vector3Like>,
  target: Readonly<Vector3Like>,
  up: Readonly<Vector3Like>,
): void {
  setMatrix4LookAt(camera.view, eye, target, up);
}

// Copies a precomputed world->view matrix into the camera in place. Use this when the view matrix
// is derived elsewhere (for example, the inverse of a scene node's world transform).
//
// ★ PRECONDITION: `view` must be ORTHONORMAL — a rigid placement, position and orientation only. A view
// matrix is the inverse of a camera's world placement, and a placement does not scale; this is what the
// term means everywhere (Unity `worldToCameraMatrix`, Unreal's view matrix), not a Flight restriction.
// Reflections are FINE: an improper orthogonal matrix (det = -1, as a water or mirror camera produces)
// is still orthogonal, so Rᵀ is still R⁻¹ and every consumer that relies on the transpose stays exact.
// What is excluded is a SCALED view, which has no coherent meaning as a placement inverse.
//
// The precondition is not enforced here — checking it on every assignment would cost every correct
// caller for the benefit of an incorrect one. `explainCamera3DView` reports it on demand, and
// `enableCameraGuards` warns on it; consumers such as `getCamera3DPosition` simply rely on it.
export function setCamera3DViewMatrix4FromMatrix4(camera: Camera3D, view: Readonly<Matrix4Like>): void {
  camera.view.m.set(view.m);
  camera3DViewGuard?.(camera);
}

// Refreshes the camera's required inverse-view-projection cache for the supplied viewport aspect.
// Returns true on success or false when projection×view is non-invertible, leaving the prior valid
// cache untouched. Reconstruction consumers call this immediately before reading the field so it
// cannot silently drift after mutable camera inputs change.
export function updateCamera3DInverseViewProjection(camera: Readonly<Camera3D>, aspect: number): boolean {
  const ok = getCamera3DInverseViewProjectionMatrix4(__scratchInverse, camera, aspect);
  if (ok) camera.inverseViewProjection.m.set(__scratchInverse.m);
  return ok;
}

// Applies an NDC translation to a projection matrix: clip.xy += jitter * clip.w. Expressing it as
// row operations handles perspective (offset in m[8]/m[9]) and orthographic (m[12]/m[13]) matrices
// uniformly.
function applyCamera3DProjectionJitter(out: Matrix4Like, x: number, y: number): void {
  const m = out.m;
  m[0] += x * m[3];
  m[4] += x * m[7];
  m[8] += x * m[11];
  m[12] += x * m[15];
  m[1] += y * m[3];
  m[5] += y * m[7];
  m[9] += y * m[11];
  m[13] += y * m[15];
}

// Scratch matrices reused by the view-projection helpers. Single-threaded; not re-entrant.
const __scratchInverse = createMatrix4();
const __scratchProjection = createMatrix4();
const __scratchViewProjection = createMatrix4();

let camera3DViewGuard: ((camera: Readonly<Camera3D>) => void) | null = null;
