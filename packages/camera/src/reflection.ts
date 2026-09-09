import { createMatrix4, multiplyMatrix4, setMatrix4 } from '@flighthq/geometry/contract';
import type { Camera3D, Matrix4Like, PlaneLike } from '@flighthq/types/contract';

// Modifies a projection matrix so the near clip plane aligns with an arbitrary plane in view
// space. This is the Lengyel oblique near-plane technique: the third row of the projection
// matrix is replaced so that the given plane becomes the near plane. The far plane shifts to
// accommodate, which compresses depth precision — acceptable for planar reflections where the
// reflected geometry sits close to the clip plane.
//
// `projection` is mutated in place. `viewSpacePlane` is the clip plane in view-space
// coordinates (normal pointing INTO the visible half-space, d = -dot(normal, pointOnPlane)).
// Requires a standard perspective or orthographic matrix (m[3]=0, m[7]=0, m[11]=-1 or 0,
// m[15]=0 or 1).
export function applyObliqueNearClipPlane(projection: Matrix4Like, viewSpacePlane: Readonly<PlaneLike>): void {
  const m = projection.m;
  const cx = viewSpacePlane.a;
  const cy = viewSpacePlane.b;
  const cz = viewSpacePlane.c;
  const cw = viewSpacePlane.d;

  const qx = (_sgn(cx) + m[8]) / m[0];
  const qy = (_sgn(cy) + m[9]) / m[5];
  const qz = -1;
  const qw = (1 + m[10]) / m[14];

  const k = 2 / (cx * qx + cy * qy + cz * qz + cw * qw);

  m[2] = k * cx - m[3];
  m[6] = k * cy - m[7];
  m[10] = k * cz - m[11];
  m[14] = k * cw - m[15];
}

// Computes a reflected camera view across an arbitrary plane. The reflected camera's view
// matrix is the original view reflected through the plane — standard mirror-camera math.
// `plane` is in world space, normal (a, b, c) should be unit-length.
//
// Writes view, near, far, jitter, and projection into `out`. Alias-safe: reads all inputs
// before writing any output.
export function reflectCamera3DByPlane(out: Camera3D, camera: Readonly<Camera3D>, plane: Readonly<PlaneLike>): void {
  const pa = plane.a;
  const pb = plane.b;
  const pc = plane.c;
  const pd = plane.d;
  const near = camera.near;
  const far = camera.far;
  const jx = camera.jitter.x;
  const jy = camera.jitter.y;
  const projection = camera.projection;

  setMatrix4(
    __scratchReflection,
    1 - 2 * pa * pa,
    -2 * pa * pb,
    -2 * pa * pc,
    0,
    -2 * pa * pb,
    1 - 2 * pb * pb,
    -2 * pb * pc,
    0,
    -2 * pa * pc,
    -2 * pb * pc,
    1 - 2 * pc * pc,
    0,
    -2 * pa * pd,
    -2 * pb * pd,
    -2 * pc * pd,
    1,
  );
  multiplyMatrix4(out.view, camera.view, __scratchReflection);

  out.near = near;
  out.far = far;
  out.jitter.x = jx;
  out.jitter.y = jy;
  out.projection = projection;
}

function _sgn(x: number): number {
  return x < 0 ? -1 : 1;
}

const __scratchReflection = createMatrix4();
